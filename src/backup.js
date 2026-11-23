import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { BACKUP_DIR } from './config.js';
import { state, mutate, save, uid } from './store.js';
import { listDatabases } from './mysql.js';
import { dumpDatabase } from './dump.js';
import { scheduleToCron, nextRun } from './cron.js';

export const events = new EventEmitter();
events.setMaxListeners(100);

const queue = [];
const active = new Map(); // runId -> { cancelRequested }
let running = 0;
let pumping = false;

function emit(type, payload) {
  events.emit('event', { type, at: new Date().toISOString(), ...payload });
}

function findJob(jobId) {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error('Agendamento não encontrado.');
  return job;
}

function findConnection(connectionId) {
  const conn = state.connections.find((c) => c.id === connectionId);
  if (!conn) throw new Error('Conexão não encontrada.');
  return conn;
}

export function isJobBusy(jobId) {
  return [...active.values()].some((c) => c.jobId === jobId) || queue.some((q) => q.jobId === jobId);
}

export function activeRuns() {
  return [...active.entries()].map(([runId, ctx]) => ({ runId, jobId: ctx.jobId }));
}

/**
 * Enfileira a execução de um job. Retorna imediatamente com o id do run.
 */
export function requestRun(jobId, trigger = 'manual') {
  const job = findJob(jobId);
  if (isJobBusy(jobId)) throw new Error('Este agendamento já está em execução.');

  const run = {
    id: uid('run'),
    jobId: job.id,
    jobName: job.name,
    connectionId: job.connectionId,
    connectionName: findConnection(job.connectionId).name,
    trigger,
    status: 'queued',
    startedAt: null,
    queuedAt: new Date().toISOString(),
    finishedAt: null,
    databases: [],
    totals: { databases: 0, ok: 0, failed: 0, bytes: 0, rows: 0 },
    error: null,
  };

  queue.push({ runId: run.id, jobId: job.id, trigger });
  mutate((s) => {
    s.runs.unshift(run);
  });
  emit('run-queued', { runId: run.id, jobId: job.id, jobName: job.name });
  pump();
  return run.id;
}

export function cancelRun(runId) {
  const ctx = active.get(runId);
  if (ctx) {
    ctx.cancelRequested = true;
    emit('run-cancelling', { runId });
    return true;
  }
  const idx = queue.findIndex((q) => q.runId === runId);
  if (idx >= 0) {
    const [item] = queue.splice(idx, 1);
    mutate((s) => {
      const run = s.runs.find((r) => r.id === item.runId);
      if (run) {
        run.status = 'cancelled';
        run.finishedAt = new Date().toISOString();
        run.error = 'Cancelado antes de iniciar.';
      }
    });
    emit('run-finished', { runId: item.runId, jobId: item.jobId, status: 'cancelled' });
    return true;
  }
  return false;
}

function pump() {
  if (pumping) return;
  pumping = true;
  try {
    const max = Math.max(1, Number(state.settings.maxConcurrentJobs) || 1);
    while (running < max && queue.length) {
      const item = queue.shift();
      running += 1;
      const ctx = { jobId: item.jobId, runId: item.runId, cancelRequested: false };
      active.set(item.runId, ctx);
      executeRun(item, ctx)
        .catch((err) => console.error('[backup] erro inesperado:', err))
        .finally(() => {
          active.delete(item.runId);
          running -= 1;
          pump();
        });
    }
  } finally {
    pumping = false;
  }
}

