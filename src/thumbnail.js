// Eye-catching Cover Page (1080x1920) & YouTube Thumbnail (1280x720) generator using local headless Chrome.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME_BIN } from './config.js';

const STYLE_BADGES = {
  'tall-tale': { label: 'CRAZY TRUE STORY', bg: '#F2C230', fg: '#151320', accent: '#E85D3F' },
  'deep-dive': { label: 'WHAT HAPPENS IF...', bg: '#4FD1E8', fg: '#0B1218', accent: '#FF4B4B' },
  'night-file': { label: 'UNSOLVED FILE', bg: '#D62839', fg: '#FFFFFF', accent: '#F2C230' },
  'inside-out': { label: 'BODY SCIENCE', bg: '#FFD43B', fg: '#141418', accent: '#4FD1E8' },
  'stick-story': { label: 'SURVIVAL GUIDE', bg: '#F2B830', fg: '#141418', accent: '#4CD97B' },
  'paper-atlas': { label: 'WILD HISTORY', bg: '#C93838', fg: '#FFF6E5', accent: '#E6B84A' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

function buildHtml({ imgDataUri, hookText, title, style, width, height }) {
  const meta = STYLE_BADGES[style] || STYLE_BADGES['tall-tale'];
  const isWide = width > height;
  const headline = esc(hookText || title).toUpperCase();
  const sub = esc(title);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: ${width}px; height: ${height}px; overflow: hidden; background: #0c0d14; font-family: 'Segoe UI', Impact, Arial Black, sans-serif; position: relative; }
    .bg-blur { position: absolute; inset: -30px; background: url('${imgDataUri}') center/cover no-repeat; filter: blur(22px) brightness(0.42) saturate(1.25); }
    .hero { position: absolute; ${isWide ? 'right: 48px; top: 24px; bottom: 24px; width: 410px; border-radius: 26px; border: 6px solid rgba(255,255,255,0.92); box-shadow: 0 24px 70px rgba(0,0,0,0.75);' : 'inset: 0;'} background: url('${imgDataUri}') center 38%/cover no-repeat; }
    .grad { position: absolute; inset: 0; background: ${isWide
      ? 'linear-gradient(90deg, rgba(10,11,18,0.95) 0%, rgba(10,11,18,0.82) 56%, rgba(10,11,18,0.12) 100%)'
      : 'linear-gradient(180deg, rgba(8,10,18,0.88) 0%, rgba(8,10,18,0.12) 34%, rgba(8,10,18,0.1) 66%, rgba(8,10,18,0.92) 100%)'}; }
    .content { position: absolute; ${isWide ? 'left: 64px; top: 68px; width: 710px;' : 'left: 54px; right: 54px; top: 64px; text-align: center;'} z-index: 5; }
    .pill { display: inline-block; padding: ${isWide ? '12px 26px' : '14px 32px'}; border-radius: 999px; background: ${meta.bg}; color: ${meta.fg}; font-weight: 900; font-size: ${isWide ? '26px' : '32px'}; letter-spacing: 2px; box-shadow: 0 10px 26px rgba(0,0,0,0.45); border: 4px solid #101018; }
    .hook { margin-top: ${isWide ? '28px' : '22px'}; font-size: ${isWide ? '106px' : '106px'}; line-height: 0.98; font-weight: 900; color: #FFFFFF; text-transform: uppercase; -webkit-text-stroke: ${isWide ? '5px' : '5px'} #0B0B12; text-shadow: 0 14px 32px rgba(0,0,0,0.8); letter-spacing: -1px; }
    .hook span { color: ${meta.bg}; }
    .sub { ${isWide ? 'margin-top: 28px; font-size: 34px; max-width: 680px;' : 'position: fixed; left: 58px; right: 58px; bottom: 72px; text-align: center; font-size: 38px;'} font-weight: 800; color: #F4F5FA; line-height: 1.25; text-shadow: 0 4px 16px rgba(0,0,0,0.95); }
    .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 14px; background: linear-gradient(90deg, ${meta.bg}, ${meta.accent}); z-index: 6; }
  </style></head><body>
    <div class="bg-blur"></div>
    <div class="hero"></div>
    <div class="grad"></div>
    <div class="content">
      <div class="pill">${esc(meta.label)}</div>
      <div class="hook">${headline.split(' ').map((w, i) => (i === headline.split(' ').length - 1 ? `<span>${w}</span>` : w)).join(' ')}</div>
      <div class="sub">${sub}</div>
    </div>
    <div class="bar"></div>
  </body></html>`;
}

async function renderHtmlToJpg(html, width, height, outPath) {
  if (!CHROME_BIN) throw new Error('Chrome not found for thumbnail rendering');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-thumb-'));
  const htmlPath = path.join(prof, 'thumb.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    ...(process.platform === 'linux' || process.env.CHROME_NO_SANDBOX ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });

  let dbg;
  for (let i = 0; i < 120 && !dbg; i++) {
    try { dbg = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { await sleep(80); }
  }
  if (!dbg) { chrome.kill('SIGKILL'); throw new Error('Chrome thumbnail instance did not start'); }

  const url = 'file:///' + htmlPath.replace(/\\/g, '/');
  const r = await fetch(`http://127.0.0.1:${dbg}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await r.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      const p = pend.get(m.id); pend.delete(m.id);
      m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });

  try {
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(350);
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  } finally {
    try { ws.close(); } catch {}
    chrome.kill('SIGKILL');
    setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} }, 300);
  }
}

export async function generateThumbnails({ heroFramePath, hookText, title, style, outDir }) {
  const b64 = fs.readFileSync(heroFramePath).toString('base64');
  const imgDataUri = `data:image/jpeg;base64,${b64}`;
  const coverPath = path.join(outDir, 'cover.jpg');         // 1080x1920 vertical Shorts cover
  const thumbPath = path.join(outDir, 'thumbnail.jpg');     // 1280x720 YouTube API thumbnail

  await renderHtmlToJpg(buildHtml({ imgDataUri, hookText, title, style, width: 1080, height: 1920 }), 1080, 1920, coverPath);
  await renderHtmlToJpg(buildHtml({ imgDataUri, hookText, title, style, width: 1280, height: 720 }), 1280, 720, thumbPath);
  return { coverPath, thumbPath };
}
