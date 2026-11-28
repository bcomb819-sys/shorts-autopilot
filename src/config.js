import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const APP_ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(APP_ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'db.json');
export const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
export const JOBS_DIR = process.env.JOBS_DIR || path.join(os.homedir(), 'faceless-shorts', '_autopilot');
export const SKILL_DIR = process.env.SKILL_DIR || [
  path.join(APP_ROOT, 'vendor', 'faceless-shorts'),
  path.join(os.homedir(), '.gemini', 'config', 'skills', 'faceless-shorts'),
  path.join(os.homedir(), '.claude', 'skills', 'faceless-shorts'),
].find((p) => fs.existsSync(p)) || path.join(os.homedir(), '.gemini', 'config', 'skills', 'faceless-shorts');

export const FACELESS_HOME = process.env.FACELESS_HOME || path.join(os.homedir(), '.faceless-shorts');
export const PORT = Number(process.env.PORT || 3456);
export const HOST = process.env.HOST || '127.0.0.1';

export const PYTHON_BIN = process.env.PYTHON_BIN || [
  path.join(FACELESS_HOME, 'venv', 'Scripts', 'python.exe'),
  path.join(FACELESS_HOME, 'venv', 'bin', 'python'),
  'python3',
  'python',
].find((p) => p === 'python3' || p === 'python' || fs.existsSync(p));

export const CHROME_BIN = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && fs.existsSync(p));

export const ALL_STYLES = [
  { id: 'tall-tale', name: 'Tall Tale 3D', voice: 'am_michael', voiceLabel: 'Michael (US Male · Storyteller)', speed: 1.0, music: 'bounce', fps: 30, categoryId: '23', desc: 'Polished 60s 3D cartoon mini-movies with expressive characters, natural dialogue & clever twists' },
  { id: 'deep-dive', name: 'Deep Dive 3D', voice: 'am_fenrir', voiceLabel: 'Fenrir (US Male · Dramatic Narrator)', speed: 0.99, music: 'tension', fps: 24, categoryId: '24', desc: '60s 3D character suspense & unexpected discovery mini-movies with cinematic close-ups' },
  { id: 'inside-out', name: 'Inside Out 2D', voice: 'af_heart', voiceLabel: 'Heart (US Female · Warm Storyteller)', speed: 1.0, music: 'bed', fps: 30, categoryId: '24', desc: 'Vibrant 60s 2D animated character mini-movies with visual gags & heartfelt twists' },
  { id: 'stick-story', name: 'Stick Story 2D', voice: 'am_puck', voiceLabel: 'Puck (US Male · Comedy Storyteller)', speed: 1.0, music: 'bed', fps: 30, categoryId: '23', desc: 'Lively 60s animated comedy & clever problem-solving stories with expressive characters' },
  { id: 'night-file', name: 'Night File 3D', voice: 'am_onyx', voiceLabel: 'Onyx (US Male · Mystery Narrator)', speed: 0.95, music: 'tension', fps: 24, categoryId: '24', desc: 'Cinematic 60s 3D mystery & suspense mini-movies with gripping twists' },
  { id: 'paper-atlas', name: 'Paper Atlas 2D', voice: 'bm_george', voiceLabel: 'George (UK Male · Storybook)', speed: 0.98, music: 'tension', fps: 30, categoryId: '24', desc: 'Crafted 60s cut-paper animated mini-movies across richly lit worlds & surprising payoffs' },
];

export const DEFAULT_SETTINGS = {
  autopilotEnabled: false,
  autoPost: true,            // Post immediately without manual approval once YouTube is connected
  requireApproval: false,    // Explicitly no approval required
  strictUnique: true,        // NEVER repeat or recycle any previous story
  styleOrderMode: 'shuffle', // 'shuffle' (balanced Fisher-Yates shuffle across enabled styles, never back-to-back) | 'sequential'
  intervalMinutes: 120,      // Default: 1 Short every 2 hours (configurable to 72m for 20/day)
  dailyLimit: 12,            // Configurable: 6, 12, or 20/day
  privacyStatus: 'public',   // public | unlisted | private
  enabledStyles: ['tall-tale'], // Matches reference video's 3D animated cartoon mini-movie presentation by default (all 6 styles still toggleable in Dashboard)
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  storySource: 'auto',       // auto (Ollama -> Gemini -> Unused Bank) | ollama | gemini | bank
  nicheTopics: 'original 60-second animated mini-movies: mystery, situational comedy, suspense, heartfelt twists, unexpected discoveries, clever problem-solving, friendship, family, workplace chaos, secret kindness',
  uploadThumbnail: true,     // Uploads 9:16 vertical 1080x1920 cover.jpg via thumbnails.set AFTER YouTube finishes processing the Short
  bakeVerticalCover: true,   // Also prepends 0.20s of 1080x1920 cover.jpg on frame 0 as a mobile-app fallback
  ntfyTopic: process.env.NTFY_TOPIC || 'storybyte-boss-701927', // Instant $0 phone push alert topic (ntfy app)
  whatsappPhone: process.env.WHATSAPP_PHONE || '+917019192787',
  callmebotApiKey: process.env.CALLMEBOT_API_KEY || '',
  draftMode: false,
  nextRunAt: null,
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(JOBS_DIR, { recursive: true });
