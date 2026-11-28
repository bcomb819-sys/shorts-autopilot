// End-to-end hands-free Short generator & YouTube auto-publisher.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_STYLES, JOBS_DIR, PYTHON_BIN, SKILL_DIR } from './config.js';
import { buildScriptJson, writeProjectFiles } from './directors/index.js';
import { addLog, getJob, getState, markStoryUsed, nextStyleId, upsertJob } from './store.js';
import { generateUniqueStory } from './story-engine.js';
import { generateThumbnails } from './thumbnail.js';
import { sendUploadNotification } from './notify.js';
import { isYouTubeConnected, uploadShort } from './youtube.js';

function runCmd(bin, args, { cwd, env = {}, timeoutMs = 420_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, ...env },
      windowsHide: true,
    });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      reject(new Error(`Command timed out after ${Math.round(timeoutMs / 1000)}s: ${bin} ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Exit ${code} from ${path.basename(bin)} ${args[0] || ''}: ${(stderr || stdout).slice(-500)}`));
    });
  });
}

function copyDir(src, dst) {
  fs.cpSync(src, dst, { recursive: true, force: true });
}

export async function runShortPipeline({ style = null, upload = true, forceSource = null, draft = null, publishAt = null } = {}) {
  const st = getState();
  const chosenStyle = style || nextStyleId();
  const styleMeta = ALL_STYLES.find((s) => s.id === chosenStyle) || ALL_STYLES[0];
  const jobId = `${Date.now().toString(36)}-${chosenStyle}`;
  const projDir = path.join(JOBS_DIR, jobId);

  upsertJob({
    id: jobId,
    style: chosenStyle,
    styleName: styleMeta.name,
    status: 'generating_story',
    stage: 'Generating unique story...',
    projDir,
    publishAt: publishAt || null,
  });
  addLog('INFO', `Starting automated ${styleMeta.name} pipeline${publishAt ? ` (scheduled for ${publishAt})` : ''}`, jobId);

  try {
    // 1. Strictly unique 60-second animated mini-movie blueprint (Ollama -> Gemini -> Unused Bank)
    const { story, generatedBy } = await generateUniqueStory(chosenStyle, { forceSource });
    markStoryUsed(story.key, story.title, story);
    upsertJob({
      id: jobId,
      title: story.title,
      genre: story.genre || '',
      summary: story.summary || '',
      hookText: story.hookText,
      description: story.description,
      tags: story.tags,
      categoryId: story.categoryId,
      generatedBy,
      stage: 'Scaffolding project & compiling shots...',
      status: 'scaffolding',
    });
    addLog('INFO', `Story ready (${generatedBy}, ${story.genre || chosenStyle}, ${story.wordCount || '?'}w): "${story.title}"`, jobId);

    // 2. Scaffold style example into project directory
    const exampleSrc = path.join(SKILL_DIR, 'styles', story.style, 'example');
    if (!fs.existsSync(exampleSrc)) throw new Error(`Skill style folder not found: ${exampleSrc}`);
    copyDir(exampleSrc, projDir);
    fs.mkdirSync(path.join(projDir, 'renders'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'review'), { recursive: true });
    ['narration.wav', 'mix.wav', 'lines.json', 'words.json', 'words.txt', 'cues.json'].forEach((f) => {
      try { fs.rmSync(path.join(projDir, 'data', f), { force: true }); } catch {}
    });

    // 3. Compile script.json + src/shots.js
    writeProjectFiles(projDir, story);

    // 4. Local Kokoro TTS voice synthesis + automatic 60.00-second pacing calibration
    upsertJob({ id: jobId, status: 'voice', stage: 'Synthesizing local Kokoro AI voice (targeting exact 60s)...' });
    await runCmd(PYTHON_BIN, [path.join(SKILL_DIR, 'scripts', 'voice.py'), projDir], { cwd: projDir });

    const TARGET_AUDIO_SEC = 58.95; // Leaves ~1.0s clean outro beat so the final ending line NEVER cuts off at 60.00s!
    let linesMeta = JSON.parse(fs.readFileSync(path.join(projDir, 'data', 'lines.json'), 'utf8'));
    let rawDur = Number(linesMeta.duration || 0);
    for (let calPass = 1; calPass <= 2 && rawDur > 0 && (rawDur < 57.2 || rawDur > 59.65); calPass++) {
      const curScript = JSON.parse(fs.readFileSync(path.join(projDir, 'script.json'), 'utf8'));
      const lineCount = Math.max(1, (curScript.lines || []).length);
      const curSpeed = Number(curScript.speed || styleMeta.speed || 1.0);
      const curGapsTotal = (curScript.lead || 0.12) + (curScript.outro || 0.45) + (curScript.gap || 0.16) * Math.max(0, lineCount - 1);
      const speechOnly = Math.max(10, rawDur - curGapsTotal);

      let nextSpeed = curSpeed;
      let nextGap = curScript.gap || 0.16;
      let nextOutro = curScript.outro || 0.45;
      let nextLead = curScript.lead || 0.12;

      if (rawDur > 59.65) {
        // Trim gaps first, then smoothly speed up so the complete ending finishes cleanly BEFORE 60.00s (zero cutoff!)
        nextGap = 0.08;
        nextLead = 0.06;
        nextOutro = 0.35;
        const availSpeech = TARGET_AUDIO_SEC - (nextLead + nextOutro + nextGap * Math.max(0, lineCount - 1));
        nextSpeed = Math.min(1.28, Math.max(0.85, curSpeed * (speechOnly / Math.max(20, availSpeech))));
      } else {
        // Natural conversational pacing to fill ~58.95s smoothly without awkward silences
        const ratio = TARGET_AUDIO_SEC / rawDur;
        nextSpeed = Math.max(0.86, Math.min(1.08, curSpeed / Math.min(ratio, 1.18)));
        const estSpeech = speechOnly * (curSpeed / nextSpeed);
        const remaining = Math.max(1.2, TARGET_AUDIO_SEC - estSpeech - nextLead);
        nextGap = Math.min(0.54, Math.max(0.15, (remaining - 0.85) / Math.max(1, lineCount)));
        nextOutro = Math.min(1.8, Math.max(0.45, remaining - nextGap * Math.max(0, lineCount - 1)));
      }

      const calibrated = buildScriptJson(story, { speed: nextSpeed, gap: nextGap, lead: nextLead, outro: nextOutro, endGap: Math.min(0.45, nextGap) });
      fs.writeFileSync(path.join(projDir, 'script.json'), JSON.stringify(calibrated, null, 2));
      addLog('INFO', `Calibrating voice pacing pass ${calPass} (${rawDur.toFixed(2)}s -> 60s target: speed=${calibrated.speed}x, gap=${calibrated.gap}s, outro=${calibrated.outro}s)...`, jobId);
      await runCmd(PYTHON_BIN, [path.join(SKILL_DIR, 'scripts', 'voice.py'), projDir], { cwd: projDir });
      linesMeta = JSON.parse(fs.readFileSync(path.join(projDir, 'data', 'lines.json'), 'utf8'));
      rawDur = Number(linesMeta.duration || 0);
      addLog('INFO', `Calibrated voice duration (pass ${calPass}): ${rawDur.toFixed(2)}s`, jobId);
    }

    // 5. Local Whisper word-level subtitle alignment
    upsertJob({ id: jobId, status: 'subtitles', stage: 'Aligning word-synced captions with Whisper...' });
    await runCmd(PYTHON_BIN, [path.join(SKILL_DIR, 'scripts', 'words.py'), projDir], { cwd: projDir });

    // 6. Shot check + audio cues + numpy sound/music mix (fast low-res WebGL for validation only)
    upsertJob({ id: jobId, status: 'mixing', stage: 'Validating shots & mixing soundtrack...' });
    const fastCheckEnv = { QS: '&res=0.25&aa=0&shadow=256' };
    const chk = await runCmd(process.execPath, ['tools/capture.mjs', 'check'], { cwd: projDir, env: fastCheckEnv });
    if (!chk.stdout.includes('CHECK OK')) throw new Error(`Shot check failed: ${chk.stdout.slice(-300)}`);
    await runCmd(process.execPath, ['tools/capture.mjs', 'cues'], { cwd: projDir, env: fastCheckEnv });
    await runCmd(PYTHON_BIN, ['tools/mix.py', '.'], { cwd: projDir });

    // 7. Capture ultra-sharp hero frame (1 frame at full 1080x1920 + MSAA) & compose vertical Cover + Thumbnail
    upsertJob({ id: jobId, status: 'thumbnail', stage: 'Creating eye-catching cover & thumbnail...' });
    await runCmd(process.execPath, ['tools/capture.mjs', 'frames', 'review/hero', '1.8'], {
      cwd: projDir,
      env: { QS: '&res=1&aa=2&shadow=2048' },
    });
    const heroFramePath = path.join(projDir, 'review', 'hero', 't1.80.jpg');
    const { coverPath, thumbPath } = await generateThumbnails({
      heroFramePath,
      hookText: story.hookText,
      title: story.title,
      style: story.style,
      outDir: path.join(projDir, 'renders'),
    });
    upsertJob({ id: jobId, coverPath, thumbPath });

    // 8. Render final full-HD 1080x1920 MP4 (native res=1, 30 fps for 2D / 24 fps crisp 1080p for CPU 3D)
    const useDraft = draft !== null ? draft : Boolean(st.settings.draftMode);
    const is3d = ['tall-tale', 'deep-dive', 'night-file'].includes(story.style);
    const cloudEnv = process.env.SOFTWARE_GL
      ? {
          SOFTWARE_GL: process.env.SOFTWARE_GL,
          QS: process.env.QS || '&res=1&aa=0&shadow=1024',
          FPS: String(is3d ? (process.env.FPS_3D || 24) : (process.env.FPS || 30)),
        }
      : { QS: process.env.QS || '&res=1&aa=4&shadow=2048', FPS: String(process.env.FPS || styleMeta.fps || 30) };
    upsertJob({ id: jobId, status: 'rendering', stage: `Rendering Full HD 1080x1920 MP4 (${cloudEnv.FPS} fps)...` });
    const videoArgs = ['tools/capture.mjs', 'video', 'renders/video.mp4'];
    if (useDraft) videoArgs.push('--draft');
    await runCmd(process.execPath, videoArgs, {
      cwd: projDir,
      env: cloudEnv,
      timeoutMs: 2_400_000,
    });

    const rawVideoPath = path.join(projDir, 'renders', 'video.mp4');
    let videoPath = rawVideoPath;

    // 8b. Enforce EXACT 60.00-second YouTube Shorts master (1080x1920 9:16, high-bitrate H.264, stereo AAC)
    //     with 1-frame (0.04s) cover anchor at 0:00 and clean hold-pad/exact trim to 60.00s.
    const coveredPath = path.join(projDir, 'renders', 'short.mp4');
    const useCover = st.settings.bakeVerticalCover !== false && fs.existsSync(coverPath);
    try {
      const ffArgs = useCover
        ? [
            '-y', '-v', 'error',
            '-loop', '1', '-t', '0.04', '-framerate', String(cloudEnv.FPS), '-i', coverPath,
            '-f', 'lavfi', '-t', '0.04', '-i', 'anullsrc=r=48000:cl=stereo',
            '-i', rawVideoPath,
            '-filter_complex',
            `[0:v]scale=1080:1920:flags=lanczos,setsar=1,fps=${cloudEnv.FPS},format=yuv420p[cv];[2:v]scale=1080:1920:flags=lanczos,setsar=1,fps=${cloudEnv.FPS},format=yuv420p[mv];[cv][1:a][mv][2:a]concat=n=2:v=1:a=1[vc][ac];[vc]tpad=stop_mode=clone:stop_duration=15[v];[ac]apad=whole_dur=60[a]`,
            '-map', '[v]', '-map', '[a]',
            '-t', '60.000',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
            coveredPath,
          ]
        : [
            '-y', '-v', 'error',
            '-i', rawVideoPath,
            '-filter_complex',
            `[0:v]scale=1080:1920:flags=lanczos,setsar=1,fps=${cloudEnv.FPS},format=yuv420p,tpad=stop_mode=clone:stop_duration=15[v];[0:a]apad=whole_dur=60[a]`,
            '-map', '[v]', '-map', '[a]',
            '-t', '60.000',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
            coveredPath,
          ];
      await runCmd('ffmpeg', ffArgs, { cwd: projDir, timeoutMs: 300_000 });
      if (fs.existsSync(coveredPath) && fs.statSync(coveredPath).size > 100_000) {
        videoPath = coveredPath;
      }
    } catch (err) {
      addLog('WARN', `Exact-60s master pass warning (using raw 9:16 MP4): ${err.message}`, jobId);
    }

    const sizeMb = +(fs.statSync(videoPath).size / (1024 * 1024)).toFixed(2);
    let durationSec = Number(rawDur || 60);
    try {
      const probe = await runCmd('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath], { cwd: projDir, timeoutMs: 15_000 });
      const parsed = Number(probe.stdout.trim());
      if (Number.isFinite(parsed) && parsed > 0) durationSec = +parsed.toFixed(2);
    } catch {}

    upsertJob({
      id: jobId,
      videoPath,
      sizeMb,
      durationSec,
      status: 'rendered',
      stage: `Rendered (${durationSec.toFixed(1)}s, ${sizeMb} MB)`,
    });
    addLog('INFO', `Rendered "${story.title}" (${durationSec.toFixed(1)}s, ${sizeMb} MB)`, jobId);

    // 9. Hands-free auto-upload to YouTube (ZERO approval required!)
    const shouldUpload = upload && st.settings.autoPost && !st.settings.requireApproval;
    if (shouldUpload && isYouTubeConnected()) {
      await uploadJobToYouTube(jobId, { publishAt });
    } else if (shouldUpload && !isYouTubeConnected()) {
      upsertJob({ id: jobId, status: 'ready_no_yt', stage: 'Rendered locally (connect YouTube once to auto-post)' });
      addLog('WARN', 'Rendered locally — connect YouTube once in Dashboard to enable auto-posting', jobId);
    } else {
      upsertJob({ id: jobId, status: 'completed', stage: 'Rendered locally (preview mode)' });
    }

    return getJob(jobId);
  } catch (err) {
    upsertJob({ id: jobId, status: 'failed', stage: 'Failed', error: err.message });
    addLog('ERROR', `Pipeline failed: ${err.message}`, jobId);
    throw err;
  }
}

export async function uploadJobToYouTube(jobId, { publishAt = null, accountId = null } = {}) {
  const job = getJob(jobId);
  if (!job || !job.videoPath || !fs.existsSync(job.videoPath)) {
    throw new Error('Rendered video file not found for job ' + jobId);
  }
  const st = getState();
  const schedTime = publishAt || job.publishAt || null;
  upsertJob({ id: jobId, status: 'uploading', error: null, stage: schedTime ? `Scheduling on YouTube for ${schedTime}...` : 'Auto-uploading to YouTube (no approval)...' });
  addLog('INFO', `Uploading "${job.title}" to YouTube (${schedTime ? `scheduled ${schedTime}` : st.settings.privacyStatus})...`, jobId);

  try {
    const res = await uploadShort({
      videoPath: job.videoPath,
      // Send the 9:16 vertical 1080x1920 cover.jpg (NOT 16:9) AFTER YouTube finishes processing the Short
      thumbnailPath: st.settings.uploadThumbnail !== false ? (job.coverPath || job.thumbPath) : null,
      title: job.title,
      description: job.description,
      tags: job.tags,
      categoryId: job.categoryId || '27',
      privacyStatus: st.settings.privacyStatus || 'public',
      publishAt: schedTime,
      accountId,
    });

    upsertJob({
      id: jobId,
      status: schedTime ? 'scheduled' : 'posted',
      stage: schedTime
        ? `Scheduled on YouTube (${new Date(schedTime).toLocaleString()})`
        : (res.thumbnailUploaded ? 'Live on YouTube (with thumbnail)' : 'Live on YouTube'),
      youtubeId: res.videoId,
      youtubeUrl: res.url,
      thumbnailUploaded: res.thumbnailUploaded,
      thumbnailNote: res.thumbnailNote,
      postedAt: new Date().toISOString(),
      error: null,
    });
    addLog('INFO', `${schedTime ? 'Scheduled' : 'Published'} on YouTube: ${res.url}${res.thumbnailNote ? ` (${res.thumbnailNote})` : ''}`, jobId);
    // Notify the boss's phone immediately once the video is live!
    await sendUploadNotification({
      title: job.title,
      styleName: job.styleName || job.style,
      youtubeUrl: res.url,
      jobId,
    });
    return getJob(jobId);
  } catch (err) {
    upsertJob({ id: jobId, status: 'failed', stage: 'Upload failed (click Upload to retry)', error: err.message });
    addLog('ERROR', `YouTube upload failed: ${err.message}`, jobId);
    throw err;
  }
}
