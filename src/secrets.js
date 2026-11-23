import crypto from 'node:crypto';
import fs from 'node:fs';
import { KEY_FILE } from './config.js';

let key = null;

function loadKey() {
  if (key) return key;
  if (fs.existsSync(KEY_FILE)) {
    key = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
    if (key.length !== 32) throw new Error('Arquivo de chave local inválido: ' + KEY_FILE);
    return key;
  }
  key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('base64'), { mode: 0o600 });
  return key;
}

/** Criptografa um texto com AES-256-GCM usando a chave local da instalação. */
export function encrypt(plain) {
  if (plain === undefined || plain === null || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Descriptografa um texto gerado por encrypt(). */
export function decrypt(payload) {
  if (!payload) return '';
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    // Valor legado/não criptografado (ex.: importado manualmente).
    return String(payload);
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskSecret() {
  return '••••••••';
}
