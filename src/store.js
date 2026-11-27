import crypto from 'node:crypto';
import fs from 'node:fs';
import { DB_PATH, DEFAULT_SETTINGS, HISTORY_PATH } from './config.js';

function initialState() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    youtube: {
      clientId: process.env.YT_CLIENT_ID || '',
      clientSecret: process.env.YT_CLIENT_SECRET || '',
      activeAccountId: '',
      accounts: [],
      // legacy fields kept synced with active account for backward compatibility
      refreshToken: process.env.YT_REFRESH_TOKEN || '',
      accessToken: '',
      tokenExpiry: 0,
      channelTitle: '',
      channelId: '',
      connectedAt: null,
    },
    styleCursor: 0,
    usedStoryKeys: [],
    usedTitles: [],
    jobs: [],
    logs: [],
  };
}

let state = loadState();

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_PATH)) {
      return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    }
  } catch {}
  return {};
}

function loadState() {
  const hist = loadHistory();
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const base = initialState();
      const yt = {
        ...base.youtube,
        ...(raw.youtube || {}),
        clientId: raw.youtube?.clientId || process.env.YT_CLIENT_ID || '',
        clientSecret: raw.youtube?.clientSecret || process.env.YT_CLIENT_SECRET || '',
        accounts: Array.isArray(raw.youtube?.accounts) ? raw.youtube.accounts : [],
      };
      // Auto-migrate legacy single refreshToken into accounts[] so user never loses login
      if (yt.accounts.length === 0 && (yt.refreshToken || process.env.YT_REFRESH_TOKEN)) {
        const id = 'yt-' + crypto.createHash('sha1').update(yt.refreshToken || process.env.YT_REFRESH_TOKEN).digest('hex').slice(0, 8);
        yt.accounts.push({
          id,
          label: yt.channelTitle || 'YouTube Account 1',
          email: yt.email || '',
          name: yt.name || '',
          picture: yt.picture || '',
          channelId: yt.channelId || '',
          channelTitle: yt.channelTitle || '',
          channelHandle: '',
          channelThumb: '',
          refreshToken: yt.refreshToken || process.env.YT_REFRESH_TOKEN,
          accessToken: yt.accessToken || '',
          tokenExpiry: yt.tokenExpiry || 0,
          connectedAt: yt.connectedAt || new Date().toISOString(),
          apiWarning: '',
        });
        yt.activeAccountId = id;
      }
      if (!yt.activeAccountId && yt.accounts.length > 0) {
        yt.activeAccountId = yt.accounts[0].id;
      }
      const jobs = Array.isArray(raw.jobs) ? raw.jobs.map((j) => (
        // Recover any job stuck in 'uploading' across server restarts
        j.status === 'uploading' ? { ...j, status: 'completed', stage: 'Rendered locally (ready to upload)' } : j
      )) : [];
      return {
        ...base,
        ...raw,
        settings: { ...base.settings, ...(raw.settings || {}) },
        youtube: yt,
        styleCursor: Math.max(Number(raw.styleCursor || 0), Number(hist.styleCursor || 0)),
        usedStoryKeys: [...new Set([...(Array.isArray(raw.usedStoryKeys) ? raw.usedStoryKeys : []), ...(Array.isArray(hist.usedStoryKeys) ? hist.usedStoryKeys : [])])],
        usedTitles: [...new Set([...(Array.isArray(raw.usedTitles) ? raw.usedTitles : []), ...(Array.isArray(hist.usedTitles) ? hist.usedTitles : [])])],
        jobs,
        logs: Array.isArray(raw.logs) ? raw.logs.slice(-200) : [],
      };
    }
  } catch (err) {
    console.error('[store] failed to read db.json, starting fresh:', err.message);
  }
  const fresh = initialState();
  fresh.styleCursor = Number(hist.styleCursor || 0);
  fresh.usedStoryKeys = Array.isArray(hist.usedStoryKeys) ? hist.usedStoryKeys : [];
  fresh.usedTitles = Array.isArray(hist.usedTitles) ? hist.usedTitles : [];
  if (fresh.youtube.accounts.length === 0 && fresh.youtube.refreshToken) {
    const id = 'yt-cloud';
    fresh.youtube.accounts.push({
      id,
      label: 'Cloud YouTube Channel',
      refreshToken: fresh.youtube.refreshToken,
      connectedAt: new Date().toISOString(),
    });
    fresh.youtube.activeAccountId = id;
  }
  return fresh;
}

export function saveState() {
  const active = getActiveAccount();
  state.youtube.refreshToken = active?.refreshToken || '';
  state.youtube.accessToken = active?.accessToken || '';
  state.youtube.tokenExpiry = active?.tokenExpiry || 0;
  state.youtube.channelTitle = active?.channelTitle || active?.email || '';
  state.youtube.channelId = active?.channelId || '';
  state.youtube.connectedAt = active?.connectedAt || null;

  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_PATH);

  // Secret-free deduplication history file safe for GitHub Actions commits
  const hTmp = HISTORY_PATH + '.tmp';
  fs.writeFileSync(hTmp, JSON.stringify({
    styleCursor: state.styleCursor,
    usedStoryKeys: state.usedStoryKeys,
    usedTitles: state.usedTitles,
  }, null, 2));
  fs.renameSync(hTmp, HISTORY_PATH);
}

