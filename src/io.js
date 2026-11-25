import fs from 'node:fs';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

/** Escritor gzip incremental com contrapressão e contagem de bytes. */
export async function createGzipWriter(filePath) {
  const handle = await fs.promises.open(filePath, 'wx', 0o600);
  const gzip = zlib.createGzip({ level: 6 });
  const out = handle.createWriteStream();

  let bytesIn = 0;
  let failure = null;

  const finished = pipeline(gzip, out);
  finished.catch((err) => { failure = err; });

  return {
    async write(text) {
      if (failure) throw failure;
      bytesIn += Buffer.byteLength(text);
      await new Promise((resolve, reject) => {
        gzip.write(text, (err) => err ? reject(err) : resolve());
      });
    },
    async end() {
      gzip.end();
      await finished;
      return bytesIn;
    },
    async abort() {
      gzip.destroy(new Error('Gravação cancelada'));
      await finished.catch(() => {});
    },
  };
}

export async function fileExists(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}
