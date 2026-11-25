import fs from 'node:fs';
import { DB_FILE } from './config.js';

const DEFAULTS = {
  settings: {
    defaultKeepLast: 14,
    maxConcurrentJobs: 2,
    runHistoryLimit: 400,
  },
  connections: [],
  jobs: [],
  runs: [],
  backupDestinations: [],
};

function readState() {
  if (!fs.existsSync(DB_FILE)) return structuredClone(DEFAULTS);
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      ...structuredClone(DEFAULTS),
      ...parsed,
      settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
      connections: parsed.connections || [],
      jobs: parsed.jobs || [],
      runs: parsed.runs || [],
      backupDestinations: Array.isArray(parsed.backupDestinations) ? parsed.backupDestinations : [],
    };
  } catch (err) {
    console.error('[store] Falha ao ler app.json, começando vazio:', err.message);
    const broken = `${DB_FILE}.broken-${Date.now()}`;
    try { fs.renameSync(DB_FILE, broken); } catch { /* ignore */ }
    return structuredClone(DEFAULTS);
  }
}

/** Estado em memória da aplicação. */
export const state = readState();

let saving = false;
let pending = false;

/** Persiste o estado de forma atômica (write + rename). */
export function save() {
  if (saving) { pending = true; return; }
  saving = true;
  try {
    const tmp = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, DB_FILE);
  } finally {
    saving = false;
    if (pending) { pending = false; save(); }
  }
}

/** Executa uma alteração no estado e persiste. */
export function mutate(fn) {
  const result = fn(state);
  trimRuns();
  save();
  return result;
}

function trimRuns() {
  const limit = state.settings.runHistoryLimit || 400;
  if (state.runs.length > limit) {
    // Mantém a ordem do mais recente para o mais antigo.
    state.runs = state.runs.slice(0, limit);
  }
}

export function uid(prefix = '') {
  const id = Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
  return prefix ? `${prefix}_${id}` : id;
}

export function publicConnection(conn) {
  const { passwordEnc, ...rest } = conn;
  return { ...rest, hasPassword: Boolean(passwordEnc) };
}
