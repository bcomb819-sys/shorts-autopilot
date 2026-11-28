// Strict Zero-Repeat Story Engine:
// Priority in 'auto' mode: Local Ollama -> Free Cloud Gemini API -> Unused Verified 24-Story Bank.
// NEVER repeats or recycles a previously used story or overlapping topic!
import crypto from 'node:crypto';
import { ALL_STYLES } from './config.js';
import { addLog, getState, isStoryDuplicate } from './store.js';
import { STORY_BANK } from './story-bank.js';
import { VIRAL_TOPICS } from './viral-topics.js';

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
    angles: [
      'crazy legal or business loophole someone exploited',
      'audacious real-life heist or clever con artist trick',
      'funny weird history event that actually happened',
      'bizarre marketing stunt or billion-dollar accidental fortune',
      'ordinary person who outsmarted a giant corporation or government',
    ],
    guidance: 'Tall Tale 3D (expressive 2D cartoon characters inside a bright 3D miniature world): A funny, clever, verified true story — crazy loopholes, heists, scams, or weird history. Hook in line 0 under 11 words. 7-9 short flowing lines (~95-115 words). End on a witty punchline.',
  },
  'deep-dive': {
    scenes: ['kitchen', 'xray', 'vessel', 'vessel_dark', 'xray_alarm', 'heart', 'blackout', 'kitchen_end'],
    moods: ['neutral'],
    props: [],
    angles: [
      'what happens inside your body if you get stung by a bullet ant or venomous creature',
      'what happens if you swallow something strange or hold a reflex too long',
      'what happens inside your heart, lungs, or blood vessels under extreme stress or cold',
      'what happens if you stay awake too long or drink too much energy drink',
      'Zack D. Films style surprising medical or organ chain reaction inside the human body',
    ],
    guidance: 'Deep Dive 3D (Zack D. Films style 3D medical and body explainer with x-ray organs & blood vessels): A fascinating, scientifically accurate "What happens if...?" human body or medical chain-reaction explainer (no gore). Hook question in line 0. 7-8 flowing lines (~95-110 words). Include short 2-word uppercase pill labels.',
  },
  'night-file': {
    scenes: ['cabin', 'walk', 'file', 'vanish', 'door', 'casewall'],
    moods: ['neutral'],
    props: [],
    angles: [
      'eerie real unsolved mystery or baffling historical disappearance',
      'unexplained radio signal, ghost ship, or strange radar anomaly',
      'famous cold case file or mysterious heist where the culprit vanished',
      'spooky historical event or eerie abandoned place with real documented records',
    ],
    guidance: 'Night File 3D (dark, moody 3D mystery & case file): A real, respectful unsolved mystery, strange crime case file, unexplained signal, or spooky historical mystery (never accuse living people, no gore). Open with date + place in line 0. 5-7 calm, suspenseful lines (~80-100 words).',
  },
  'inside-out': {
    scenes: ['room', 'xray', 'macro', 'macro_burst', 'bounce', 'myth', 'stopwatch', 'warning', 'end'],
    moods: ['n', 'o', 'smile', 'smirk'],
    props: [],
    angles: [
      'everyday human body quirk explained with a quick 2D cutaway (hiccups, brain freeze, goosebumps, yawning)',
      'popular health or food myth busted with clean science',
      'surprising biology happening inside your stomach, joints, eyes, or ears right now',
      'quick everyday physics or chemistry reaction inside your body',
    ],
    guidance: 'Inside Out 2D (clean 2D cutaways): A punchy, fast-paced science and health explainer that busts a myth or explains a weird body reaction in plain English. Hook question in line 0. 7-8 flowing lines (~90-110 words).',
  },
  'stick-story': {
    scenes: ['night_living', 'night_kitchen', 'night_hall', 'counter', 'day_living'],
    moods: ['calm', 'happy', 'worried', 'scared', 'determined'],
    props: [],
    angles: [
      'what would you do if caught in a rip current, quicksand, or sudden flood',
      'real survival life hack if your car brakes fail, car sinks, or you are stuck in an elevator',
      'emergency home safety steps (grease fire, gas leak, power outage, choking alone)',
      'outdoor survival rule (lightning storm, stray dog, bear encounter, extreme heat/cold)',
    ],
    guidance: 'Stick Story 2D (stick-figure survival guide): A practical, life-saving "What would you do if...?" survival life hack or emergency step-by-step guide with clear numbered steps (Step 1, Step 2, Step 3). Hook scenario in line 0. 6-7 crisp lines (~85-105 words).',
  },
  'paper-atlas': {
    scenes: ['map', 'hall', 'harbor', 'night_city', 'fire', 'timeline', 'seal'],
    moods: ['neutral'],
    props: [],
    angles: [
      'legendary historic battle won by a genius tactic or unexpected mistake',
      'rise, secret trick, or sudden fall of an ancient empire',
      'daring ocean voyage, lost expedition, or world-changing map discovery',
      'wild turning point in world history that reshaped borders or trade routes',
    ],
    guidance: 'Paper Atlas 2D (animated cut-paper maps & gold date ribbons): A vivid, verified story of a historic battle, ancient empire, famous voyage, or world-changing historical twist (no graphic violence). Open with the year and hook in line 0. 6-7 storybook lines (~85-105 words).',
  },
};

