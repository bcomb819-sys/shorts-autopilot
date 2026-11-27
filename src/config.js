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
  { id: 'tall-tale', name: 'Tall Tale 3D', voice: 'am_michael', speed: 1.06, music: 'bounce', fps: 30, categoryId: '23', desc: 'Funny true stories in a sunny 3D cartoon world' },
  { id: 'deep-dive', name: 'Deep Dive 3D', voice: 'am_michael', speed: 1.02, music: 'tension', fps: 24, categoryId: '27', desc: '3D x-ray "what happens if" science explainers' },
  { id: 'night-file', name: 'Night File 3D', voice: 'am_onyx', speed: 0.96, music: 'tension', fps: 24, categoryId: '24', desc: 'Dark 3D mysteries & true-crime case files' },
  { id: 'inside-out', name: 'Inside Out 2D', voice: 'am_michael', speed: 1.04, music: 'bed', fps: 30, categoryId: '27', desc: 'Punchy 2D flat x-ray explainers' },
  { id: 'stick-story', name: 'Stick Story 2D', voice: 'am_puck', speed: 1.05, music: 'bed', fps: 30, categoryId: '27', desc: 'Stick-figure "what would you do if" survival guides' },
  { id: 'paper-atlas', name: 'Paper Atlas 2D', voice: 'bm_george', speed: 1.0, music: 'tension', fps: 30, categoryId: '27', desc: 'Cut-paper history with maps and gold date ribbons' },
];

export const DEFAULT_SETTINGS = {
  autopilotEnabled: false,
  autoPost: true,            // Post immediately without manual approval once YouTube is connected
  requireApproval: false,    // Explicitly no approval required
  strictUnique: true,        // NEVER repeat or recycle any previous story
  intervalMinutes: 120,      // Default: 1 Short every 2 hours (configurable to 72m for 20/day)
  dailyLimit: 12,            // Configurable: 6, 12, or 20/day
  privacyStatus: 'public',   // public | unlisted | private
  enabledStyles: ALL_STYLES.map((s) => s.id),
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  storySource: 'auto',       // auto (Ollama -> Gemini -> Unused Bank) | ollama | gemini | bank
  nicheTopics: 'crazy true stories, surprising human body science, unsolved mysteries, clever survival tips, wild historical twists',
  uploadThumbnail: false,    // Keep FALSE for YouTube Shorts! Uploading a 16:9 thumbnail via API makes YouTube classify uploads as regular Videos instead of Shorts.
  bakeVerticalCover: true,   // Prepend 0.15s of the 1080x1920 vertical cover frame so YouTube Shorts shows an eye-catching cover automatically
  draftMode: false,
  nextRunAt: null,
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(JOBS_DIR, { recursive: true });
