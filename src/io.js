import fs from 'node:fs';
import zlib from 'node:zlib';
import { once } from 'node:events';

/** Escritor gzip incremental com contrapressão e contagem de bytes. */
export async function createGzipWriter(filePath) {
  const gzip = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(filePath);
  gzip.pipe(out);

  let bytesIn = 0;
  let failure = null;

  const finished = new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    gzip.on('error', reject);
  });

  return {
    async write(text) {
      if (failure) throw failure;
      bytesIn += Buffer.byteLength(text);
      if (!gzip.write(text)) await once(gzip, 'drain');
    },
    async end() {
      gzip.end();
      await finished;
      return bytesIn;
    },
    abort() {
      failure = new Error('Gravação cancelada');
      gzip.destroy();
      out.destroy();
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
