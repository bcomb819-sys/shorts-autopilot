// 60-Second Animated Mini-Movie Story Engine + Strict Quality Control & Concept Dedup
// Completely replaces legacy 30s trivia/factoid prompts with original, character-driven 60-second
// animated mini-movies crafted for international audiences (US, UK, Canada, Australia).
// Priority in 'auto' mode: Local Ollama -> Free Cloud Gemini API -> Unused Verified Bank.
import crypto from 'node:crypto';
import { ALL_STYLES } from './config.js';
import { addLog, getState, isStoryDuplicate, nextGenreId } from './store.js';
import { STORY_BANK } from './story-bank.js';

export const MINI_MOVIE_GENRES = [
  { id: 'mystery', label: 'Everyday Mystery', desc: 'An ordinary object, note, or strange behavior reveals a clever hidden mystery.' },
  { id: 'comedy', label: 'Situational Comedy', desc: 'A tiny misunderstanding or awkward lie snowballs into hilarious chaos with a sharp punchline.' },
  { id: 'suspense', label: 'High-Stakes Suspense', desc: 'A tense countdown or unexpected catch where quick thinking changes everything.' },
  { id: 'emotional', label: 'Heartfelt Twist', desc: 'A seemingly cold or frustrating moment flips into a deeply touching human reveal.' },
  { id: 'unexpected-discovery', label: 'Unexpected Discovery', desc: 'Someone finds something strange hidden in a normal place and uncovers its wild origin.' },
  { id: 'unusual-everyday', label: 'Bizarre Everyday Moment', desc: 'A relatable everyday errand (commute, cafe, gym, apartment) turns completely unpredictable.' },
  { id: 'clever-problem-solving', label: 'Clever Outsmarting', desc: 'A character solves a stubborn rule, unfair trap, or impossible problem with pure wit.' },
  { id: 'friendship', label: 'Friendship Test', desc: 'Two friends end up in an absurd dilemma that leads to a surprising bond or hilarious betrayal.' },
  { id: 'family', label: 'Family Mix-Up', desc: 'A relatable parent, sibling, or grandparent secret leads to a delightful twist.' },
  { id: 'workplace', label: 'Workplace Chaos', desc: 'An office, studio, delivery route, or restaurant shift goes sideways in the funniest or smartest way.' },
  { id: 'unexpected-kindness', label: 'Secret Kindness', desc: 'What looks like trouble or a rude stranger turns out to be a brilliant secret act of kindness.' },
  { id: 'unpredictable-interaction', label: 'Strangers Collide', desc: 'A 60-second conversation between two strangers takes two sharp turns nobody saw coming.' },
];

