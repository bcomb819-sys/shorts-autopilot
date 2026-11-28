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
    styleBag: [],
    lastStyleId: '',
    lastGenre: '',
    genreBag: [],
    usedStoryKeys: [],
    usedTitles: [],
    storyMemory: [],
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
        styleBag: Array.isArray(hist.styleBag) && hist.styleBag.length ? hist.styleBag : (Array.isArray(raw.styleBag) ? raw.styleBag : []),
        lastStyleId: hist.lastStyleId || raw.lastStyleId || '',
        lastGenre: hist.lastGenre || raw.lastGenre || '',
        genreBag: Array.isArray(hist.genreBag) && hist.genreBag.length ? hist.genreBag : (Array.isArray(raw.genreBag) ? raw.genreBag : []),
        usedStoryKeys: [...new Set([...(Array.isArray(raw.usedStoryKeys) ? raw.usedStoryKeys : []), ...(Array.isArray(hist.usedStoryKeys) ? hist.usedStoryKeys : [])])],
        usedTitles: [...new Set([...(Array.isArray(raw.usedTitles) ? raw.usedTitles : []), ...(Array.isArray(hist.usedTitles) ? hist.usedTitles : [])])],
        storyMemory: mergeStoryMemory(raw.storyMemory, hist.storyMemory),
        jobs,
        logs: Array.isArray(raw.logs) ? raw.logs.slice(-200) : [],
      };
    }
  } catch (err) {
    console.error('[store] failed to read db.json, starting fresh:', err.message);
  }
  const fresh = initialState();
  fresh.styleCursor = Number(hist.styleCursor || 0);
  fresh.styleBag = Array.isArray(hist.styleBag) ? hist.styleBag : [];
  fresh.lastStyleId = hist.lastStyleId || '';
  fresh.lastGenre = hist.lastGenre || '';
  fresh.genreBag = Array.isArray(hist.genreBag) ? hist.genreBag : [];
  fresh.usedStoryKeys = Array.isArray(hist.usedStoryKeys) ? hist.usedStoryKeys : [];
  fresh.usedTitles = Array.isArray(hist.usedTitles) ? hist.usedTitles : [];
  fresh.storyMemory = mergeStoryMemory([], hist.storyMemory);
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

  // Secret-free deduplication & permanent story memory file safe for GitHub Actions commits
  const hTmp = HISTORY_PATH + '.tmp';
  fs.writeFileSync(hTmp, JSON.stringify({
    styleCursor: state.styleCursor,
    styleBag: state.styleBag || [],
    lastStyleId: state.lastStyleId || '',
    lastGenre: state.lastGenre || '',
    genreBag: state.genreBag || [],
    usedStoryKeys: state.usedStoryKeys,
    usedTitles: state.usedTitles,
    storyMemory: (state.storyMemory || []).slice(-500),
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

function mergeStoryMemory(a, b) {
  const map = new Map();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const k = item.id || item.fingerprint || item.title;
      if (k) map.set(k, item);
    }
  }
  return [...map.values()].slice(-500);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'but', 'how', 'why', 'what', 'when', 'where',
  'if', 'you', 'your', 'who', 'that', 'this', 'with', 'from', 'into', 'out', 'about', 'they', 'their', 'them',
  'his', 'her', 'she', 'him', 'was', 'were', 'are', 'is', 'been', 'being', 'have', 'has', 'had', 'not', 'one',
  'two', 'man', 'woman', 'guy', 'girl', 'person', 'people', 'someone', 'actually', 'happens', 'story', 'short',
  'really', 'just', 'then', 'until', 'after', 'before', 'over', 'under', 'only', 'very', 'more', 'most',
]);

export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .join(' ')
    .trim();
}

