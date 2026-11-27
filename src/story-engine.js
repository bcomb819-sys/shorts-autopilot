// Strict Zero-Repeat Story Engine:
// Priority in 'auto' mode: Local Ollama -> Free Cloud Gemini API -> Unused Verified 24-Story Bank.
// NEVER repeats or recycles a previously used story or overlapping topic!
import crypto from 'node:crypto';
import { ALL_STYLES } from './config.js';
import { addLog, getState, isStoryDuplicate } from './store.js';
import { STORY_BANK } from './story-bank.js';

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

const STYLE_SCHEMAS = {
  'tall-tale': {
    scenes: ['street', 'office', 'gallery', 'meadow', 'sunset'],
    moods: ['smug', 'happy', 'laugh', 'shock', 'worried', 'angry', 'proud', 'sly'],
    props: ['dollarBill', 'stack', 'paper', 'key', 'ticket', 'book', 'cup', 'parcels', 'letters', 'rubberStamp', 'sign'],
    guidance: 'A funny, clever, real verified true story (loophole, wild con, quirky historical event, surprising business trick). Hook in line 0 under 11 words. 7-9 short flowing lines (~95-115 words). End on a witty punchline.',
  },
  'deep-dive': {
    scenes: ['kitchen', 'xray', 'vessel', 'vessel_dark', 'xray_alarm', 'heart', 'blackout', 'kitchen_end'],
    moods: ['neutral'],
    props: [],
    guidance: 'A fascinating, scientifically accurate "What happens if...?" human body or health explainer (no gore). Hook question in line 0. 7-8 flowing lines (~95-110 words). Include short 2-word uppercase pill labels.',
  },
  'night-file': {
    scenes: ['cabin', 'walk', 'file', 'vanish', 'door', 'casewall'],
    moods: ['neutral'],
    props: [],
    guidance: 'A real, respectful unsolved mystery, strange signal, or historical disappearance (never accuse living people, no gore). Open with date + place in line 0. 5-7 calm, suspenseful lines (~80-100 words).',
  },
  'inside-out': {
    scenes: ['room', 'xray', 'macro', 'macro_burst', 'bounce', 'myth', 'stopwatch', 'warning', 'end'],
    moods: ['n', 'o', 'smile', 'smirk'],
    props: [],
    guidance: 'A punchy 2D "What happens when / Why does...?" body or everyday science explainer with a myth-busting twist. Hook question in line 0. 7-8 flowing lines (~90-110 words).',
  },
  'stick-story': {
    scenes: ['night_living', 'night_kitchen', 'night_hall', 'counter', 'day_living'],
    moods: ['calm', 'happy', 'worried', 'scared', 'determined'],
    props: [],
    guidance: 'A practical, accurate "What would you do if...?" survival or emergency step-by-step guide (Step 1, Step 2, Step 3). Hook scenario in line 0. 6-7 crisp lines (~85-105 words).',
  },
  'paper-atlas': {
    scenes: ['map', 'hall', 'harbor', 'night_city', 'fire', 'timeline', 'seal'],
    moods: ['neutral'],
    props: [],
    guidance: 'A surprising, verified real-world historical event told vividly (no violence/gore). Open with the year and hook in line 0. 6-7 storybook lines (~85-105 words).',
  },
};

