// Shorts Autopilot Local Web Server & API (Node.js 22 native http — zero npm installs required)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ALL_STYLES, APP_ROOT, CHROME_BIN, HOST, PORT, PYTHON_BIN } from './config.js';
import { uploadJobToYouTube } from './pipeline.js';
import { enqueueRun, isBusy, queueLength, scheduleNext, startScheduler, triggerAutopilotToggle } from './scheduler.js';
import { addLog, getAccounts, getActiveAccount, getJob, getState, removeAccount, setActiveAccount, todayStats, updateSettings, updateYouTube, upsertJob } from './store.js';
import { checkOllamaStatus, offlineBankSummary } from './story-engine.js';
import { sendUploadNotification } from './notify.js';
import { attachCoverThumbnail, exchangeCode, getAuthUrl, isYouTubeConnected, redirectUri, refreshAccountInfo } from './youtube.js';

const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.svg': 'image/svg+xml',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 2_000_000) reject(new Error('Body too large')); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function streamFile(req, res, filePath) {
  if (!filePath || !fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(s, 10);
    const end = e ? parseInt(e, 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': type,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = url.pathname;

    // ── API: Live State ──
    if (req.method === 'GET' && pathname === '/api/state') {
      const st = getState();
      const ollama = await checkOllamaStatus(st.settings.ollamaUrl);
      return sendJson(res, 200, {
        settings: st.settings,
        styles: ALL_STYLES,
        styleBag: st.styleBag || [],
        lastStyleId: st.lastStyleId || '',
        stats: todayStats(),
        busy: isBusy(),
        queueLength: queueLength(),
        bank: offlineBankSummary(),
        ollama,
        system: {
          pythonOk: Boolean(PYTHON_BIN),
          chromeOk: Boolean(CHROME_BIN),
          redirectUri: redirectUri(),
        },
        youtube: {
          connected: isYouTubeConnected(),
          hasCredentials: Boolean(st.youtube.clientId && st.youtube.clientSecret),
          clientId: st.youtube.clientId,
          activeAccountId: st.youtube.activeAccountId,
          channelTitle: getActiveAccount()?.channelTitle || getActiveAccount()?.label || '',
          channelId: getActiveAccount()?.channelId || '',
          connectedAt: getActiveAccount()?.connectedAt || null,
          accounts: getAccounts().map((a) => ({
            id: a.id,
            label: a.label,
            email: a.email,
            name: a.name,
            picture: a.picture,
            channelId: a.channelId,
            channelTitle: a.channelTitle,
            channelHandle: a.channelHandle,
            channelThumb: a.channelThumb,
            connectedAt: a.connectedAt,
            apiWarning: a.apiWarning || '',
            enableUrl: a.enableUrl || '',
            active: a.id === st.youtube.activeAccountId,
          })),
        },
        jobs: st.jobs.slice(0, 40),
        logs: st.logs.slice(-60).reverse(),
      });
    }

    // ── API: Update Settings ──
    if (req.method === 'POST' && pathname === '/api/settings') {
      const body = await readBody(req);
      const wasEnabled = getState().settings.autopilotEnabled;
      const patch = {};
      if (typeof body.intervalMinutes === 'number') patch.intervalMinutes = Math.max(10, Math.min(1440, body.intervalMinutes));
      if (typeof body.dailyLimit === 'number') patch.dailyLimit = Math.max(1, Math.min(50, body.dailyLimit));
      if (typeof body.privacyStatus === 'string') patch.privacyStatus = body.privacyStatus;
      if (Array.isArray(body.enabledStyles) && body.enabledStyles.length) patch.enabledStyles = body.enabledStyles;
      if (typeof body.styleOrderMode === 'string') patch.styleOrderMode = body.styleOrderMode;
      if (typeof body.autoPost === 'boolean') patch.autoPost = body.autoPost;
      if (typeof body.requireApproval === 'boolean') patch.requireApproval = body.requireApproval;
      if (typeof body.uploadThumbnail === 'boolean') patch.uploadThumbnail = body.uploadThumbnail;
      if (typeof body.draftMode === 'boolean') patch.draftMode = body.draftMode;
      if (typeof body.ollamaUrl === 'string') patch.ollamaUrl = body.ollamaUrl.trim();
      if (typeof body.ollamaModel === 'string') patch.ollamaModel = body.ollamaModel.trim();
      if (typeof body.geminiApiKey === 'string') patch.geminiApiKey = body.geminiApiKey.trim();
      if (typeof body.geminiModel === 'string') patch.geminiModel = body.geminiModel.trim();
      if (typeof body.storySource === 'string') patch.storySource = body.storySource;
      if (typeof body.nicheTopics === 'string') patch.nicheTopics = body.nicheTopics.trim();
      updateSettings(patch);
      if (typeof body.autopilotEnabled === 'boolean' && body.autopilotEnabled !== wasEnabled) {
        triggerAutopilotToggle(body.autopilotEnabled);
      } else if (getState().settings.autopilotEnabled && typeof body.intervalMinutes === 'number') {
        scheduleNext(body.intervalMinutes);
      }
      return sendJson(res, 200, { ok: true, settings: getState().settings });
    }

    // ── API: YouTube OAuth Credentials & One-Time Sign-In ──
    if (req.method === 'POST' && pathname === '/api/youtube/credentials') {
      const body = await readBody(req);
      updateYouTube({
        clientId: String(body.clientId || '').trim(),
        clientSecret: String(body.clientSecret || '').trim(),
      });
      addLog('INFO', 'Saved YouTube OAuth client credentials.');
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/youtube/auth-url') {
      return sendJson(res, 200, { url: getAuthUrl() });
    }

    if (req.method === 'GET' && pathname === '/api/youtube/callback') {
      const err = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h2>YouTube authorization canceled: ${err}</h2><p><a href="/">Back to Dashboard</a></p>`);
        return;
      }
      await exchangeCode(code);
      res.writeHead(302, { Location: '/?yt=connected' });
      res.end();
      return;
    }

    if (req.method === 'POST' && pathname === '/api/youtube/disconnect') {
      const active = getActiveAccount();
      if (active) removeAccount(active.id);
      addLog('INFO', 'Disconnected active YouTube account.');
      return sendJson(res, 200, { ok: true });
    }

    const acctActMatch = pathname.match(/^\/api\/youtube\/accounts\/([^/]+)\/activate$/);
    if (req.method === 'POST' && acctActMatch) {
      const acct = setActiveAccount(decodeURIComponent(acctActMatch[1]));
      addLog('INFO', `Switched active YouTube account to: ${acct.channelTitle || acct.email || acct.label}`);
      return sendJson(res, 200, { ok: true, account: acct });
    }

    const acctRefMatch = pathname.match(/^\/api\/youtube\/accounts\/([^/]+)\/refresh$/);
    if (req.method === 'POST' && acctRefMatch) {
      const acct = await refreshAccountInfo(decodeURIComponent(acctRefMatch[1]));
      return sendJson(res, 200, { ok: true, account: acct });
    }

    const acctDelMatch = pathname.match(/^\/api\/youtube\/accounts\/([^/]+)$/);
    if (req.method === 'DELETE' && acctDelMatch) {
      const id = decodeURIComponent(acctDelMatch[1]);
      removeAccount(id);
      addLog('INFO', `Removed YouTube account ${id}`);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'GET' && pathname === '/api/youtube/export-env') {
      const st = getState();
      const envText = [
        `YT_CLIENT_ID=${st.youtube.clientId || ''}`,
        `YT_CLIENT_SECRET=${st.youtube.clientSecret || ''}`,
        `YT_REFRESH_TOKEN=${st.youtube.refreshToken || ''}`,
        `GEMINI_API_KEY=${st.settings.geminiApiKey || ''}`,
        `GEMINI_MODEL=${st.settings.geminiModel || 'gemini-flash-lite-latest'}`,
      ].join('\n');
      return sendJson(res, 200, { envText, connected: isYouTubeConnected() });
    }

    // ── API: Test Instant Phone Alert Bot ──
    if (req.method === 'POST' && pathname === '/api/notify/test') {
      const resNotify = await sendUploadNotification({
        title: 'Test Alert — StoryByteStories Bot Active!',
        styleName: 'Shorts Autopilot',
        youtubeUrl: 'https://www.youtube.com/@storybyte_stories/shorts',
        customText: 'Heyyy boss! Your upload alert bot is connected! Every time I post a Short, you will get this message with the direct link.',
      });
      return sendJson(res, 200, { ok: true, ...resNotify });
    }

    // ── API: Run 1 Short, Batch, or Laptop-Off Staggered YouTube Schedule ──
    if (req.method === 'POST' && pathname === '/api/jobs/run') {
      const body = await readBody(req);
      const queued = enqueueRun({
        style: body.style || null,
        upload: body.upload !== false,
        forceSource: body.forceSource || null,
        draft: typeof body.draft === 'boolean' ? body.draft : null,
      });
      return sendJson(res, 200, { ok: true, queued, busy: isBusy() });
    }

    if (req.method === 'POST' && pathname === '/api/jobs/batch') {
      const body = await readBody(req);
      const count = Math.max(1, Math.min(20, Number(body.count || 3)));
      for (let i = 0; i < count; i++) {
        enqueueRun({ upload: body.upload !== false });
      }
      addLog('INFO', `Queued batch of ${count} unique Shorts.`);
      return sendJson(res, 200, { ok: true, count, queueLength: queueLength() });
    }

    if (req.method === 'POST' && pathname === '/api/jobs/schedule-batch') {
      const body = await readBody(req);
      const st = getState();
      const count = Math.max(1, Math.min(20, Number(body.count || 6)));
      const stepMins = Math.max(15, Number(body.intervalMinutes || st.settings.intervalMinutes || 120));
      const startMs = Date.now() + 20 * 60_000; // First scheduled Short 20 min from now, then every stepMins
      const times = [];
      for (let i = 0; i < count; i++) {
        const publishAt = new Date(startMs + i * stepMins * 60_000).toISOString();
        times.push(publishAt);
        enqueueRun({ upload: true, publishAt });
      }
      addLog('INFO', `Queued ${count} unique Shorts scheduled on YouTube every ${stepMins}m (posts even when laptop is OFF!).`);
      return sendJson(res, 200, { ok: true, count, times, queueLength: queueLength() });
    }

    // ── API: Retry / Trigger Upload for a specific rendered job ──
    const uploadMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/upload$/);
    if (req.method === 'POST' && uploadMatch) {
      const job = await uploadJobToYouTube(decodeURIComponent(uploadMatch[1]));
      return sendJson(res, 200, { ok: true, job });
    }

    // ── API: Attach 9:16 Cover Thumbnail to a manually uploaded YouTube Short (only 50 API units!) ──
    const attachThumbMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/attach-thumbnail$/);
    if (req.method === 'POST' && attachThumbMatch) {
      const id = decodeURIComponent(attachThumbMatch[1]);
      const job = getJob(id);
      if (!job) return sendJson(res, 404, { error: 'Job not found' });
      const body = await readBody(req);
      const targetId = body.videoIdOrUrl || job.youtubeId || job.youtubeUrl;
      const resThumb = await attachCoverThumbnail({
        videoIdOrUrl: targetId,
        thumbnailPath: job.coverPath || job.thumbPath,
      });
      const updated = upsertJob({
        id,
        youtubeId: resThumb.videoId,
        youtubeUrl: resThumb.url,
        thumbnailUploaded: true,
        thumbnailNote: 'Vertical 9:16 Shorts cover attached (50 units)',
        status: job.status === 'posted' ? 'posted' : 'manual_posted',
        stage: job.status === 'posted' ? 'Live on YouTube (with vertical cover)' : 'Manually posted + Vertical cover attached',
        manualPostedAt: job.manualPostedAt || new Date().toISOString(),
      });
      addLog('INFO', `Attached vertical 9:16 cover thumbnail to ${resThumb.url}`, id);
      return sendJson(res, 200, { ok: true, job: updated });
    }

    // ── API: Mark a rendered job as Manually Uploaded (0 API quota tracker) ──
    const manualMarkMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/mark-manual$/);
    if (req.method === 'POST' && manualMarkMatch) {
      const id = decodeURIComponent(manualMarkMatch[1]);
      const job = getJob(id);
      if (!job) return sendJson(res, 404, { error: 'Job not found' });
      const nextPosted = job.status !== 'manual_posted';
      const updated = upsertJob({
        id,
        status: nextPosted ? 'manual_posted' : 'completed',
        stage: nextPosted ? 'Manually posted on YouTube Studio (0 API quota)' : 'Ready for manual upload',
        manualPostedAt: nextPosted ? new Date().toISOString() : null,
      });
      addLog('INFO', `${nextPosted ? 'Marked as manually posted' : 'Unmarked manual post'}: "${job.title || id}"`, id);
      return sendJson(res, 200, { ok: true, job: updated });
    }

    // ── API: Open rendered Short folder in File Explorer for drag-and-drop to YouTube Studio ──
    const openFolderMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/open-folder$/);
    if (req.method === 'POST' && openFolderMatch) {
      const job = getJob(decodeURIComponent(openFolderMatch[1]));
      if (!job) return sendJson(res, 404, { error: 'Job not found' });
      const target = (job.videoPath && fs.existsSync(job.videoPath)) ? job.videoPath : job.projDir;
      if (!target || !fs.existsSync(target)) return sendJson(res, 404, { error: 'Folder not found on disk' });
      if (process.platform === 'win32') {
        spawn('explorer.exe', job.videoPath && fs.existsSync(job.videoPath) ? [`/select,${target}`] : [target], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'darwin') {
        spawn('open', ['-R', target], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('xdg-open', [path.dirname(target)], { detached: true, stdio: 'ignore' }).unref();
      }
      return sendJson(res, 200, { ok: true, path: target });
    }

    // ── Media files & Direct Download for Manual YouTube Studio Upload ──
    const downloadMatch = pathname.match(/^\/media\/([^/]+)\/(download|download-cover)$/);
    if (req.method === 'GET' && downloadMatch) {
      const job = getJob(decodeURIComponent(downloadMatch[1]));
      if (!job) { res.writeHead(404); res.end('Job not found'); return; }
      const isCover = downloadMatch[2] === 'download-cover';
      const target = isCover ? job.coverPath : job.videoPath;
      if (!target || !fs.existsSync(target)) { res.writeHead(404); res.end('File not found'); return; }
      const slug = String(job.title || job.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || job.id;
      const fname = isCover ? `${slug}-cover.jpg` : `${slug}-short.mp4`;
      const stat = fs.statSync(target);
      res.writeHead(200, {
        'Content-Type': isCover ? 'image/jpeg' : 'video/mp4',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${fname}"`,
        'Cache-Control': 'no-store',
      });
      fs.createReadStream(target).pipe(res);
      return;
    }

    const mediaMatch = pathname.match(/^\/media\/([^/]+)\/(video\.mp4|cover\.jpg|thumbnail\.jpg)$/);
    if (req.method === 'GET' && mediaMatch) {
      const job = getJob(decodeURIComponent(mediaMatch[1]));
      if (!job) { res.writeHead(404); res.end('Job not found'); return; }
      const target = mediaMatch[2] === 'video.mp4' ? job.videoPath
        : mediaMatch[2] === 'cover.jpg' ? job.coverPath : job.thumbPath;
      return streamFile(req, res, target);
    }

    // ── Static Dashboard UI ──
    const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const file = path.resolve(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    return streamFile(req, res, file);
  } catch (err) {
    console.error('[server error]', err);
    sendJson(res, 500, { error: err.message });
  }
});

startScheduler();
server.listen(PORT, HOST, () => {
  addLog('INFO', `Shorts Autopilot running at http://${HOST}:${PORT}`);
  console.log(`\n  Shorts Autopilot Dashboard → http://${HOST}:${PORT}\n`);
});
