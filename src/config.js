import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..');

export const DATA_DIR = path.resolve(process.env.MBS_DATA_DIR || path.join(ROOT_DIR, 'data'));
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const DB_FILE = path.join(DATA_DIR, 'app.json');
export const KEY_FILE = path.join(DATA_DIR, '.key');
export const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

export const PORT = Number(process.env.PORT || 3010);
export const HOST = process.env.HOST || '127.0.0.1';

for (const dir of [DATA_DIR, BACKUP_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const APP_VERSION = '1.0.0';
export { APP_VERSION };