export function getState() {
  return state;
}

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  saveState();
  return state.settings;
}

export function updateYouTube(patch) {
  state.youtube = { ...state.youtube, ...patch };
  saveState();
  return state.youtube;
}

export function getAccounts() {
  return state.youtube.accounts || [];
}

export function getAccount(id) {
  return getAccounts().find((a) => a.id === id) || null;
}

export function getActiveAccount() {
  const list = getAccounts();
  if (!list.length) return null;
  return list.find((a) => a.id === state.youtube.activeAccountId) || list[0];
}

export function upsertAccount(acct) {
  const list = state.youtube.accounts;
  // Match by id, channelId, or email to update existing account instead of duplicating
  const idx = list.findIndex((a) =>
    (acct.id && a.id === acct.id) ||
    (acct.channelId && a.channelId && a.channelId === acct.channelId) ||
    (acct.email && a.email && a.email.toLowerCase() === acct.email.toLowerCase())
  );
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...acct, refreshToken: acct.refreshToken || list[idx].refreshToken };
    if (!state.youtube.activeAccountId) state.youtube.activeAccountId = list[idx].id;
    saveState();
    return list[idx];
  }
  const created = {
    id: acct.id || ('yt-' + crypto.randomBytes(4).toString('hex')),
    label: acct.label || acct.channelTitle || acct.email || `YouTube Account ${list.length + 1}`,
    email: '',
    name: '',
    picture: '',
    channelId: '',
    channelTitle: '',
    channelHandle: '',
    channelThumb: '',
    apiWarning: '',
    connectedAt: new Date().toISOString(),
    ...acct,
  };
  list.push(created);
  state.youtube.activeAccountId = created.id;
  saveState();
  return created;
}

export function setActiveAccount(id) {
  const target = getAccount(id);
  if (!target) throw new Error('Account not found: ' + id);
  state.youtube.activeAccountId = target.id;
  saveState();
  return target;
}

export function removeAccount(id) {
  state.youtube.accounts = getAccounts().filter((a) => a.id !== id);
  if (state.youtube.activeAccountId === id) {
    state.youtube.activeAccountId = state.youtube.accounts[0]?.id || '';
  }
  saveState();
}

export function addLog(level, message, jobId = null) {
  const entry = { ts: new Date().toISOString(), level, message, jobId };
  state.logs.push(entry);
  if (state.logs.length > 250) state.logs = state.logs.slice(-250);
  saveState();
  console.log(`[${entry.ts}] [${level}]${jobId ? ` [${jobId}]` : ''} ${message}`);
  return entry;
}

export function upsertJob(job) {
  const idx = state.jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) state.jobs[idx] = { ...state.jobs[idx], ...job, updatedAt: new Date().toISOString() };
  else state.jobs.unshift({ ...job, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  if (state.jobs.length > 150) state.jobs = state.jobs.slice(0, 150);
  saveState();
  return idx >= 0 ? state.jobs[idx] : state.jobs[0];
}

export function getJob(id) {
  return state.jobs.find((j) => j.id === id);
}

export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\b(the|a|an|of|to|in|on|for|and|how|why|what|when|if|you|who|that|this|with|actually|happens)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isStoryDuplicate(key, title) {
  if (key && state.usedStoryKeys.includes(key)) return true;
  const norm = normalizeTitle(title);
  if (!norm) return false;
  const tokens = new Set(norm.split(' ').filter((w) => w.length > 2));
  for (const prev of state.usedTitles) {
    const pNorm = normalizeTitle(prev);
    if (pNorm === norm) return true;
    const pTokens = new Set(pNorm.split(' ').filter((w) => w.length > 2));
    if (tokens.size >= 2 && pTokens.size >= 2) {
      let overlap = 0;
      for (const w of tokens) if (pTokens.has(w)) overlap++;
      if (overlap / Math.min(tokens.size, pTokens.size) >= 0.72) return true;
    }
  }
  return false;
}

export function markStoryUsed(key, title = '') {
  if (key && !state.usedStoryKeys.includes(key)) state.usedStoryKeys.push(key);
  if (title && !state.usedTitles.includes(title)) state.usedTitles.push(title);
  saveState();
}

export function nextStyleId() {
  const enabled = state.settings.enabledStyles?.length ? state.settings.enabledStyles : ['tall-tale'];
  const id = enabled[state.styleCursor % enabled.length];
  state.styleCursor = (state.styleCursor + 1) % 1000000;
  saveState();
  return id;
}

export function todayStats() {
  const today = new Date().toISOString().slice(0, 10);
  const todaysJobs = state.jobs.filter((j) => (j.createdAt || '').startsWith(today));
  const postedToday = state.jobs.filter((j) => j.youtubeId && (j.postedAt || j.updatedAt || '').startsWith(today));
  const quotaUnitsUsed = postedToday.length * 1650;
  return {
    date: today,
    generatedToday: todaysJobs.length,
    postedToday: postedToday.length,
    dailyLimit: state.settings.dailyLimit,
    quotaUnitsUsed,
    defaultQuotaUnits: 10000,
    totalUniqueUsed: state.usedStoryKeys.length,
  };
}
