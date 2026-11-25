import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { APP_VERSION, BACKUP_DIR, DATA_DIR, HOST, PORT, PUBLIC_DIR } from './config.js';
import { encrypt } from './secrets.js';
import { publicConnection, state, mutate, uid } from './store.js';
import { listDatabases, listTables, testConnection } from './mysql.js';
import {
  cancelRun,
  events,
  isJobBusy,
  nextRunForJob,
  requestRun,
} from './backup.js';
import {
  backupFileId, backupFolder, legacyBackupId, listBackupFiles, normalizeBackupBase,
  resolveBackupFile, verifyBackupBase,
} from './backup-files.js';
import { restoreDump } from './restore.js';
import { canPickBackupFolder, pickBackupFolder } from './folder-picker.js';
import { describeSchedule, isValidCron, scheduleToCron } from './cron.js';
import { startScheduler } from './scheduler.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Execuções que estavam em andamento quando o processo foi encerrado.
function markInterruptedRuns() {
  mutate(() => {
    for (const run of state.runs) {
      if (run.status === 'running' || run.status === 'queued') {
        run.status = 'failed';
        run.finishedAt = new Date().toISOString();
        run.error = run.error || 'Interrompido pela reinicialização do aplicativo.';
        for (const db of run.databases || []) {
          if (db.status === 'running' || db.status === 'pending') {
            db.status = 'failed';
            db.error = db.error || 'Interrompido pela reinicialização do aplicativo.';
          }
        }
      }
    }
  });
}

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------------------------------------------------------- estado geral

function serializeJob(job) {
  const next = job.enabled ? nextRunForJob(job) : null;
  return {
    ...job,
    scheduleText: describeSchedule(job.schedule),
    nextRunAt: next ? next.toISOString() : null,
    busy: isJobBusy(job.id),
    backupFolder: backupFolder(job),
    connectionName:
      state.connections.find((c) => c.id === job.connectionId)?.name || '(conexão removida)',
  };
}

function stats(files) {
  let totalBytes = 0;
  let totalBackups = 0;
  let failedLast24h = 0;
  const cutoff = Date.now() - 24 * 3600 * 1000;
  for (const run of state.runs) {
    for (const db of run.databases || []) {
      if (db.status === 'success') {
        totalBytes += db.bytes || 0;
        totalBackups += 1;
      }
      if (db.status === 'failed' && new Date(run.startedAt || run.queuedAt).getTime() >= cutoff) {
        failedLast24h += 1;
      }
    }
  }
  const lastRun = state.runs.find((r) => r.finishedAt) || null;
  return {
    totalBytes,
    totalBackups,
    failedLast24h,
    connections: state.connections.length,
    jobs: state.jobs.length,
    enabledJobs: state.jobs.filter((j) => j.enabled).length,
    lastRunAt: lastRun?.finishedAt || null,
    lastRunStatus: lastRun?.status || null,
    diskFiles: files.length,
    diskBytes: files.reduce((sum, f) => sum + f.bytes, 0),
  };
}

app.get('/api/state', asyncRoute(async (req, res) => {
  const limit = Math.min(Number(req.query.runs) || 60, 400);
  const { files, unavailable } = await listBackupFiles();
  res.json({
    version: APP_VERSION,
    serverTime: new Date().toISOString(),
    paths: { dataDir: DATA_DIR, backupDir: BACKUP_DIR },
    canPickBackupFolder: canPickBackupFolder(req),
    settings: state.settings,
    connections: state.connections.map(publicConnection),
    jobs: state.jobs.map(serializeJob),
    runs: state.runs.slice(0, limit).map((run) => ({
      ...run,
      databases: (run.databases || []).map((db) => db.file && !db.fileId
        ? { ...db, fileId: backupFileId('default', db.file) }
        : db),
    })),
    stats: stats(files),
    backups: files,
    unavailableBackupFolders: unavailable,
  });
}));

app.get('/api/health', (req, res) => res.json({ ok: true, version: APP_VERSION }));

// ---------------------------------------------------------------- conexões