function sanitizeBlueprint(raw, styleId) {
  const styleMeta = ALL_STYLES.find((s) => s.id === styleId) || ALL_STYLES[0];
  const schema = STYLE_SCHEMAS[styleId] || STYLE_SCHEMAS['tall-tale'];
  if (!raw || !Array.isArray(raw.lines) || raw.lines.length < 4) {
    throw new Error('Story blueprint missing valid lines array.');
  }

  const lines = raw.lines
    .slice(0, 12)
    .map((ln, idx) => {
      const text = String(ln.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      const scene = schema.scenes.includes(ln.scene) ? ln.scene : schema.scenes[idx % schema.scenes.length];
      const mood = schema.moods.includes(ln.mood) ? ln.mood : schema.moods[0];
      const out = {
        text,
        scene,
        mood,
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

  const title = String(raw.title || 'Unbelievable True Story').replace(/[\r\n]+/g, ' ').trim().slice(0, 90);
  const hookText = String(raw.hookText || title.split(' ').slice(0, 3).join(' ')).toUpperCase().slice(0, 20);
  const rawDesc = String(raw.description || `${title} — watch till the end!`).trim();
  const description = rawDesc.includes('#shorts') ? rawDesc : `${rawDesc}\n\n#shorts`;
  const tags = Array.isArray(raw.tags) && raw.tags.length
    ? raw.tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 10)
    : ['shorts', styleId.replace('-', ''), 'facts', 'truestory', 'viral'];
  const key = raw.key || `ai-${crypto.createHash('sha1').update(title.toLowerCase()).digest('hex').slice(0, 12)}`;

  return {
    key,
    style: styleId,
    title,
    hookText,
    description,
    tags,
    voice: raw.voice || styleMeta.voice,
    speed: Number(raw.speed) || styleMeta.speed,
    music: raw.music || styleMeta.music,
    categoryId: String(raw.categoryId || styleMeta.categoryId),
    sources: Array.isArray(raw.sources) && raw.sources.length ? raw.sources : ['AI-generated story'],
    lines,
  };
}

function buildStoryPrompt(styleId, usedTitles, nicheTopics, attempt = 1) {
  const schema = STYLE_SCHEMAS[styleId] || STYLE_SCHEMAS['tall-tale'];
  const recentUsed = usedTitles.slice(-80).join(' | ');
  const angles = ['unusual world history', 'human body surprise', 'clever real-world loophole', 'science myth busted', 'engineering marvel', 'weird law or invention', 'ocean or space mystery', 'everyday survival tip'];
  const randomAngle = angles[Math.floor(Math.random() * angles.length)];

  return `You are a viral YouTube Shorts scriptwriter. Create ONE 100% BRAND-NEW, NEVER-BEFORE-USED 35-second Short in style "${styleId}".
Style guidance: ${schema.guidance}
Topic inspiration: ${nicheTopics || randomAngle} (fresh angle seed #${attempt}-${Date.now() % 997}: ${randomAngle}).
STRICT UNIQUENESS RULE: Do NOT repeat, rephrase, or overlap ANY of these already-used stories:
${recentUsed || '(none yet)'}

Rules:
- Hook the viewer in the FIRST 2 SECONDS (line 0 must be under 11 words and shocking/curious).
- Write all numbers in "text" as spoken English words (e.g., "nineteen ninety five", "five thousand") for TTS.
- Keep each line 1 natural clause (8-15 words), 6-9 lines total (~95-110 words).
- Return ONLY raw valid JSON (no markdown fences):
{
  "title": "Eye-catching viral Shorts title under 60 chars",
  "hookText": "2-3 WORD COVER HOOK",
  "description": "2-sentence viral description ending with #shorts",
  "tags": ["shorts", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "sources": ["Reliable source name"],
  "lines": [
    {
      "text": "Spoken narration line with numbers spelled out",
      "scene": "one of: ${schema.scenes.join(' | ')}",
      "mood": "one of: ${schema.moods.join(' | ')}",
      "badge": "OPTIONAL 1-2 WORD OVERLAY",
      "badgeSub": "OPTIONAL SUBTEXT",
      "badgeColor": "gold | green | red | cream",
      "pill": "OPTIONAL 2-WORD PILL",
      "sfx": "ding | pop | boing | stamp | slam | sparkle | thud | alarm | tock"
    }
  ]
}`;
}

async function generateWithOllama(styleId, usedTitles, nicheTopics, ollamaUrl, ollamaModel, attempt) {
  const base = (ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: ctrl.signal,
    body: JSON.stringify({
      model: ollamaModel || 'llama3.2',
      prompt: buildStoryPrompt(styleId, usedTitles, nicheTopics, attempt),
      format: 'json',
      stream: false,
      options: { temperature: 0.9 },
    }),
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
  const data = await res.json();
  return sanitizeBlueprint(JSON.parse(data.response), styleId);
}

async function generateWithGemini(styleId, usedTitles, nicheTopics, apiKey, model, attempt) {
  const m = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildStoryPrompt(styleId, usedTitles, nicheTopics, attempt) }] }],
      generationConfig: {
        temperature: 0.95,
        responseMimeType: 'application/json',
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini API failed (${res.status}): ${data.error?.message || JSON.stringify(data).slice(0, 180)}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return sanitizeBlueprint(JSON.parse(cleaned), styleId);
}

export async function generateUniqueStory(styleId, { forceSource = null } = {}) {
  const st = getState();
  const usedTitles = [...new Set([...(st.usedTitles || []), ...st.jobs.map((j) => j.title).filter(Boolean)])];
  const sourceMode = forceSource || st.settings.storySource || 'auto';

  // 1. Try local Ollama (if enabled & running) — up to 3 attempts to guarantee 100% unique topic
  if (sourceMode === 'auto' || sourceMode === 'hybrid' || sourceMode === 'ollama') {
    const status = await checkOllamaStatus(st.settings.ollamaUrl);
    if (status.running && status.models.length > 0) {
      const model = status.models.includes(st.settings.ollamaModel) ? st.settings.ollamaModel : status.models[0];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          addLog('INFO', `Generating unique "${styleId}" story via local Ollama (${model}, attempt ${attempt})...`);
          const story = await generateWithOllama(styleId, usedTitles, st.settings.nicheTopics, st.settings.ollamaUrl, model, attempt);
          if (!isStoryDuplicate(story.key, story.title)) {
            return { story, generatedBy: `ollama:${model}` };
          }
          addLog('WARN', `Ollama returned similar topic "${story.title}", retrying for a completely new story...`);
        } catch (err) {
          addLog('WARN', `Ollama attempt ${attempt} failed: ${err.message}`);
          break;
        }
      }
    } else if (sourceMode === 'ollama') {
      throw new Error('Ollama is not running on ' + st.settings.ollamaUrl);
    }
  }

  // 2. Try Free Cloud Gemini API (works 24/7 in Docker / GitHub Actions even when laptop is off!)
  const gemKey = (st.settings.geminiApiKey || process.env.GEMINI_API_KEY || '').trim();
  if ((sourceMode === 'auto' || sourceMode === 'hybrid' || sourceMode === 'gemini') && gemKey) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        addLog('INFO', `Generating unique "${styleId}" story via Gemini API (${st.settings.geminiModel}, attempt ${attempt})...`);
        const story = await generateWithGemini(styleId, usedTitles, st.settings.nicheTopics, gemKey, st.settings.geminiModel, attempt);
        if (!isStoryDuplicate(story.key, story.title)) {
          return { story, generatedBy: `gemini:${st.settings.geminiModel}` };
        }
        addLog('WARN', `Gemini returned similar topic "${story.title}", retrying for a completely new story...`);
      } catch (err) {
        addLog('WARN', `Gemini attempt ${attempt} failed: ${err.message}`);
        break;
      }
    }
  } else if (sourceMode === 'gemini') {
    throw new Error('Gemini API key is not configured.');
  }

  // 3. Fallback to strictly unused stories from the verified 24-story bank (NEVER repeats!)
  let pool = STORY_BANK.filter((s) => s.style === styleId && !isStoryDuplicate(s.key, s.title));
  if (!pool.length) pool = STORY_BANK.filter((s) => !isStoryDuplicate(s.key, s.title));
  if (!pool.length) {
    throw new Error(
      'All 24 offline bank stories have already been used! To guarantee 100% unique stories forever, start local Ollama (ollama pull llama3.2) OR paste a free Gemini API key in Settings.',
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