function sanitizeBlueprint(raw, styleId) {
  const styleMeta = ALL_STYLES.find((s) => s.id === styleId) || ALL_STYLES[0];
  const schema = STYLE_SCHEMAS[styleId] || STYLE_SCHEMAS['tall-tale'];
  if (!raw || !Array.isArray(raw.lines) || raw.lines.length < 4) {
    throw new Error('Story blueprint missing valid lines array.');
  }

  let prevScene = '';
  const lines = raw.lines
    .slice(0, 12)
    .map((ln, idx) => {
      const text = String(ln.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return null;
      let scene = schema.scenes.includes(ln.scene) ? ln.scene : schema.scenes[idx % schema.scenes.length];
      // Prevent static visuals: never repeat the exact same scene twice in a row!
      if (scene === prevScene && schema.scenes.length > 1) {
        const alts = schema.scenes.filter((s) => s !== prevScene);
        scene = alts[(idx + text.length) % alts.length];
      }
      prevScene = scene;
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
    voice: styleMeta.voice,
    speed: styleMeta.speed,
    music: styleMeta.music,
    categoryId: String(raw.categoryId || styleMeta.categoryId),
    sources: Array.isArray(raw.sources) && raw.sources.length ? raw.sources : ['AI-generated story'],
    lines,
  };
}

function premiseKey(premise) {
  return 'vp-' + crypto.createHash('sha1').update(String(premise)).digest('hex').slice(0, 10);
}

function pickFreshViralTopic(styleId, usedTitles) {
  const pool = VIRAL_TOPICS[styleId] || [];
  const unused = pool.filter((premise) => {
    const pk = premiseKey(premise);
    if (isStoryDuplicate(pk, premise)) return false;
    return !usedTitles.some((t) => {
      const a = premise.toLowerCase();
      const words = String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
      if (words.length < 2) return false;
      const hits = words.filter((w) => a.includes(w)).length;
      return hits / words.length >= 0.55;
    });
  });
  if (!unused.length) return null;
  const text = unused[Math.floor(Math.random() * unused.length)];
  return { key: premiseKey(text), text };
}

function buildStoryPrompt(styleId, usedTitles, nicheTopics, attempt = 1, curatedPremise = null) {
  const schema = STYLE_SCHEMAS[styleId] || STYLE_SCHEMAS['tall-tale'];
  const recentUsed = usedTitles.slice(-80).join(' | ');
  const angles = schema.angles || ['unusual world history', 'human body surprise', 'clever real-world loophole'];
  const randomAngle = angles[Math.floor(Math.random() * angles.length)];

  const premiseBlock = curatedPremise
    ? `REQUIRED VIRAL STORY PREMISE (turn THIS exact high-stakes true story/fact into an insanely gripping Short):\n"${curatedPremise}"`
    : `Pick ONE jaw-dropping, ultra-specific, REAL high-stakes topic matching: ${randomAngle} (seed #${attempt}-${Date.now() % 997}).\nBANNED BORING TOPICS: NEVER write dull school-textbook PSAs, vague generic advice ("what happens if you swear", "gas leak safety", "drink water"), or generic unnamed stories. MUST include real names, crazy numbers, or extreme physical/emotional stakes!`;

  return `You are the lead scriptwriter for a 50-million-view YouTube Shorts channel (Zack D. Films / Johnny Harris / Fern / Brew style).
Write ONE insanely gripping, binge-worthy 26-to-33-second Short in style "${styleId}".
Style look & tone: ${schema.guidance}

${premiseBlock}

STRICT UNIQUENESS RULE: Do NOT repeat, rephrase, or overlap ANY of these already-used stories:
${recentUsed || '(none yet)'}

HOW TO MAKE THIS SCRIPT IMPOSSIBLE TO SWIPE AWAY (FOLLOW EVERY RULE):
1. BRUTAL 0-2s HOOK (line 0): Max 9 words! Drop the viewer STRAIGHT into an everyday hidden object, a shocking paradox, or a high-stakes countdown.
   - GREAT examples: "That tiny pinhole in your plane window saves your life." / "He raised a price from forty to eighty and sold out." / "On Monday, he had seventy two hours left." / "One sign tricked an entire town."
   - BANNED boring openers: NEVER start with "Did you know", "Have you ever wondered", "Today we", "In this video", "Imagine", or generic definitions!
2. PUNCHY, SHORT CINEMATIC RHYTHM (Dex Explains / Hypothetically / Plizmo / Zack D. Films cadence): Write crisp, punchy, dramatic sentences with tension and irony — like telling your friend the wildest twist over coffee. Include exact numbers, countdown beats ("Monday... By Wednesday..."), or hidden-psychology reveals. Zero textbook fluff!
3. FAST MICRO-BEATS (7-10 short lines, 80-105 words total): Every line is 7-12 punchy spoken words so the visual scene cuts every 2.5 to 3.5 seconds!
4. MID-VIDEO PLOT TWIST / ESCALATION (line 3 or 4): Hit a sharp turn ("The boss laughed. Until Friday...", "Everyone thought it was a flaw—until...", "Then nobody noticed the one tiny catch...") right at the midpoint!
5. MIC-DROP PAYOFF ENDING (last line): End on a clever irony, mind-blowing reveal, or reverse-psychology punchline that makes viewers replay or comment immediately. ZERO "like and subscribe" or "stay safe" clichés.
6. Write numbers as spoken English words ONLY inside "lines[].text" (for crisp TTS voiceover). Inside "title" and "hookText", ALWAYS use short punchy digits like "$125M", "38 MIN", "1971" (never spell out long numbers in title or hookText, and keep hookText strictly 2-3 short words under 18 chars!).
7. Change "scene" on every line so the animation cuts dynamically every 2.5 seconds.
8. Return ONLY raw valid JSON (no markdown fences):
{
  "title": "Scroll-stopping viral Shorts title under 52 chars (punchy, specific, NOT textbook)",
  "hookText": "2-3 WORD SHOCKING HOOK",
  "description": "2-sentence gripping description with a question to spark comments, ending with #shorts",
  "tags": ["shorts", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "sources": ["Real source name"],
  "lines": [
    {
      "text": "Punchy spoken beat (7-11 words, numbers spelled out)",
      "scene": "one of: ${schema.scenes.join(' | ')}",
      "mood": "one of: ${schema.moods.join(' | ')}",
      "badge": "OPTIONAL 1-2 WORD BOLD OVERLAY",
      "badgeSub": "OPTIONAL SUBTEXT",
      "badgeColor": "gold | green | red | cream",
      "pill": "OPTIONAL 2-WORD PILL",
      "sfx": "ding | pop | boing | stamp | slam | sparkle | thud | alarm | tock"
    }
  ]
}`;
}

async function generateWithOllama(styleId, usedTitles, nicheTopics, ollamaUrl, ollamaModel, attempt, curatedPremise = null) {
  const base = (ollamaUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  const res = await fetch(`${base}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: ctrl.signal,
    body: JSON.stringify({
      model: ollamaModel || 'llama3.2',
      prompt: buildStoryPrompt(styleId, usedTitles, nicheTopics, attempt, curatedPremise),
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

async function generateWithGemini(styleId, usedTitles, nicheTopics, apiKey, model, attempt, curatedPremise = null) {
  const candidates = [...new Set([model || 'gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])];
  let lastErr = null;
  for (const m of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildStoryPrompt(styleId, usedTitles, nicheTopics, attempt, curatedPremise) }] }],
        generationConfig: {
          temperature: 0.9,
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
    return sanitizeBlueprint(JSON.parse(cleaned), styleId);
  }
  throw lastErr || new Error('All Gemini fallback models failed.');
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
          const picked = pickFreshViralTopic(styleId, usedTitles);
          addLog('INFO', `Generating unique "${styleId}" story via local Ollama (${model}, attempt ${attempt})...`);
          const story = await generateWithOllama(styleId, usedTitles, st.settings.nicheTopics, st.settings.ollamaUrl, model, attempt, picked?.text || null);
          if (picked?.key) story.key = picked.key;
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
        const picked = pickFreshViralTopic(styleId, usedTitles);
        addLog('INFO', `Generating unique "${styleId}" story via Gemini API (${st.settings.geminiModel}, attempt ${attempt}${picked ? ', curated viral premise' : ''})...`);
        const story = await generateWithGemini(styleId, usedTitles, st.settings.nicheTopics, gemKey, st.settings.geminiModel, attempt, picked?.text || null);
        if (picked?.key) story.key = picked.key;
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
