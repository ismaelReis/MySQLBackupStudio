import { state } from './store.js';
import { isJobBusy, requestRun } from './backup.js';
import { cronMatches, parseCron, scheduleToCron } from './cron.js';

const lastFired = new Map();
let timer = null;

function tick() {
  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  for (const job of state.jobs) {
    if (!job.enabled) continue;
    let parsed;
    try {
      const cron = scheduleToCron(job.schedule);
      if (!cron) continue;
      parsed = parseCron(cron);
    } catch {
      continue;
    }
    if (!cronMatches(parsed, now)) continue;
    if (lastFired.get(job.id) === minuteKey) continue;

    lastFired.set(job.id, minuteKey);
    if (isJobBusy(job.id)) {
      console.warn(`[scheduler] ${job.name}: já em execução, pulando este horário.`);
      continue;
    }
    try {
      const runId = requestRun(job.id, 'schedule');
      console.log(`[scheduler] ${job.name}: execução iniciada (${runId}).`);
    } catch (err) {
      console.error(`[scheduler] ${job.name}:`, err.message);
    }
  }
}

export function startScheduler() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 20000);
  timer.unref?.();
  console.log('[scheduler] agendador ativo (verificação a cada 20s).');
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