function readConnectionPayload(body, existing = null) {
  const name = String(body.name || '').trim();
  const host = String(body.host || '').trim();
  const user = String(body.user || '').trim();
  const port = Number(body.port || 3306);
  if (!name) throw new Error('Informe um nome para a conexão.');
  if (!host) throw new Error('Informe o host do MySQL.');
  if (!user) throw new Error('Informe o usuário do MySQL.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida.');

  const passwordProvided = typeof body.password === 'string' && body.password.length > 0;
  let passwordEnc = existing?.passwordEnc || '';
  if (passwordProvided) passwordEnc = encrypt(body.password);
  else if (body.clearPassword) passwordEnc = '';

  return {
    name,
    host,
    port,
    user,
    passwordEnc,
    ssl: Boolean(body.ssl),
    sslInsecure: Boolean(body.sslInsecure),
    connectTimeout: Number(body.connectTimeout) || 15000,
  };
}

app.post('/api/connections', asyncRoute(async (req, res) => {
  const payload = readConnectionPayload(req.body);
  const conn = {
    id: uid('conn'),
    ...payload,
    createdAt: new Date().toISOString(),
    lastTestAt: null,
    lastTestOk: null,
  };
  mutate((s) => s.connections.push(conn));
  res.status(201).json(publicConnection(conn));
}));

app.put('/api/connections/:id', asyncRoute(async (req, res) => {
  const existing = state.connections.find((c) => c.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Conexão não encontrada.' });
  const payload = readConnectionPayload(req.body, existing);
  mutate((s) => {
    const target = s.connections.find((c) => c.id === req.params.id);
    Object.assign(target, payload);
  });
  res.json(publicConnection(existing));
}));

app.delete('/api/connections/:id', asyncRoute(async (req, res) => {
  const used = state.jobs.filter((j) => j.connectionId === req.params.id);
  if (used.length) {
    return res.status(409).json({
      error: `Esta conexão está em uso por ${used.length} agendamento(s). Remova-os antes.`,
    });
  }
  mutate((s) => {
    s.connections = s.connections.filter((c) => c.id !== req.params.id);
  });
  res.json({ ok: true });
}));

async function connectionForTest(body) {
  if (body.id) {
    const stored = state.connections.find((c) => c.id === body.id);
    if (!stored) throw new Error('Conexão não encontrada.');
    if (typeof body.password !== 'string' || body.password.length === 0) return stored;
    return { ...stored, passwordEnc: encrypt(body.password) };
  }
  const payload = readConnectionPayload({ ...body, name: body.name || 'teste' });
  return { id: 'temp', ...payload };
}

app.post('/api/connections/test', asyncRoute(async (req, res) => {
  const conn = await connectionForTest(req.body);
  try {
    const result = await testConnection(conn);
    if (req.body.id) {
      mutate((s) => {
        const stored = s.connections.find((c) => c.id === req.body.id);
        if (stored) {
          stored.lastTestAt = new Date().toISOString();
          stored.lastTestOk = true;
        }
      });
    }
    res.json(result);
  } catch (err) {
    if (req.body.id) {
      mutate((s) => {
        const stored = s.connections.find((c) => c.id === req.body.id);
        if (stored) {
          stored.lastTestAt = new Date().toISOString();
          stored.lastTestOk = false;
        }
      });
    }
    res.status(400).json({ error: err.message, code: err.code });
  }
}));

app.get('/api/connections/:id/databases', asyncRoute(async (req, res) => {
  const conn = state.connections.find((c) => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'Conexão não encontrada.' });
  res.json({ databases: await listDatabases(conn) });
}));

app.get('/api/connections/:id/tables', asyncRoute(async (req, res) => {
  const conn = state.connections.find((c) => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'Conexão não encontrada.' });
  if (!req.query.database) return res.status(400).json({ error: 'Informe o banco.' });
  res.json({ tables: await listTables(conn, String(req.query.database)) });
}));

// ---------------------------------------------------------------- agendamentos

function readJobPayload(body, existing = null) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('Informe um nome para o agendamento.');

  const connectionId = String(body.connectionId || '');
  if (!state.connections.some((c) => c.id === connectionId)) {
    throw new Error('Selecione uma conexão válida.');
  }

  let databases = Array.isArray(body.databases) ? body.databases.map(String).filter(Boolean) : [];
  if (!databases.length) throw new Error('Selecione ao menos um banco de dados.');
  if (databases.includes('*')) databases = ['*'];

  const schedule = body.schedule || { mode: 'manual' };
  if (!['manual', 'daily', 'weekly', 'cron'].includes(schedule.mode)) {
    throw new Error('Modo de agenda inválido.');
  }
  if (schedule.mode === 'cron' && !isValidCron(schedule.cron)) {
    throw new Error('Expressão cron inválida.');
  }
  scheduleToCron(schedule); // valida horário/dias

  const retention = {
    keepLast: Math.max(0, Number(body.retention?.keepLast ?? state.settings.defaultKeepLast) || 0),
    keepDays: Math.max(0, Number(body.retention?.keepDays) || 0),
  };

  return {
    name,
    connectionId,
    databases,
    schedule: {
      mode: schedule.mode,
      time: schedule.time || '02:00',
      days: Array.isArray(schedule.days) ? schedule.days.map(Number) : [],
      cron: schedule.cron || '0 2 * * *',
    },
    retention,
    backupBase: body.backupBase === undefined ? (existing?.backupBase || '') : normalizeBackupBase(body.backupBase),
    enabled: body.enabled === undefined ? true : Boolean(body.enabled),
    notes: String(body.notes || ''),
  };
}

