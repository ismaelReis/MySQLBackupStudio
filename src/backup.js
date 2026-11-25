import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { state, mutate, save, uid } from './store.js';
import { listDatabases } from './mysql.js';
import { dumpDatabase } from './dump.js';
import { scheduleToCron, nextRun } from './cron.js';
import {
  backupFileId, backupFolder, listRetentionFiles, prepareBackupFolder, resolveBackupFile,
} from './backup-files.js';

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
  const stored = state.jobs.find((j) => j.id === item.jobId);
  if (!stored) {
    updateRun(run.id, { status: 'failed', error: 'Agendamento removido.', finishedAt: new Date().toISOString() });
    emit('run-finished', { runId: run.id, jobId: item.jobId, status: 'failed' });
    return;
  }
  const job = { ...stored };

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

  let databases = Array.isArray(job.databases) ? [...job.databases] : [];
  const startedAt = Date.now();
  let totals = { databases: 0, ok: 0, failed: 0, bytes: 0, rows: 0 };
  let fatalError = null;

  try {
    let location;
    try {
      location = await prepareBackupFolder(job);
    } catch (err) {
      throw new Error(`Pasta de backup indisponível (${backupFolder(job)}): ${err.code || err.message}`);
    }
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
      const fileName = `${dbFilePrefix(database)}__${timestampName()}-${randomBytes(4).toString('hex')}.sql.gz`;
      const filePath = path.join(location.folder, fileName);
      const relativePath = location.id === 'default' ? `${job.id}/${fileName}` : fileName;
      const fileId = backupFileId(location.id, relativePath);

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
            db.fileId = fileId;
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
        try {
          await applyRetention(job, location, database);
        } catch (err) {
          console.error('[backup] retenção:', err.message);
        }
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

    }
  } catch (err) {
    fatalError = err.message;
  }

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
    error: fatalError,
    durationMs: Date.now() - startedAt,
  });
}

/** Aplica a política de retenção de arquivos de um banco. */
async function applyRetention(job, location, database) {
  const retention = job.retention || {};
  const keepLast = Number(retention.keepLast) || 0;
  const keepDays = Number(retention.keepDays) || 0;
  if (!keepLast && !keepDays) return;

  const prefix = `${dbFilePrefix(database)}__`;
  const entries = await listRetentionFiles(job, location, prefix);

  const now = Date.now();
  for (const [index, file] of entries.entries()) {
    const tooOld = keepDays > 0 && now - file.mtime > keepDays * 86400000;
    const beyondCount = keepLast > 0 && index >= keepLast;
    if (!tooOld && !beyondCount) continue;
    try {
      const target = await resolveBackupFile(file.id);
      const current = state.jobs.find((item) => item.id === job.id);
      if (!current || (current.backupBase || '') !== (job.backupBase || '')) return;
      await fs.unlink(target);
      emit('backup-deleted', { jobId: job.id, database, file: file.name, reason: 'retention' });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
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