function timestampName(date = new Date()) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}${pad(date.getMilliseconds(), 3)}`
  );
}

function safeFolderName(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
}

/** Prefixo de arquivo por banco, estável e sem colisão entre nomes sanitizados. */
function dbFilePrefix(database) {
  const safe = safeFolderName(database);
  if (safe === database) return safe;
  let hash = 0;
  for (const ch of String(database)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return `${safe}-${hash.toString(36).slice(0, 6)}`;
}

function updateRun(runId, patch) {
  mutate((s) => {
    const run = s.runs.find((r) => r.id === runId);
    if (run) Object.assign(run, typeof patch === 'function' ? patch(run) : patch);
  });
}

async function executeRun(item, ctx) {
  const run = state.runs.find((r) => r.id === item.runId);
  if (!run) return;
  const job = state.jobs.find((j) => j.id === item.jobId);
  if (!job) {
    updateRun(run.id, { status: 'failed', error: 'Agendamento removido.', finishedAt: new Date().toISOString() });
    emit('run-finished', { runId: run.id, jobId: item.jobId, status: 'failed' });
    return;
  }

  const connection = state.connections.find((c) => c.id === job.connectionId);
  if (!connection) {
    updateRun(run.id, {
      status: 'failed',
      error: 'Conexão do agendamento não existe mais.',
      finishedAt: new Date().toISOString(),
    });
    emit('run-finished', { runId: run.id, jobId: job.id, status: 'failed' });
    return;
  }

  updateRun(run.id, { status: 'running', startedAt: new Date().toISOString() });
  emit('run-started', { runId: run.id, jobId: job.id, jobName: job.name });

  const jobDir = path.join(BACKUP_DIR, safeFolderName(job.id));
  await fs.promises.mkdir(jobDir, { recursive: true });

  let databases = Array.isArray(job.databases) ? [...job.databases] : [];
  const startedAt = Date.now();
  let totals = { databases: 0, ok: 0, failed: 0, bytes: 0, rows: 0 };
  let fatalError = null;

  try {
    if (!databases.length || databases.includes('*')) {
      const available = await listDatabases(connection);
      databases = available.map((d) => d.name);
    }
    if (!databases.length) throw new Error('Nenhum banco de dados disponível para backup.');

    totals.databases = databases.length;
    updateRun(run.id, (r) => ({
      ...r,
      databases: databases.map((name) => ({
        name,
        status: 'pending',
        file: null,
        bytes: 0,
        rows: 0,
        tables: 0,
        durationMs: 0,
        error: null,
      })),
    }));

    for (const database of databases) {
      if (ctx.cancelRequested) {
        updateRun(run.id, (r) => {
          const db = r.databases.find((d) => d.name === database);
          if (db) { db.status = 'cancelled'; db.error = 'Cancelado.'; }
          return r;
        });
        continue;
      }

      const index = run.databases.findIndex((d) => d.name === database);
      const fileName = `${dbFilePrefix(database)}__${timestampName()}.sql.gz`;
      const filePath = path.join(jobDir, fileName);
      const relativePath = path.relative(BACKUP_DIR, filePath).split(path.sep).join('/');

      updateRun(run.id, (r) => {
        const db = r.databases.find((d) => d.name === database);
        if (db) db.status = 'running';
      });
      emit('database-started', { runId: run.id, jobId: job.id, database, index });

      try {
        const result = await dumpDatabase({
          connection,
          database,
          filePath,
          isCancelled: () => ctx.cancelRequested,
          onProgress: (progress) => {
            emit('database-progress', {
              runId: run.id,
              jobId: job.id,
              database,
              index,
              ...progress,
            });
          },
        });

        totals.ok += 1;
        totals.bytes += result.bytes;
        totals.rows += result.rows;

        updateRun(run.id, (r) => {
          const db = r.databases.find((d) => d.name === database);
          if (db) {
            db.status = 'success';
            db.file = relativePath;
            db.bytes = result.bytes;
            db.uncompressedBytes = result.uncompressedBytes;
            db.rows = result.rows;
            db.tables = result.tables;
            db.views = result.views;
            db.durationMs = result.durationMs;
            db.finishedAt = new Date().toISOString();
          }
          r.totals = { ...totals };
          return r;
        });
        emit('database-finished', {
          runId: run.id,
          jobId: job.id,
          database,
          index,
          status: 'success',
          bytes: result.bytes,
          rows: result.rows,
          durationMs: result.durationMs,
        });
      } catch (err) {
        const cancelled = ctx.cancelRequested;
        totals.failed += 1;
        const message = cancelled ? 'Cancelado pelo usuário.' : err.message;
        updateRun(run.id, (r) => {
          const db = r.databases.find((d) => d.name === database);
          if (db) {
            db.status = cancelled ? 'cancelled' : 'failed';
            db.error = message;
            db.finishedAt = new Date().toISOString();
          }
          r.totals = { ...totals };
          return r;
        });
        emit('database-finished', {
          runId: run.id,
          jobId: job.id,
          database,
          index,
          status: cancelled ? 'cancelled' : 'failed',
          error: message,
        });
        if (!cancelled) console.error(`[backup] ${job.name}/${database}:`, err.message);
      }

      try {
        await applyRetention(job, jobDir, database);
      } catch (err) {
        console.error('[backup] retenção:', err.message);
      }
    }
  } catch (err) {
    fatalError = err.message;
  }

  const success = totals.ok > 0 && totals.failed === 0;
  const status = ctx.cancelRequested
    ? 'cancelled'
    : fatalError
      ? 'failed'
      : totals.ok === 0
        ? 'failed'
        : totals.failed === 0
          ? 'success'
          : 'partial';

  const finishedAt = new Date().toISOString();
  updateRun(run.id, (r) => ({
    ...r,
    status,
    finishedAt,
    durationMs: Date.now() - startedAt,
    totals,
    error: fatalError || (status === 'failed' && totals.failed ? 'Todas as bases falharam.' : null),
  }));

  const next = job.enabled ? nextRunForJob(job) : null;
  mutate((s) => {
    const storedJob = s.jobs.find((j) => j.id === job.id);
    if (storedJob) {
      storedJob.lastRunAt = finishedAt;
      storedJob.lastStatus = status;
      storedJob.lastRunId = run.id;
      storedJob.nextRunAt = next ? next.toISOString() : null;
    }
  });

  emit('run-finished', {
    runId: run.id,
    jobId: job.id,
    status,
    totals,
    durationMs: Date.now() - startedAt,
  });
}

/** Aplica a política de retenção de arquivos de um banco. */
async function applyRetention(job, jobDir, database) {
  const retention = job.retention || {};
  const keepLast = Number(retention.keepLast) || 0;
  const keepDays = Number(retention.keepDays) || 0;
  if (!keepLast && !keepDays) return;

  const prefix = `${dbFilePrefix(database)}__`;
  const entries = (await fs.promises.readdir(jobDir))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.sql.gz'))
    .sort()
    .reverse();

  const now = Date.now();
  const toDelete = [];
  entries.forEach((name, index) => {
    const tooOld =
      keepDays > 0 && now - fs.statSync(path.join(jobDir, name)).mtimeMs > keepDays * 86400000;
    const beyondCount = keepLast > 0 && index >= keepLast;
    if (tooOld || beyondCount) toDelete.push(name);
  });

  for (const name of toDelete) {
    await fs.promises.rm(path.join(jobDir, name), { force: true });
    emit('backup-deleted', { jobId: job.id, database, file: name, reason: 'retention' });
  }
}

export function nextRunForJob(job) {
  try {
    const cron = scheduleToCron(job.schedule);
    if (!cron) return null;
    return nextRun(cron);
  } catch {
    return null;
  }
}

/** Recalcula nextRunAt de todos os jobs (startup/edição). */
export function refreshNextRuns() {
  for (const job of state.jobs) {
    const next = job.enabled ? nextRunForJob(job) : null;
    job.nextRunAt = next ? next.toISOString() : null;
  }
  save();
}

export function listBackupFiles() {
  const result = [];
  if (!fs.existsSync(BACKUP_DIR)) return result;
  const walk = (dir, depth) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 2) walk(full, depth + 1);
      } else if (entry.name.endsWith('.sql.gz') || entry.name.endsWith('.sql')) {
        const stat = fs.statSync(full);
        result.push({
          path: path.relative(BACKUP_DIR, full).split(path.sep).join('/'),
          bytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    }
  };
  walk(BACKUP_DIR, 0);
  return result.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}