// Configurar ou sondar um destino pode acessar um compartilhamento de rede.
function checkDestinationRequest(req, res, next) {
  const host = req.get('host');
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  const loopback = ['127.0.0.1', 'localhost', '[::1]'];
  const configured = HOST === '::1' ? '[::1]' : HOST.toLowerCase();
  try {
    const requestUrl = new URL(`${req.protocol}://${host}`);
    const localBind = loopback.includes(configured);
    const hostAllowed = !localBind || loopback.includes(requestUrl.hostname);
    if (host && hostAllowed && (!origin || origin === requestUrl.origin) &&
        (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'none')) return next();
  } catch { /* cabeçalho inválido */ }
  res.status(403).json({ error: 'Origem não permitida para configurar a pasta de backup.' });
}

app.post('/api/jobs/check-backup-folder', checkDestinationRequest, asyncRoute(async (req, res) => {
  const base = normalizeBackupBase(req.body?.backupBase);
  const jobId = req.body?.jobId;
  const job = jobId === undefined ? null : state.jobs.find((item) => item.id === jobId);
  if (jobId !== undefined && !job) {
    return res.status(404).json({ error: 'Agendamento não encontrado.' });
  }
  try {
    res.json({ folder: await verifyBackupBase(base, job?.id) });
  } catch (err) {
    throw new Error(`Não foi possível gravar na pasta ${base || BACKUP_DIR}: ${err.code || err.message}`);
  }
}));

app.post('/api/jobs/pick-backup-folder', checkDestinationRequest, asyncRoute(async (req, res) => {
  if (!canPickBackupFolder(req)) {
    return res.status(403).json({ error: 'A seleção de pasta só está disponível no Windows, abrindo o app neste computador.' });
  }
  const initial = normalizeBackupBase(req.body?.backupBase) || BACKUP_DIR;
  const selected = await pickBackupFolder(initial);
  res.json({ backupBase: selected === null ? null : normalizeBackupBase(selected) });
}));

app.post('/api/jobs', checkDestinationRequest, asyncRoute(async (req, res) => {
  const payload = readJobPayload(req.body);
  const job = {
    id: uid('job'),
    ...payload,
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastStatus: null,
    lastRunId: null,
    nextRunAt: null,
  };
  mutate((s) => s.jobs.push(job));
  res.status(201).json(serializeJob(job));
}));