export async function checkOllamaStatus(ollamaUrl) {
  const base = (ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { running: false, models: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return { running: true, models };
  } catch (err) {
    return { running: false, models: [], error: err.message };
  }
}

const VALID_SHOTS = ['wide', 'medium', 'closeup', 'reaction'];
const VALID_ACTIONS = ['stand', 'walk', 'run', 'jump', 'point', 'wave', 'shrug', 'gasp'];
const VALID_PATTERNS = ['plain', 'check', 'stripes', 'overalls', 'vest', 'apron'];
const VALID_HATS = ['none', 'cap', 'bowler', 'boater', 'beanie', 'visor', 'tophat', 'bun', 'flower'];
const VALID_NECKS = ['none', 'bowtie', 'tie', 'scarf', 'collar'];
const VALID_EXTRAS = ['mustache', 'glasses', 'freckles', 'blush', 'pencil', 'monocle'];

const STYLE_SCHEMAS = {
  'tall-tale': {
    scenes: ['street', 'office', 'gallery', 'meadow', 'sunset'],
    moods: ['neutral', 'smug', 'happy', 'laugh', 'shock', 'worried', 'angry', 'sad', 'sly', 'proud', 'tired', 'dizzy'],
    props: ['dollarBill', 'stack', 'paper', 'key', 'ticket', 'book', 'cup', 'parcels', 'letters', 'rubberStamp', 'sign'],
    visualStyle: 'Colourful polished 3D miniature world with expressive cartoon characters, natural dialogue, eye contact, body language, and cinematic camera framing (wide, medium, closeup, reaction).',
  },
  'deep-dive': {
    scenes: ['kitchen', 'xray', 'vessel', 'vessel_dark', 'xray_alarm', 'heart', 'blackout', 'kitchen_end'],
    moods: ['neutral', 'shock', 'worried', 'happy', 'angry'],
    props: [],
    visualStyle: 'Polished 3D character storytelling blended with dramatic internal close-ups, reactions, and tension beats.',
  },
  'night-file': {
    scenes: ['cabin', 'walk', 'file', 'vanish', 'door', 'casewall'],
    moods: ['neutral', 'worried', 'shock', 'angry', 'sad'],
    props: [],
    visualStyle: 'Cinematic moody 3D mystery mini-movie across atmospheric corridors, moonlit exteriors, interiors, and case-wall reveals.',
  },
  'inside-out': {
    scenes: ['room', 'xray', 'macro', 'macro_burst', 'bounce', 'myth', 'stopwatch', 'warning', 'end'],
    moods: ['n', 'o', 'smile', 'smirk'],
    props: [],
    visualStyle: 'Vibrant expressive 2D animated character mini-movie with dynamic cutaways, crisp visual gags, and punchy transitions.',
  },
  'stick-story': {
    scenes: ['night_living', 'night_kitchen', 'night_hall', 'counter', 'day_living'],
    moods: ['calm', 'happy', 'worried', 'scared', 'determined'],
    props: [],
    visualStyle: 'Expressive animated stick-character mini-movie with lively physical comedy, natural dialogue, and crisp illustrated rooms.',
  },
  'paper-atlas': {
    scenes: ['map', 'hall', 'harbor', 'night_city', 'timeline', 'seal'],
    moods: ['neutral', 'happy', 'shock', 'worried', 'proud'],
    props: [],
    visualStyle: 'Crafted cut-paper storybook mini-movie with multiple animated characters, richly lit halls, harbors, and tactile reveals.',
  },
};

const BANNED_OPENER_RE = /^(hi\b|hey\b|hello\b|welcome\b|good morning|once upon a time|did you know|have you ever wondered|today we|in this video|let me tell you|imagine this)/i;
const BANNED_TROPE_RE = /\b(lottery ticket|won the lottery|winning lottery|greedy shopkeeper|arrogant billionaire|rich man mocked|poor beggar|instant karma|revenge on (his|her|their) boss)\b/i;
const BANNED_CLIFFHANGER_RE = /\b(to be continued|part two|part 2|stay tuned|find out next|what happens next|subscribe for|follow for part|comment what you think happens)\b|\.\.\.\s*$/i;

const NAME_POOL = [
  'Toby', 'Hannah', 'Marcus', 'Chloe', 'Devon', 'Nora', 'Owen', 'Tessa', 'Felix', 'Ruby',
  'Caleb', 'Clara', 'Simon', 'Sadie', 'Grant', 'Wendy', 'Oscar', 'Fiona', 'Brett', 'Layla',
  'Hugo', 'Holly', 'Colin', 'Penny', 'Reid', 'Zoey', 'Nathan', 'Maeve', 'Craig', 'Gemma',
  'Trevor', 'Hazel', 'Wyatt', 'Freya', 'Vince', 'Phoebe', 'Dean', 'Sienna', 'Gavin', 'Poppy',
];

const SETTING_POOL = [
  'a bustling weekend flea market',
  'a sunny harbour commuter ferry',
  'a retro neon bowling alley',
  'a snowy mountain ski-lodge cafe',
  'a rooftop community vegetable garden',
  'a vintage vinyl record shop',
  'a packed cross-country train dining car',
  'a lively neighborhood dog park',
  'a sunlit botanical glasshouse',
  'a windy coastal lighthouse pier',
  'a crowded airport baggage carousel',
  'a bright corner laundromat',
  'a suburban neighborhood hardware store',
  'a colorful Saturday farmers market',
  'a cozy trivia-night neighborhood pub',
  'a quiet city library map archive',
  'a crowded cinema popcorn lobby',
  'a breezy seaside boardwalk ice-cream stand',
  'a busy wedding-tailor alteration shop',
  'a friendly neighborhood bicycle workshop',
  'a warm early-morning sourdough bakery',
  'a quirky secondhand bookstore',
  'a sunny public swimming pool deck',
  'a domed city planetarium',
  'a messy community pottery studio',
  'a glowing 24-hour highway diner',
  'a snowy suburban cul-de-sac',
  'a lively charity art auction hall',
  'a colorful pet grooming salon',
  'a sunny park chess pavilion',
];

function recentCharacterNames(storyMemory, limit = 16) {
  const names = new Set();
  for (const m of (storyMemory || []).slice(-limit)) {
    for (const c of (m.characters || [])) {
      const first = String(c || '').trim().split(/[\s(]/)[0].toLowerCase();
      if (first.length >= 2) names.add(first);
    }
  }
  return names;
}

function pickFreshCastAndSetting(storyMemory, attempt = 1) {
  const usedNames = recentCharacterNames(storyMemory, 18);
  const availNames = NAME_POOL.filter((n) => !usedNames.has(n.toLowerCase()));
  const pool = availNames.length >= 2 ? availNames : NAME_POOL;
  const i1 = Math.floor(Math.random() * pool.length);
  const heroName = pool[i1];
  const rest = pool.filter((n) => n !== heroName);
  const partnerName = rest[Math.floor(Math.random() * rest.length)];

  const recentSettings = new Set((storyMemory || []).slice(-18).map((m) => String(m.setting || '').toLowerCase()));
  const availSettings = SETTING_POOL.filter((s) => {
    const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    return ![...recentSettings].some((rs) => words.some((w) => rs.includes(w)));
  });
  const sPool = availSettings.length ? availSettings : SETTING_POOL;
  const settingSeed = sPool[(Math.floor(Math.random() * sPool.length) + attempt) % sPool.length];
  return { heroName, partnerName, settingSeed, bannedNames: [...usedNames].slice(0, 16) };
}

function safeHex(val, fallback) {
  return typeof val === 'string' && /^#[0-9a-fA-F]{6}$/.test(val.trim()) ? val.trim() : fallback;
}

function sanitizeCharacterLook(rawLook, fallback) {
  const r = rawLook && typeof rawLook === 'object' ? rawLook : {};
  return {
    body: safeHex(r.body, fallback.body),
    pattern: VALID_PATTERNS.includes(r.pattern) ? r.pattern : fallback.pattern,
    patCol: safeHex(r.patCol, fallback.patCol),
    hat: VALID_HATS.includes(r.hat) ? r.hat : fallback.hat,
    hatCol: safeHex(r.hatCol, fallback.hatCol),
    band: safeHex(r.band, fallback.band),
    neck: VALID_NECKS.includes(r.neck) ? r.neck : fallback.neck,
    neckCol: safeHex(r.neckCol, fallback.neckCol),
    extra: Array.isArray(r.extra)
      ? r.extra.filter((x) => VALID_EXTRAS.includes(x)).slice(0, 2)
      : fallback.extra,
  };
}

function defaultCast(seed) {
  const heroChoices = [
    { body: '#E8734A', pattern: 'plain', patCol: '#B8502E', hat: 'cap', hatCol: '#2E5A44', band: '#F2C230', neck: 'scarf', neckCol: '#F2C230', extra: ['glasses'] },
    { body: '#3B78C4', pattern: 'stripes', patCol: '#234E8A', hat: 'beanie', hatCol: '#D84A3A', band: '#F5F1E8', neck: 'collar', neckCol: '#F5F1E8', extra: ['freckles'] },
    { body: '#2E8B6E', pattern: 'overalls', patCol: '#1D5C48', hat: 'bun', hatCol: '#4A3123', band: '#F2C230', neck: 'none', neckCol: '#F2C230', extra: ['blush'] },
    { body: '#C84B5A', pattern: 'check', patCol: '#8A2E3A', hat: 'none', hatCol: '#2A2638', band: '#F2C230', neck: 'scarf', neckCol: '#F2C230', extra: ['glasses'] },
    { body: '#7C4DBC', pattern: 'vest', patCol: '#4F2E80', hat: 'boater', hatCol: '#E6C27A', band: '#C84B5A', neck: 'bowtie', neckCol: '#F2C230', extra: ['pencil'] },
  ];
  const partnerChoices = [
    { body: '#4A5D7A', pattern: 'vest', patCol: '#2E3A4E', hat: 'bowler', hatCol: '#2A2638', band: '#B5372E', neck: 'tie', neckCol: '#B5372E', extra: ['mustache'] },
    { body: '#D48C3B', pattern: 'apron', patCol: '#F4EFE4', hat: 'flower', hatCol: '#E85A4F', band: '#F2C230', neck: 'collar', neckCol: '#FFFFFF', extra: ['blush'] },
    { body: '#3A7A68', pattern: 'check', patCol: '#234E42', hat: 'visor', hatCol: '#243B55', band: '#F2C230', neck: 'none', neckCol: '#F2C230', extra: ['glasses'] },
    { body: '#9B4D6B', pattern: 'plain', patCol: '#6E3249', hat: 'bun', hatCol: '#2C221E', band: '#F2C230', neck: 'scarf', neckCol: '#4FD1E8', extra: ['freckles'] },
  ];
  return {
    hero: heroChoices[seed % heroChoices.length],
    partner: partnerChoices[(seed >> 2) % partnerChoices.length],
    extra: { body: '#3B384A', pattern: 'vest', patCol: '#252230', hat: 'tophat', hatCol: '#252230', band: '#C9A13B', neck: 'bowtie', neckCol: '#D8343F', extra: ['monocle', 'mustache'] },
  };
}

function countWords(lines) {
  return lines.reduce((sum, ln) => sum + String(ln.text || '').trim().split(/\s+/).filter(Boolean).length, 0);
}

function sanitizeBlueprint(raw, styleId, genreObj = null) {
  const styleMeta = ALL_STYLES.find((s) => s.id === styleId) || ALL_STYLES[0];
  const schema = STYLE_SCHEMAS[styleId] || STYLE_SCHEMAS['tall-tale'];
  if (!raw || !Array.isArray(raw.lines) || raw.lines.length < 4) {
    throw new Error('Story blueprint missing valid lines array.');
  }

  const title = String(raw.title || 'Unexpected Turn').replace(/[\r\n]+/g, ' ').trim().slice(0, 75);
  const seed = Math.abs(crypto.createHash('sha1').update(title).digest().readInt32BE(0));
  const defaults = defaultCast(seed);

  const rawChars = raw.characters && typeof raw.characters === 'object' ? raw.characters : {};
  const characters = {
    hero: {
      name: String(rawChars.hero?.name || 'Sam').slice(0, 22),
      role: String(rawChars.hero?.role || 'protagonist').slice(0, 32),
      personality: String(rawChars.hero?.personality || 'quick-witted, expressive').slice(0, 50),
      look: sanitizeCharacterLook(rawChars.hero?.look, defaults.hero),
    },
    partner: {
      name: String(rawChars.partner?.name || 'Alex').slice(0, 22),
      role: String(rawChars.partner?.role || 'foil').slice(0, 32),
      personality: String(rawChars.partner?.personality || 'skeptical, reactive').slice(0, 50),
      look: sanitizeCharacterLook(rawChars.partner?.look, defaults.partner),
    },
    extra: {
      name: String(rawChars.extra?.name || 'Jordan').slice(0, 22),
      role: String(rawChars.extra?.role || 'bystander').slice(0, 32),
      personality: String(rawChars.extra?.personality || 'observant').slice(0, 50),
      look: sanitizeCharacterLook(rawChars.extra?.look, defaults.extra),
    },
  };

  let prevShot = '';
  const lines = raw.lines
    .slice(0, 18)
    .map((ln, idx) => {
      const text = String(ln.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const scene = schema.scenes.includes(ln.scene) ? ln.scene : schema.scenes[Math.floor(idx / 3) % schema.scenes.length];
      let shot = VALID_SHOTS.includes(ln.shot) ? ln.shot : VALID_SHOTS[idx % VALID_SHOTS.length];
      if (shot === prevShot && idx > 0) {
        shot = VALID_SHOTS[(VALID_SHOTS.indexOf(shot) + 1) % VALID_SHOTS.length];
      }
      prevShot = shot;
      const speaker = ['narrator', 'hero', 'partner', 'extra'].includes(ln.speaker) ? ln.speaker : (idx % 3 === 1 ? 'hero' : idx % 3 === 2 ? 'partner' : 'narrator');
      const mood = schema.moods.includes(ln.mood) ? ln.mood : schema.moods[0];
      const partnerMood = schema.moods.includes(ln.partnerMood) ? ln.partnerMood : (mood === 'smug' ? 'shock' : mood === 'angry' ? 'worried' : 'neutral');
      const action = VALID_ACTIONS.includes(ln.action) ? ln.action : (idx === 0 ? 'gasp' : 'stand');

      const out = {
        text,
        speaker,
        scene,
        shot,
        mood,
        partnerMood,
        action,
        sfx: ln.sfx || (idx === 0 ? 'ding' : idx === raw.lines.length - 1 ? 'stamp' : 'pop'),
      };
      if (ln.caps && typeof ln.caps === 'string') out.caps = ln.caps.trim();
      if (ln.badge) out.badge = String(ln.badge).slice(0, 22);
      if (ln.badgeSub) out.badgeSub = String(ln.badgeSub).slice(0, 24);
      if (ln.badgeColor) out.badgeColor = ln.badgeColor;
      if (ln.prop && schema.props.includes(ln.prop)) out.prop = ln.prop;
      if (ln.pill) out.pill = String(ln.pill).slice(0, 20);
      if (ln.pillColor) out.pillColor = ln.pillColor;
      if (ln.label) out.label = String(ln.label).slice(0, 20);
      if (ln.date1) out.date1 = String(ln.date1).slice(0, 22);
      if (ln.date2) out.date2 = String(ln.date2).slice(0, 28);
      if (ln.fileTitle) out.fileTitle = String(ln.fileTitle).slice(0, 24);
      if (ln.stamp1) out.stamp1 = String(ln.stamp1).slice(0, 20);
      if (ln.stamp2) out.stamp2 = String(ln.stamp2).slice(0, 20);
      if (ln.stampUnsolved) out.stampUnsolved = true;
      if (ln.calNum) out.calNum = String(ln.calNum).slice(0, 8);
      if (ln.calSub) out.calSub = String(ln.calSub).slice(0, 14);
      if (Array.isArray(ln.step) && ln.step.length === 2) out.step = [Number(ln.step[0]) || 1, String(ln.step[1]).slice(0, 16)];
      if (Array.isArray(ln.lines3) && ln.lines3.length === 3) out.lines3 = ln.lines3.map((x) => String(x).slice(0, 14));
      if (ln.cross) out.cross = true;
      if (ln.check) out.check = true;
      if (ln.year) out.year = String(ln.year).slice(0, 10);
      if (ln.slip) out.slip = String(ln.slip).slice(0, 22);
      if (ln.role) out.role = ln.role;
      if (Array.isArray(ln.labels) && ln.labels.length >= 2) out.labels = ln.labels.slice(0, 4).map((x) => String(x).slice(0, 10));
      if (ln.letter) out.letter = String(ln.letter).slice(0, 2).toUpperCase();
      return out;
    })
    .filter(Boolean);

  if (lines.length < 4) throw new Error('Too few non-empty lines after sanitization.');

  const hookText = String(raw.hookText || title.split(' ').slice(0, 3).join(' ')).toUpperCase().slice(0, 22);
  const rawDesc = String(raw.description || `${title} — watch till the twist!`).trim();
  const description = /#shorts\b/i.test(rawDesc) ? rawDesc : `${rawDesc}\n\n#Shorts`;
  const tags = Array.isArray(raw.tags) && raw.tags.length
    ? raw.tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 10)
    : ['shorts', 'animatedstory', 'storytime', 'plottwist', 'cartoon', 'viral'];

  const summary = String(raw.summary || raw.description || title).slice(0, 260);
  const setting = String(raw.setting || lines[0].scene || 'city street').slice(0, 120);
  const centralConflict = String(raw.centralConflict || raw.conflict || '').slice(0, 220);
  const mainEvents = Array.isArray(raw.mainEvents) ? raw.mainEvents.slice(0, 6).map((x) => String(x).slice(0, 140)) : [];
  const twist = String(raw.twist || '').slice(0, 200);
  const ending = String(raw.ending || lines[lines.length - 1]?.text || '').slice(0, 200);
  const genre = String(raw.genre || genreObj?.id || 'comedy').slice(0, 32);
  const conceptFingerprint = String(raw.conceptFingerprint || `${genre} ${setting} ${centralConflict} ${twist}`).slice(0, 220);
  const key = raw.key || `mm-${crypto.createHash('sha1').update(`${title.toLowerCase()}|${conceptFingerprint.toLowerCase()}`).digest('hex').slice(0, 12)}`;

  return {
    key,
    style: styleId,
    genre,
    title,
    hookText,
    summary,
    setting,
    centralConflict,
    mainEvents,
    twist,
    ending,
    conceptFingerprint,
    characters,
    mainCharacters: [
      `${characters.hero.name} (${characters.hero.role})`,
      `${characters.partner.name} (${characters.partner.role})`,
      ...(rawChars.extra?.name ? [`${characters.extra.name} (${characters.extra.role})`] : []),
    ],
    description,
    tags,
    voice: styleMeta.voice,
    speed: styleMeta.speed,
    music: styleMeta.music,
    categoryId: String(raw.categoryId || styleMeta.categoryId),
    sources: Array.isArray(raw.sources) && raw.sources.length ? raw.sources : ['Original animated mini-movie'],
    wordCount: countWords(lines),
    targetDurationSec: 60,
    lines,
  };
}

/**
 * Quality Control Gate evaluated BEFORE accepting any generated 60-second mini-movie.
 * Rejects weak openings, short/padded scripts, repetitive clichés, flat visuals, or concept duplicates.
 */
export function evaluateStoryQuality(story) {
  const issues = [];
  if (!story || !Array.isArray(story.lines)) return { ok: false, issues: ['Missing story lines'] };

  const words = countWords(story.lines);
  if (words < 122 || words > 172) {
    issues.push(`Word count ${words} outside 60-second target (122-172 words)`);
  }
  if (story.lines.length < 10) {
    issues.push(`Only ${story.lines.length} beats (need at least 10 beats for a dynamic 60s mini-movie)`);
  }

  const hookLine = String(story.lines[0]?.text || '').trim();
  const hookWords = hookLine.split(/\s+/).filter(Boolean).length;
  if (!hookLine || hookWords > 15) {
    issues.push(`Opening hook too long (${hookWords} words; keep 0-2s hook punchy)`);
  }
  if (BANNED_OPENER_RE.test(hookLine)) {
    issues.push(`Banned boring opening phrase: "${hookLine}"`);
  }

  const fullText = [story.title, story.summary, story.centralConflict, story.twist, ...story.lines.map((l) => l.text)].join(' ');
  if (BANNED_TROPE_RE.test(fullText)) {
    issues.push('Contains banned repetitive cliché trope (lottery/greedy shopkeeper/rich-vs-poor/revenge)');
  }

  const st = getState();
  const recent6Names = recentCharacterNames(st.storyMemory, 6);
  const heroFirst = String(story.characters?.hero?.name || '').trim().split(/\s+/)[0].toLowerCase();
  const partnerFirst = String(story.characters?.partner?.name || '').trim().split(/\s+/)[0].toLowerCase();
  if (heroFirst && recent6Names.has(heroFirst)) {
    issues.push(`Hero name "${story.characters.hero.name}" was already used recently`);
  }
  if (partnerFirst && recent6Names.has(partnerFirst)) {
    issues.push(`Partner name "${story.characters.partner.name}" was already used recently`);
  }

  const distinctShots = new Set(story.lines.map((l) => l.shot)).size;
  if (distinctShots < 2) issues.push('Needs varied camera framing (wide, medium, closeup, reaction)');

  const distinctMoods = new Set(story.lines.map((l) => l.mood)).size;
  if (distinctMoods < 2) issues.push('Characters need expressive emotional variety across scenes');

  if (!story.summary || !story.centralConflict || !story.twist || !story.ending) {
    issues.push('Missing structured plot metadata (summary, centralConflict, twist, ending)');
  }

  // Strict COMPLETE-ENDING gate: every story MUST have a clear, resolved ending (zero cliffhangers!)
  const lastLine = String(story.lines[story.lines.length - 1]?.text || '').trim();
  const lastWords = lastLine.split(/\s+/).filter(Boolean).length;
  if (!lastLine || lastWords < 4) {
    issues.push('Final ending line is missing or too abrupt (must deliver a complete conclusion)');
  }
  if (BANNED_CLIFFHANGER_RE.test(lastLine) || BANNED_CLIFFHANGER_RE.test(String(story.ending || ''))) {
    issues.push(`Ending contains a cliffhanger or "to be continued" phrase: "${lastLine}"`);
  }
  if (/\?\s*$/.test(lastLine)) {
    issues.push(`Ending stops on an unanswered question instead of a satisfying conclusion: "${lastLine}"`);
  }

  if (isStoryDuplicate(story)) {
    issues.push(`Concept or title too similar to a previously stored story ("${story.title}")`);
  }

  return { ok: issues.length === 0, issues, wordCount: words };
}

function buildMiniMoviePrompt(styleId, genreObj, storyMemory, usedTitles, attempt = 1) {
  const schema = STYLE_SCHEMAS[styleId] || STYLE_SCHEMAS['tall-tale'];
  const { heroName, partnerName, settingSeed, bannedNames } = pickFreshCastAndSetting(storyMemory, attempt);
  const memoryBlock = (storyMemory || []).slice(-35).map((m) =>
    `- "${m.title}" [${m.genre || 'story'} @ ${m.setting || 'unknown'}]: ${m.conflict || m.summary} | Twist: ${m.twist || m.ending}`,
  ).join('\n');
  const titleBlock = (usedTitles || []).slice(-60).join(' | ');

  return `You are the showrunner and writer of a viral 60-second animated cartoon mini-movie studio (think snappy, colourful 3D cartoon storytelling with witty narration, hilarious deadpan character dialogue, clever visual gags, and jaw-dropping double twists).
Create ONE 100% ORIGINAL, genuinely funny, gripping, or heartwarming 60-SECOND animated mini-movie for international viewers (US, UK, Canada, Australia).

Visual presentation: ${schema.visualStyle}
Assigned Genre for this episode: ${genreObj.label} — ${genreObj.desc}
Fresh Setting Inspiration (build an original plot here): ${settingSeed}
Fresh Unused Lead Names (use these two names so characters never repeat): Hero = "${heroName}", Partner = "${partnerName}"
Recently used character names (DO NOT REUSE): ${bannedNames.join(', ') || 'none'}
Fresh creative seed: #${attempt}-${Date.now() % 9973}

PREVIOUSLY CREATED STORIES (STRICTLY DO NOT REPEAT OR REWORD ANY CONCEPT, MOTIF, OBJECT, SETTING, OR TWIST):
${memoryBlock || '(none yet)'}
Previous titles: ${titleBlock || '(none yet)'}

MANDATORY STORYTELLING & 60-SECOND STRUCTURE RULES:
1. EXACT 60-SECOND LENGTH: Write 13 to 15 tightly paced beats totaling **142 to 158 spoken words** (natural conversational English, NOT rushed, NOT padded). Every single line must push the story or comedy forward with zero filler!
2. 0–2s SCROLL-STOPPING HOOK (Beat 1): Start IMMEDIATELY inside a wild discovery, outrageous mistake, sneaky scheme, or bizarre confrontation (max 11 words). NEVER start with greetings, "Once upon a time", "Did you know", "In this video", or slow background setup.
3. 60-SECOND MINI-MOVIE ARC (keep viewers hooked every 5-8 seconds, and vary plot shapes so no two episodes feel templated!):
   - Beat 1 (0-2s): Explosive visual + spoken hook that raises an immediate question.
   - Beats 2-4 (3-15s): Establish the colorful setting, expressive characters, and why this situation is wild or risky.
   - Beats 5-7 (16-30s): Snappy character banter & conflict introducing surprising new information or a funny deadpan reaction.
   - Beats 8-10 (31-45s): Unexpected escalation or clever complication — someone gets caught, doubles down, or spots a clue.
   - Beats 11-13 (46-55s): The major reveal or clever turning point nobody saw coming.
   - Beats 14-15 (56-60s): COMPLETE, SATISFYING ENDING — fully resolve the conflict on screen with a punchy final payoff, clear conclusion, and definitive final line (STRICTLY NO cliffhangers, NO "to be continued", NO unanswered question at the end, and NO "like and subscribe"!).
4. NATURAL CHARACTER CONVERSATIONS & PERSONALITY:
   - Use Hero ("${heroName}") and Partner ("${partnerName}") with distinct outfits, colors, hats/accessories, and personalities that STAY IDENTICAL across all scenes.
   - Mix crisp, playful storytelling narration ("narrator") with snappy spoken dialogue ("hero", "partner") that sounds like real people reacting with wit, shock, or dry humor — zero robotic lines!
   - Keep location continuity: stay in the same "scene" during a continuous conversation, and change "scene" only when the story genuinely moves locations!
   - Vary "shot" cinematically: use "wide" to establish a location, "medium" for conversations, "closeup" for intense reveals, and "reaction" for funny/shocked facial expressions.
5. STRICTLY BANNED BORING CLICHÉS & REPEATED MOTIFS:
   - NEVER write lottery-ticket stories, greedy shopkeeper stories, rich-vs-poor moral lectures, generic revenge stories, school-textbook facts, or repeat ANY object/motif from the previous stories list above.
   - NEVER rely on region-specific slang or local cultural references — keep situations universally relatable in the US, UK, Canada, and Australia.
6. FORMATTING:
   - Write all numbers in "lines[].text" as spoken English words (e.g., "forty dollars", "ten minutes") for clean TTS voiceover.
   - In "title" and "hookText", keep it punchy and under 54 chars / 2-3 words (short digits OK in title/hookText).
   - Return ONLY raw valid JSON (no markdown code fences):
{
  "title": "Curiosity-sparking mini-movie title under 54 chars",
  "hookText": "2-3 WORD HOOK",
  "genre": "${genreObj.id}",
  "summary": "2-sentence summary of the full story and its payoff",
  "setting": "Specific colorful primary location",
  "centralConflict": "One clear sentence describing the core conflict",
  "mainEvents": ["Event 1", "Event 2", "Event 3", "Event 4"],
  "twist": "The unexpected reveal or turning point",
  "ending": "The final satisfying payoff",
  "conceptFingerprint": "6-10 lowercase keywords uniquely capturing this core story idea",
  "description": "2 engaging sentences teasing the twist without spoiling it + a comment question + #Shorts",
  "tags": ["shorts", "animatedstory", "storytime", "plottwist", "animation", "tag6"],
  "characters": {
    "hero": {
      "name": "First name",
      "role": "Short role (e.g. baker, dog walker, rookie intern)",
      "personality": "2-3 personality traits",
      "look": {
        "body": "#HEX",
        "pattern": "plain | check | stripes | overalls | vest | apron",
        "patCol": "#HEX",
        "hat": "none | cap | bowler | boater | beanie | visor | tophat | bun | flower",
        "hatCol": "#HEX",
        "band": "#HEX",
        "neck": "none | bowtie | tie | scarf | collar",
        "neckCol": "#HEX",
        "extra": ["glasses or mustache or freckles or blush or pencil"]
      }
    },
    "partner": {
      "name": "First name",
      "role": "Short role",
      "personality": "2-3 personality traits",
      "look": {
        "body": "#HEX",
        "pattern": "plain | check | stripes | overalls | vest | apron",
        "patCol": "#HEX",
        "hat": "none | cap | bowler | boater | beanie | visor | tophat | bun | flower",
        "hatCol": "#HEX",
        "band": "#HEX",
        "neck": "none | bowtie | tie | scarf | collar",
        "neckCol": "#HEX",
        "extra": ["glasses or mustache or freckles or blush"]
      }
    }
  },
  "lines": [
    {
      "text": "Punchy spoken narration or natural character dialogue (8-12 words, numbers spelled out)",
      "speaker": "narrator | hero | partner | extra",
      "scene": "one of: ${schema.scenes.join(' | ')}",
      "shot": "wide | medium | closeup | reaction",
      "mood": "one of: ${schema.moods.join(' | ')}",
      "partnerMood": "one of: ${schema.moods.join(' | ')}",
      "action": "stand | walk | run | jump | point | wave | shrug | gasp",
      "prop": "OPTIONAL one of: ${schema.props.join(' | ') || 'none'}",
      "badge": "OPTIONAL 1-2 WORD OVERLAY ON KEY REVEALS ONLY",
      "badgeSub": "OPTIONAL SHORT SUBTEXT",
      "badgeColor": "gold | green | red | cream",
      "pill": "OPTIONAL 2-WORD PILL",
      "sfx": "ding | pop | boing | stamp | slam | sparkle | thud | alarm | tock"
    }
  ]
}`;
}

async function generateWithOllama(styleId, genreObj, storyMemory, usedTitles, ollamaUrl, ollamaModel, attempt) {
  const base = (ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: ctrl.signal,
    body: JSON.stringify({
      model: ollamaModel || 'llama3.2',
      prompt: buildMiniMoviePrompt(styleId, genreObj, storyMemory, usedTitles, attempt),
      format: 'json',
      stream: false,
      options: { temperature: 0.92 },
    }),
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
  const data = await res.json();
  return sanitizeBlueprint(JSON.parse(data.response), styleId, genreObj);
}

async function generateWithGemini(styleId, genreObj, storyMemory, usedTitles, apiKey, model, attempt) {
  const candidates = [...new Set([model || 'gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])];
  let lastErr = null;
  for (const m of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildMiniMoviePrompt(styleId, genreObj, storyMemory, usedTitles, attempt) }] }],
        generationConfig: {
          temperature: 0.95,
          responseMimeType: 'application/json',
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      lastErr = new Error(`Gemini (${m}) failed (${res.status}): ${data.error?.message || JSON.stringify(data).slice(0, 160)}`);
      if (res.status === 404 || res.status === 429) continue;
      throw lastErr;
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    return sanitizeBlueprint(JSON.parse(cleaned), styleId, genreObj);
  }
  throw lastErr || new Error('All Gemini fallback models failed.');
}

export async function generateUniqueStory(styleId, { forceSource = null, genre = null } = {}) {
  const st = getState();
  const usedTitles = [...new Set([...(st.usedTitles || []), ...st.jobs.map((j) => j.title).filter(Boolean)])];
  const storyMemory = Array.isArray(st.storyMemory) ? st.storyMemory : [];
  const sourceMode = forceSource || st.settings.storySource || 'auto';

  const pickGenre = () => {
    const gId = genre || nextGenreId(MINI_MOVIE_GENRES.map((g) => g.id));
    return MINI_MOVIE_GENRES.find((g) => g.id === gId) || MINI_MOVIE_GENRES[0];
  };

  // 1. Try local Ollama (if enabled & running) with full Quality Control & Dedup Gate
  if (sourceMode === 'auto' || sourceMode === 'hybrid' || sourceMode === 'ollama') {
    const status = await checkOllamaStatus(st.settings.ollamaUrl);
    if (status.running && status.models.length > 0) {
      const model = status.models.includes(st.settings.ollamaModel) ? st.settings.ollamaModel : status.models[0];
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const gObj = pickGenre();
          addLog('INFO', `Generating 60s "${gObj.label}" mini-movie via local Ollama (${model}, attempt ${attempt})...`);
          const story = await generateWithOllama(styleId, gObj, storyMemory, usedTitles, st.settings.ollamaUrl, model, attempt);
          const qc = evaluateStoryQuality(story);
          if (qc.ok) {
            return { story, generatedBy: `ollama:${model}` };
          }
          addLog('WARN', `QC rejected Ollama draft "${story.title}": ${qc.issues.join('; ')} — regenerating...`);
        } catch (err) {
          addLog('WARN', `Ollama attempt ${attempt} failed: ${err.message}`);
          break;
        }
      }
    } else if (sourceMode === 'ollama') {
      throw new Error('Ollama is not running on ' + st.settings.ollamaUrl);
    }
  }

  // 2. Try Free Cloud Gemini API (works 24/7 in GitHub Actions even when laptop is OFF!) with full QC Gate
  const gemKey = (st.settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  if ((sourceMode === 'auto' || sourceMode === 'hybrid' || sourceMode === 'gemini') && gemKey) {
    let bestFallback = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const gObj = pickGenre();
        addLog('INFO', `Generating 60s "${gObj.label}" mini-movie via Gemini API (${st.settings.geminiModel}, attempt ${attempt})...`);
        const story = await generateWithGemini(styleId, gObj, storyMemory, usedTitles, gemKey, st.settings.geminiModel, attempt);
        const qc = evaluateStoryQuality(story);
        if (qc.ok) {
          addLog('INFO', `QC PASSED (${qc.wordCount} words, ${story.lines.length} beats, genre=${story.genre}): "${story.title}"`);
          return { story, generatedBy: `gemini:${st.settings.geminiModel}` };
        }
        // Keep best non-duplicate candidate only if every issue was just mild word-count variance
        const hardFail = qc.issues.some((i) => /duplicate|similar|banned|missing|cliffhanger|ending|question|already used/i.test(i));
        if (!hardFail && (!bestFallback || Math.abs(qc.wordCount - 145) < Math.abs(bestFallback.wordCount - 145))) {
          bestFallback = story;
        }
        addLog('WARN', `QC rejected Gemini draft "${story.title}" (${qc.wordCount}w): ${qc.issues.join('; ')} — regenerating...`);
      } catch (err) {
        addLog('WARN', `Gemini attempt ${attempt} failed: ${err.message}`);
        if (attempt >= 2) break;
      }
    }
    if (bestFallback && !isStoryDuplicate(bestFallback)) {
      addLog('WARN', `Using best validated non-duplicate draft (${bestFallback.wordCount} words): "${bestFallback.title}"`);
      return { story: bestFallback, generatedBy: `gemini:${st.settings.geminiModel}` };
    }
  } else if (sourceMode === 'gemini') {
    throw new Error('Gemini API key is not configured.');
  }

  // 3. Fallback to strictly unused stories from the verified bank (NEVER repeats!)
  let pool = STORY_BANK.filter((s) => s.style === styleId && !isStoryDuplicate(s.key, s.title));
  if (!pool.length) pool = STORY_BANK.filter((s) => !isStoryDuplicate(s.key, s.title));
  if (!pool.length) {
    throw new Error(
      'All offline bank stories have been used! To generate unlimited original 60s mini-movies, configure a free Gemini API key or start local Ollama.',
    );
  }
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { story: sanitizeBlueprint(picked, picked.style), generatedBy: 'offline-bank' };
}

export function offlineBankSummary() {
  const total = STORY_BANK.length;
  const remaining = STORY_BANK.filter((s) => !isStoryDuplicate(s.key, s.title)).length;
  return { total, remaining, used: total - remaining };
}
