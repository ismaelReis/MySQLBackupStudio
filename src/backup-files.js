import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { BACKUP_DIR, DATA_DIR } from './config.js';
import { state, mutate } from './store.js';

const DEFAULT = 'default';
const OWNER_FILE = '.mbs-destination';
const jobName = /^job_[a-z0-9]+$/;
const backupFile = /\.(?:sql|sql\.gz)$/i;
const managedFile = /^.+__\d{8}-\d{9}(?:-[a-f0-9]{8})?\.sql\.gz$/;

function comparable(value) {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function inside(root, child) {
  const rel = path.relative(root, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export function normalizeBackupBase(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value)) {
    throw new Error('Caminho de backup inválido.');
  }
  const input = value.trim();
  if (!input) return '';
  if (!path.isAbsolute(input) || (process.platform === 'win32' &&
      (!/^(?:[a-z]:[\\/]|[\\/]{2}[^\\/?.]+[^\\/]*[\\/][^\\/]+)/i.test(input) ||
       /[:<>|"*?]/.test(input.replace(/^[a-z]:/i, ''))))) {
    throw new Error('Informe um caminho absoluto para a pasta de backup.');
  }
  const base = path.resolve(input);
  return comparable(base) === comparable(BACKUP_DIR) ? '' : base;
}

export function backupFolder(job) {
  return path.join(job.backupBase || BACKUP_DIR, job.id);
}

async function inspectBase(base) {
  const real = await fs.realpath(base);
  if (!(await fs.stat(real)).isDirectory()) throw new Error('O destino não é uma pasta.');
  const data = await fs.realpath(DATA_DIR);
  if (comparable(real) === comparable(data) || inside(data, real)) {
    throw new Error('Escolha a pasta padrão ou um destino fora da pasta de dados do aplicativo.');
  }
  return real;
}

async function probeWrite(folder) {
  const probe = path.join(folder, `.mbs-check-${randomUUID()}`);
  const handle = await fs.open(probe, 'wx', 0o600);
  try {
    await handle.close();
  } finally {
    await fs.unlink(probe);
  }
}

async function entryExists(target) {
  try {
    await fs.lstat(target);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

function findDestination(base, jobId) {
  return state.backupDestinations.find(
    (item) => item.jobId === jobId && comparable(item.base) === comparable(base)
  );
}

function unregisteredFolderError() {
  return new Error('A subpasta do agendamento já existe e não está cadastrada.');
}

export async function verifyBackupBase(base, jobId) {
  const root = base ? await inspectBase(base) : await fs.realpath(BACKUP_DIR);
  if (jobId && !jobName.test(jobId)) throw new Error('Identificador de agendamento inválido.');
  const folder = jobId ? path.join(root, jobId) : root;
  const destination = base && jobId ? findDestination(root, jobId) : null;

  if (jobId && await entryExists(folder)) {
    if (base && !destination) throw unregisteredFolderError();
    await probeWrite(destination ? await ownedFolder(destination) : (await realEntry(root, jobId, true)).target);
  } else {
    if (destination && !destination.pending) throw new Error('A subpasta cadastrada não está acessível.');
    // Sem uma subpasta efetiva, verifica se a conta consegue criar uma e gravar nela.
    const scratch = await fs.mkdtemp(path.join(root, '.mbs-check-'));
    try {
      await probeWrite(scratch);
    } finally {
      await fs.rmdir(scratch);
    }
  }
  return folder;
}

async function realEntry(parent, name, directory = false) {
  const target = path.join(parent, name);
  const info = await fs.lstat(target);
  const real = await fs.realpath(target);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()) ||
      comparable(real) !== comparable(target)) {
    throw new Error('Destino de backup inválido ou redirecionado.');
  }
  return { target, info };
}

async function ownedFolder(destination) {
  const base = await inspectBase(destination.base);
  if (comparable(base) !== comparable(destination.base)) throw new Error('A pasta de backup foi redirecionada.');
  const { target } = await realEntry(base, destination.jobId, true);
  const { target: marker, info } = await realEntry(target, OWNER_FILE);
  if (info.size !== destination.id.length || await fs.readFile(marker, 'utf8') !== destination.id) {
    throw new Error('A pasta não pertence a este agendamento.');
  }
  return target;
}

async function initializeDestination(destination) {
  const { base, jobId, id } = destination;
  const folder = path.join(base, jobId);
  if (!await entryExists(folder)) {
    // A subpasta definitiva só aparece depois que o marcador está pronto.
    const staged = await fs.mkdtemp(path.join(base, '.mbs-init-'));
    const marker = path.join(staged, OWNER_FILE);
    try {
      await fs.writeFile(marker, id, { flag: 'wx', mode: 0o600 });
      if (await entryExists(folder)) throw unregisteredFolderError();
      await fs.rename(staged, folder);
    } catch (err) {
      await fs.unlink(marker).catch(() => {});
      await fs.rmdir(staged).catch(() => {});
      throw err;
    }
  }
  // Se o processo parou após a renomeação, só retoma com o mesmo marcador.
  const owned = await ownedFolder(destination);
  try {
    mutate(() => { delete destination.pending; });
  } catch (err) {
    destination.pending = true;
    throw err;
  }
  return owned;
}

export async function prepareBackupFolder(job) {
  if (!jobName.test(job.id)) throw new Error('Identificador de agendamento inválido.');
  if (!job.backupBase) {
    const root = await fs.realpath(BACKUP_DIR);
    await fs.mkdir(path.join(root, job.id), { recursive: true });
    const { target } = await realEntry(root, job.id, true);
    return { id: DEFAULT, folder: target };
  }

  const base = await inspectBase(job.backupBase);
  let destination = findDestination(base, job.id);
  if (!destination) {
    if (await entryExists(path.join(base, job.id))) throw unregisteredFolderError();
    destination = { id: randomUUID(), base, jobId: job.id, pending: true };
    try {
      mutate((s) => s.backupDestinations.push(destination));
    } catch (err) {
      state.backupDestinations = state.backupDestinations.filter((item) => item !== destination);
      throw err;
    }
  }
  const folder = destination.pending ? await initializeDestination(destination) : await ownedFolder(destination);
  return { id: destination.id, folder };
}

function validRelative(relative) {
  return typeof relative === 'string' && relative.length <= 4096 && backupFile.test(relative) &&
    relative.split('/').every((part) => part && part !== '.' && part !== '..' && !/[:\\\x00-\x1f]/.test(part));
}

export function backupFileId(locationId, relative) {
  return `${locationId}:${Buffer.from(relative, 'utf8').toString('base64url')}`;
}

export function legacyBackupId(relative) {
  if (!validRelative(relative)) throw new Error('Caminho de backup inválido.');
  return backupFileId(DEFAULT, relative);
}

export async function resolveBackupFile(id) {
  if (typeof id !== 'string' || id.length > 22000 || !/^(?:default|[a-f0-9-]{36}):[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error('Identificador de backup inválido.');
  }
  const [locationId, encoded] = id.split(':');
  const relative = Buffer.from(encoded, 'base64url').toString('utf8');
  if (!validRelative(relative) || backupFileId(locationId, relative) !== id) {
    throw new Error('Identificador de backup inválido.');
  }
  const parts = relative.split('/');
  let folder;
  if (locationId === DEFAULT) {
    if (parts.length > 3) throw new Error('Caminho de backup inválido.');
    folder = await fs.realpath(BACKUP_DIR);
  } else {
    const destination = state.backupDestinations.find((item) => item.id === locationId);
    if (!destination || parts.length !== 1 || !managedFile.test(relative)) {
      throw new Error('Backup não encontrado.');
    }
    folder = await ownedFolder(destination);
  }
  for (const dir of parts.slice(0, -1)) {
    folder = (await realEntry(folder, dir, true)).target;
  }
  return (await realEntry(folder, parts.at(-1))).target;
}

const pendingScans = new Map();
const scanQueue = [];
const scanWaiters = new Set();
let activeCustomScans = 0;
const SCAN_DEADLINE_MS = 1500;
const MAX_CUSTOM_SCANS = 2;

async function scanDestination(destination) {
  const files = [];
  const locationId = destination.id;
  async function scan(folder, prefix = '', depth = 0) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      try {
        if (entry.isDirectory() && locationId === DEFAULT && depth < 2) {
          const { target } = await realEntry(folder, entry.name, true);
          await scan(target, `${relative}/`, depth + 1);
        } else if (entry.isFile() && validRelative(relative) &&
            (locationId === DEFAULT || managedFile.test(entry.name))) {
          const { info } = await realEntry(folder, entry.name);
          const id = backupFileId(locationId, relative);
          files.push({
            id,
            path: relative,
            displayPath: path.join(folder, entry.name),
            bytes: info.size,
            modifiedAt: info.mtime.toISOString(),
          });
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
  }
  try {
    const folder = locationId === DEFAULT ? await fs.realpath(BACKUP_DIR) : await ownedFolder(destination);
    await scan(folder);
    return { files, accessible: true };
  } catch {
    return { files, accessible: false };
  }
}

function pumpScans() {
  while (scanQueue.length && activeCustomScans < MAX_CUSTOM_SCANS) {
    activeCustomScans += 1;
    scanQueue.shift()();
  }
}

function requestScan(destination) {
  const pending = pendingScans.get(destination.id);
  if (pending) return pending;
  const scan = { result: null };
  const custom = destination.id !== DEFAULT;
  pendingScans.set(destination.id, scan);
  const perform = async () => {
    try {
      scan.result = await scanDestination(destination);
    } finally {
      pendingScans.delete(destination.id);
      for (const notify of scanWaiters) notify();
      if (custom) {
        activeCustomScans -= 1;
        pumpScans();
      }
    }
  };
  if (custom) {
    scanQueue.push(perform);
    pumpScans();
  } else {
    perform();
  }
  return scan;
}

function waitForScans(scans) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      scanWaiters.delete(check);
      resolve();
    };
    const check = () => { if (scans.every((scan) => scan.result)) finish(); };
    const timer = setTimeout(finish, SCAN_DEADLINE_MS);
    scanWaiters.add(check);
    check();
  });
}

export async function listBackupFiles() {
  const destinations = [
    { id: DEFAULT, base: BACKUP_DIR },
    ...state.backupDestinations.filter((destination) => !destination.pending),
  ];
  const scans = destinations.map(requestScan);
  // O sistema operacional pode demorar para responder por um UNC. Não prende a API nem duplica a varredura.
  await waitForScans(scans);

  const files = [];
  const unavailable = [];
  const runDatabases = new Map();
  for (const run of state.runs) {
    for (const db of run.databases || []) {
      if (db.file) runDatabases.set(db.fileId || backupFileId(DEFAULT, db.file), db.name);
    }
  }
  for (const [index, destination] of destinations.entries()) {
    const result = scans[index].result;
    if (!result?.accessible) {
      unavailable.push(destination.jobId ? path.join(destination.base, destination.jobId) : BACKUP_DIR);
    }
    for (const file of result?.files || []) {
      files.push({ ...file, database: runDatabases.get(file.id) || '' });
    }
  }
  return { files: files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)), unavailable: unavailable.sort() };
}

export async function listRetentionFiles(job, location, prefix) {
  const folder = location.id === DEFAULT
    ? (await realEntry(await fs.realpath(BACKUP_DIR), job.id, true)).target
    : await ownedFolder(state.backupDestinations.find((item) => item.id === location.id));
  const files = [];
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.startsWith(prefix) || !managedFile.test(entry.name)) continue;
    try {
      const { info } = await realEntry(folder, entry.name);
      const relative = location.id === DEFAULT ? `${job.id}/${entry.name}` : entry.name;
      files.push({ name: entry.name, id: backupFileId(location.id, relative), mtime: info.mtimeMs });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  return files.sort((a, b) => b.name.localeCompare(a.name));
}