app.put('/api/jobs/:id', checkDestinationRequest, asyncRoute(async (req, res) => {
  const existing = state.jobs.find((j) => j.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  const payload = readJobPayload(req.body, existing);
  mutate((s) => {
    const target = s.jobs.find((j) => j.id === req.params.id);
    Object.assign(target, payload);
  });
  res.json(serializeJob(existing));
}));

app.delete('/api/jobs/:id', asyncRoute(async (req, res) => {
  if (isJobBusy(req.params.id)) {
    return res.status(409).json({ error: 'Aguarde a execução atual terminar antes de excluir.' });
  }
  const existing = state.jobs.find((j) => j.id === req.params.id);
  if (!existing) return res.status(404).json({ error: 'Agendamento não encontrado.' });
  mutate((s) => {
    s.jobs = s.jobs.filter((j) => j.id !== req.params.id);
  });
  res.json({ ok: true });
}));

app.post('/api/jobs/:id/run', asyncRoute(async (req, res) => {
  const runId = requestRun(req.params.id, 'manual');
  res.status(202).json({ runId });
}));

// ---------------------------------------------------------------- execuções

app.get('/api/runs/:id', (req, res) => {
  const run = state.runs.find((r) => r.id === req.params.id);
  if (!run) return res.status(404).json({ error: 'Execução não encontrada.' });
  res.json(run);
});

app.post('/api/runs/:id/cancel', (req, res) => {
  const ok = cancelRun(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Execução não está em andamento.' });
  res.json({ ok: true });
});

// ---------------------------------------------------------------- arquivos

async function requireBackupFile(id) {
  try {
    return await resolveBackupFile(id);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw Object.assign(new Error('Arquivo de backup não encontrado.'), { status: 404 });
    }
    throw err;
  }
}

app.get('/api/backups', asyncRoute(async (req, res) => {
  const { files, unavailable } = await listBackupFiles();
  res.json({ files, unavailable, totalBytes: files.reduce((a, b) => a + b.bytes, 0) });
}));

app.get('/api/backups/download', asyncRoute(async (req, res) => {
  const abs = await requireBackupFile(req.query.id ?? legacyBackupId(req.query.path));
  res.download(abs, path.basename(abs));
}));

app.delete('/api/backups', asyncRoute(async (req, res) => {
  const id = req.query.id ?? legacyBackupId(req.query.path);
  await fs.unlink(await requireBackupFile(id));
  mutate((s) => {
    for (const run of s.runs) {
      for (const db of run.databases || []) {
        if (db.file && (db.fileId || backupFileId('default', db.file)) === id) db.fileMissing = true;
      }
    }
  });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- restauração

app.post('/api/restore', asyncRoute(async (req, res) => {
  const { connectionId, targetDatabase, fileId, filePath, recreate } = req.body || {};
  const connection = state.connections.find((c) => c.id === connectionId);
  if (!connection) return res.status(400).json({ error: 'Selecione uma conexão de destino.' });
  if (!fileId && !filePath) return res.status(400).json({ error: 'Selecione um arquivo de backup.' });
  if (!targetDatabase) return res.status(400).json({ error: 'Informe o banco de destino.' });

  const id = fileId ?? legacyBackupId(filePath);
  const abs = await requireBackupFile(id);

  const runId = uid('restore');
  events.emit('event', {
    type: 'restore-started',
    runId,
    targetDatabase,
    file: id,
    at: new Date().toISOString(),
  });
  try {
    const result = await restoreDump({
      connection,
      targetDatabase,
      filePath: abs,
      recreate: Boolean(recreate),
      onProgress: (p) => {
        events.emit('event', {
          type: 'restore-progress',
          runId,
          targetDatabase,
          at: new Date().toISOString(),
          ...p,
        });
      },
    });
    events.emit('event', {
      type: 'restore-finished',
      runId,
      targetDatabase,
      status: 'success',
      at: new Date().toISOString(),
      ...result,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    events.emit('event', {
      type: 'restore-finished',
      runId,
      targetDatabase,
      status: 'failed',
      error: err.message,
      at: new Date().toISOString(),
    });
    throw err;
  }
}));

// ---------------------------------------------------------------- configurações

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  mutate((s) => {
    if (body.defaultKeepLast !== undefined) {
      s.settings.defaultKeepLast = Math.max(0, Number(body.defaultKeepLast) || 0);
    }
    if (body.maxConcurrentJobs !== undefined) {
      s.settings.maxConcurrentJobs = Math.min(4, Math.max(1, Number(body.maxConcurrentJobs) || 1));
    }
    if (body.runHistoryLimit !== undefined) {
      s.settings.runHistoryLimit = Math.min(2000, Math.max(20, Number(body.runHistoryLimit) || 400));
    }
  });
  res.json(state.settings);
});

// ---------------------------------------------------------------- eventos (SSE)

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const handler = (payload) => send(payload);
  events.on('event', handler);

  const keepAlive = setInterval(() => res.write(`: ping ${Date.now()}\n\n`), 25000);
  req.on('close', () => {
    clearInterval(keepAlive);
    events.off('event', handler);
  });
});

// ---------------------------------------------------------------- estático

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[api]', err.message);
  res.status(err.status || 400).json({ error: err.message });
});

const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  MySQL Backup Studio ' + APP_VERSION);
  console.log(`  Abra no navegador: http://${HOST}:${PORT}`);
  console.log(`  Pasta de dados   : ${DATA_DIR}`);
  console.log(`  Pasta de backups : ${BACKUP_DIR}`);
  console.log('');
  markInterruptedRuns();
  startScheduler();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[server] A porta ${PORT} já está em uso. Feche o outro processo ou defina outra porta com a variável PORT.\n`);
  } else {
    console.error('\n[server]', err.message, '\n');
  }
  process.exit(1);
});

export { app };
