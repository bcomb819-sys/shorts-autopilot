// 24/7 Interval Scheduler + Batch Queue (posts every 2 hours / 72m / 4h automatically without approval)
import { runShortPipeline } from './pipeline.js';
import { addLog, getState, todayStats, updateSettings } from './store.js';

let activePromise = null;
let pendingQueue = [];
let tickHandle = null;

export function isBusy() {
  return Boolean(activePromise);
}

export function queueLength() {
  return pendingQueue.length;
}

export function enqueueRun(opts = {}) {
  pendingQueue.push(opts);
  drainQueue();
  return pendingQueue.length;
}

async function drainQueue() {
  if (activePromise || pendingQueue.length === 0) return;
  const next = pendingQueue.shift();
  activePromise = (async () => {
    try {
      await runShortPipeline(next);
    } catch {
      // already logged inside pipeline
    } finally {
      activePromise = null;
      if (pendingQueue.length > 0) setImmediate(drainQueue);
    }
  })();
}

export function scheduleNext(fromNowMinutes = null) {
  const st = getState();
  const mins = Math.max(10, Number(fromNowMinutes ?? st.settings.intervalMinutes ?? 120));
  const nextRunAt = new Date(Date.now() + mins * 60_000).toISOString();
  updateSettings({ nextRunAt });
  return nextRunAt;
}

export function startScheduler() {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    const st = getState();
    if (!st.settings.autopilotEnabled) return;
    if (activePromise || pendingQueue.length > 0) return;

    const stats = todayStats();
    if (stats.generatedToday >= Number(st.settings.dailyLimit || 12)) {
      return;
    }

    const now = Date.now();
    const dueAt = st.settings.nextRunAt ? Date.parse(st.settings.nextRunAt) : 0;
    if (!dueAt || now >= dueAt) {
      addLog('INFO', `Autopilot timer triggered (${stats.generatedToday + 1}/${st.settings.dailyLimit} today, interval ${st.settings.intervalMinutes}m)`);
      scheduleNext(st.settings.intervalMinutes);
      enqueueRun({ upload: true });
    }
  }, 15_000);
}

export function triggerAutopilotToggle(enabled) {
  if (enabled) {
    // Schedule first run in 5 seconds if none is queued, then every intervalMinutes
    const soon = new Date(Date.now() + 5_000).toISOString();
    updateSettings({ autopilotEnabled: true, nextRunAt: soon });
    addLog('INFO', `AUTOPILOT ENABLED — posting 1 Short every ${getState().settings.intervalMinutes} min (up to ${getState().settings.dailyLimit}/day, zero approval).`);
  } else {
    updateSettings({ autopilotEnabled: false, nextRunAt: null });
    addLog('INFO', 'Autopilot paused.');
  }
}