function conceptTokens(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

function tokenOverlap(setA, setB) {
  if (setA.size < 2 || setB.size < 2) return 0;
  let hits = 0;
  for (const w of setA) if (setB.has(w)) hits++;
  return hits / Math.min(setA.size, setB.size);
}

/**
 * Checks whether a candidate story (either (key, title) or full story object) duplicates
 * any previous title OR substantially overlaps an earlier story concept, conflict, or twist.
 */
export function isStoryDuplicate(keyOrStory, maybeTitle = '') {
  const isObj = keyOrStory && typeof keyOrStory === 'object';
  const key = isObj ? (keyOrStory.key || keyOrStory.id || '') : (keyOrStory || '');
  const title = isObj ? (keyOrStory.title || '') : maybeTitle;

  if (key && state.usedStoryKeys.includes(key)) return true;

  const norm = normalizeTitle(title);
  if (norm) {
    const tokens = new Set(norm.split(' ').filter((w) => w.length > 2));
    for (const prev of state.usedTitles) {
      const pNorm = normalizeTitle(prev);
      if (!pNorm) continue;
      if (pNorm === norm) return true;
      const pTokens = new Set(pNorm.split(' ').filter((w) => w.length > 2));
      if (tokenOverlap(tokens, pTokens) >= 0.65) return true;
    }
  }

  // Deep concept & motif similarity check against permanent storyMemory[]
  if (isObj && Array.isArray(state.storyMemory) && state.storyMemory.length) {
    const candFp = normalizeTitle(keyOrStory.conceptFingerprint || keyOrStory.fingerprint || '');
    const candOpening = Array.isArray(keyOrStory.lines) ? String(keyOrStory.lines[0]?.text || '') : String(keyOrStory.opening || '');
    const candConcept = conceptTokens([
      keyOrStory.title,
      candOpening,
      keyOrStory.summary,
      keyOrStory.centralConflict || keyOrStory.conflict,
      keyOrStory.twist,
      keyOrStory.ending,
      ...(Array.isArray(keyOrStory.mainEvents || keyOrStory.events) ? (keyOrStory.mainEvents || keyOrStory.events) : []),
    ].join(' '));
    const candPlot = conceptTokens([
      keyOrStory.centralConflict || keyOrStory.conflict,
      keyOrStory.twist,
      keyOrStory.summary,
    ].join(' '));
    const candMotif = conceptTokens([
      keyOrStory.title,
      candOpening,
      keyOrStory.setting,
      keyOrStory.centralConflict || keyOrStory.conflict,
    ].join(' '));

    for (const mem of state.storyMemory) {
      if (candFp && mem.fingerprint && candFp === normalizeTitle(mem.fingerprint)) return true;
      const memConcept = conceptTokens([
        mem.title,
        mem.opening,
        mem.summary,
        mem.conflict,
        mem.twist,
        mem.ending,
        ...(Array.isArray(mem.events) ? mem.events : []),
      ].join(' '));
      const memPlot = conceptTokens([mem.conflict, mem.twist, mem.summary].join(' '));
      const memMotif = conceptTokens([mem.title, mem.opening, mem.setting, mem.conflict].join(' '));
      if (tokenOverlap(candConcept, memConcept) >= 0.44) return true;
      if (tokenOverlap(candPlot, memPlot) >= 0.42) return true;
      // Catch repeated core premises/motifs (e.g. two "midnight piano" stories with different twists)
      let motifHits = 0;
      for (const w of candMotif) if (memMotif.has(w)) motifHits++;
      if (motifHits >= 2 && tokenOverlap(candMotif, memMotif) >= 0.34) return true;
    }
  }
  return false;
}

export function markStoryUsed(key, title = '', storyMeta = null) {
  if (key && !state.usedStoryKeys.includes(key)) state.usedStoryKeys.push(key);
  if (title && !state.usedTitles.includes(title)) state.usedTitles.push(title);
  if (storyMeta && typeof storyMeta === 'object') {
    if (!Array.isArray(state.storyMemory)) state.storyMemory = [];
    const opening = Array.isArray(storyMeta.lines)
      ? String(storyMeta.lines[0]?.text || '').slice(0, 160)
      : String(storyMeta.opening || '').slice(0, 160);
    const entry = {
      id: storyMeta.key || key || ('story-' + crypto.randomBytes(5).toString('hex')),
      title: storyMeta.title || title || '',
      opening,
      genre: storyMeta.genre || '',
      summary: String(storyMeta.summary || '').slice(0, 260),
      characters: Array.isArray(storyMeta.mainCharacters)
        ? storyMeta.mainCharacters.slice(0, 6)
        : Object.values(storyMeta.characters || {}).map((c) => `${c.name || 'Character'} (${c.role || ''})`).slice(0, 6),
      setting: String(storyMeta.setting || '').slice(0, 120),
      conflict: String(storyMeta.centralConflict || storyMeta.conflict || '').slice(0, 220),
      events: Array.isArray(storyMeta.mainEvents || storyMeta.events)
        ? (storyMeta.mainEvents || storyMeta.events).slice(0, 6).map((e) => String(e).slice(0, 140))
        : [],
      twist: String(storyMeta.twist || '').slice(0, 200),
      ending: String(storyMeta.ending || '').slice(0, 200),
      fingerprint: normalizeTitle(storyMeta.conceptFingerprint || storyMeta.fingerprint || `${storyMeta.genre || ''} ${storyMeta.centralConflict || ''} ${storyMeta.twist || ''}`),
      style: storyMeta.style || '',
      createdAt: new Date().toISOString(),
    };
    const exists = state.storyMemory.some((m) => m.id === entry.id || (entry.title && m.title === entry.title));
    if (!exists) {
      state.storyMemory.push(entry);
      if (state.storyMemory.length > 500) state.storyMemory = state.storyMemory.slice(-500);
    }
  }
  saveState();
}

export function nextGenreId(genresList) {
  const all = Array.isArray(genresList) && genresList.length ? genresList : ['comedy'];
  let bag = (Array.isArray(state.genreBag) ? state.genreBag : []).filter((g) => all.includes(g));
  if (!bag.length) {
    bag = shuffleArray(all);
    if (bag.length > 1 && bag[0] === state.lastGenre) {
      const swapIdx = 1 + Math.floor(Math.random() * (bag.length - 1));
      [bag[0], bag[swapIdx]] = [bag[swapIdx], bag[0]];
    }
  }
  const picked = bag.shift();
  state.genreBag = bag;
  state.lastGenre = picked;
  saveState();
  return picked;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function nextStyleId() {
  const enabled = state.settings.enabledStyles?.length ? state.settings.enabledStyles : ['tall-tale'];
  if (state.settings.styleOrderMode === 'sequential') {
    const id = enabled[state.styleCursor % enabled.length];
    state.styleCursor = (state.styleCursor + 1) % 1000000;
    state.lastStyleId = id;
    saveState();
    return id;
  }

  // Balanced Fisher-Yates Shuffle Bag across ALL enabled styles:
  // Mixes all 6 styles randomly, guarantees every style is used once before reshuffling,
  // and never picks the same style twice in a row.
  let bag = (Array.isArray(state.styleBag) ? state.styleBag : []).filter((s) => enabled.includes(s));
  if (bag.length === 0) {
    bag = shuffleArray(enabled);
    if (bag.length > 1 && bag[0] === state.lastStyleId) {
      const swapIdx = 1 + Math.floor(Math.random() * (bag.length - 1));
      [bag[0], bag[swapIdx]] = [bag[swapIdx], bag[0]];
    }
  }
  const id = bag.shift();
  state.styleBag = bag;
  state.lastStyleId = id;
  state.styleCursor = (state.styleCursor + 1) % 1000000;
  saveState();
  return id;
}

export function todayStats() {
  const today = new Date().toISOString().slice(0, 10);
  const todaysJobs = state.jobs.filter((j) => (j.createdAt || '').startsWith(today));
  const postedToday = state.jobs.filter((j) => j.youtubeId && (j.postedAt || j.updatedAt || '').startsWith(today));
  const manualPostedToday = state.jobs.filter((j) => j.status === 'manual_posted' && (j.manualPostedAt || j.updatedAt || '').startsWith(today));
  const manualReadyToday = state.jobs.filter((j) => j.videoPath && !j.youtubeId && j.status !== 'manual_posted');
  const quotaUnitsUsed = postedToday.length * 1660;
  return {
    date: today,
    generatedToday: todaysJobs.length,
    postedToday: postedToday.length,
    manualPostedToday: manualPostedToday.length,
    manualReadyCount: manualReadyToday.length,
    dailyLimit: state.settings.dailyLimit,
    quotaUnitsUsed,
    defaultQuotaUnits: 10000,
    totalUniqueUsed: state.usedStoryKeys.length,
  };
}
