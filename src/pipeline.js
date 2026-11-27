// End-to-end hands-free Short generator & YouTube auto-publisher.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ALL_STYLES, JOBS_DIR, PYTHON_BIN, SKILL_DIR } from './config.js';
import { writeProjectFiles } from './directors/index.js';
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
    // 1. Strictly unique story blueprint (Ollama -> Gemini -> Unused Verified Bank)
    const { story, generatedBy } = await generateUniqueStory(chosenStyle, { forceSource });
    markStoryUsed(story.key, story.title);
    upsertJob({
      id: jobId,
      title: story.title,
      hookText: story.hookText,
      description: story.description,
      tags: story.tags,
      categoryId: story.categoryId,
      generatedBy,
      stage: 'Scaffolding project & compiling shots...',
      status: 'scaffolding',
    });
    addLog('INFO', `Story ready (${generatedBy}): "${story.title}"`, jobId);

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

    // 4. Local Kokoro TTS voice synthesis
    upsertJob({ id: jobId, status: 'voice', stage: 'Synthesizing local Kokoro AI voice...' });
    await runCmd(PYTHON_BIN, [path.join(SKILL_DIR, 'scripts', 'voice.py'), projDir], { cwd: projDir });

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
      timeoutMs: 1_800_000,
    });

    const rawVideoPath = path.join(projDir, 'renders', 'video.mp4');
    let videoPath = rawVideoPath;

    // 8b. Enforce strict YouTube Shorts compliance (1080x1920 9:16, <= 59s, high-bitrate H.264) + 1-frame (0.04s) cover anchor at 0:00 (instant motion, zero swipe-away lag!)
    if (st.settings.bakeVerticalCover !== false && fs.existsSync(coverPath)) {
      const coveredPath = path.join(projDir, 'renders', 'short.mp4');
      try {
        await runCmd('ffmpeg', [
          '-y', '-v', 'error',
          '-loop', '1', '-t', '0.04', '-framerate', String(cloudEnv.FPS), '-i', coverPath,
          '-f', 'lavfi', '-t', '0.04', '-i', 'anullsrc=r=48000:cl=stereo',
          '-i', rawVideoPath,
          '-filter_complex',
          '[0:v]scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p[cv];[2:v]scale=1080:1920:flags=lanczos,setsar=1,format=yuv420p[mv];[cv][1:a][mv][2:a]concat=n=2:v=1:a=1[v][a]',
          '-map', '[v]', '-map', '[a]',
          '-t', '59',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-profile:v', 'high', '-level', '4.2', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
          coveredPath,
        ], { cwd: projDir, timeoutMs: 240_000 });
        if (fs.existsSync(coveredPath) && fs.statSync(coveredPath).size > 100_000) {
          videoPath = coveredPath;
        }
      } catch (err) {
        addLog('WARN', `Cover bake skipped (using original 9:16 MP4): ${err.message}`, jobId);
      }
    }

    const sizeMb = +(fs.statSync(videoPath).size / (1024 * 1024)).toFixed(2);
    const linesJson = JSON.parse(fs.readFileSync(path.join(projDir, 'data', 'lines.json'), 'utf8'));
    const durationSec = Number(linesJson.duration || 0);

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
