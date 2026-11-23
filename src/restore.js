import fs from 'node:fs';
import zlib from 'node:zlib';
import mysql from 'mysql2/promise';
import { escapeId } from 'mysql2';
import { buildConfig } from './mysql.js';
import { splitStatements } from './split-sql.js';

/**
 * Restaura um arquivo .sql ou .sql.gz em um banco de destino.
 * Os comandos são executados um a um, com progresso baseado no arquivo comprimido.
 */
export async function restoreDump({
  connection: connRecord,
  targetDatabase,
  filePath,
  recreate = false,
  onProgress = () => {},
}) {
  if (!/^[A-Za-z0-9_$.-]+$/.test(targetDatabase)) {
    throw new Error('Nome de banco de destino inválido.');
  }
  const stat = await fs.promises.stat(filePath);
  const startedAt = Date.now();

  const connection = await mysql.createConnection(
    buildConfig(connRecord, { multipleStatements: false, dateStrings: true })
  );

  let statements = 0;
  try {
    await connection.query("SET SESSION time_zone = '+00:00'");
    await connection.query('SET SESSION foreign_key_checks = 0');
    await connection.query('SET SESSION unique_checks = 0');
    await connection.query('SET SESSION sql_mode = \'NO_AUTO_VALUE_ON_ZERO\'');

    if (recreate) {
      await connection.query(`DROP DATABASE IF EXISTS ${escapeId(targetDatabase)}`);
      await connection.query(
        `CREATE DATABASE ${escapeId(targetDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    } else {
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS ${escapeId(targetDatabase)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
      );
    }
    await connection.query(`USE ${escapeId(targetDatabase)}`);

    const raw = fs.createReadStream(filePath);
    let consumed = 0;
    raw.on('data', (chunk) => {
      consumed += chunk.length;
      onProgress({
        phase: 'restore',
        statements,
        percent: stat.size ? Math.min(99, Math.round((consumed / stat.size) * 100)) : 0,
      });
    });

    const isGzip = filePath.toLowerCase().endsWith('.gz') || (await isGzipFile(filePath));
    const textStream = isGzip ? raw.pipe(zlib.createGunzip()) : raw;

    for await (const statement of splitStatements(textStream)) {
      try {
        await connection.query(statement);
        statements += 1;
      } catch (err) {
        err.message = `Erro no comando #${statements + 1}: ${err.message}\n\n${statement.slice(0, 500)}`;
        throw err;
      }
    }

    onProgress({ phase: 'restore', statements, percent: 100 });
    return {
      database: targetDatabase,
      statements,
      durationMs: Date.now() - startedAt,
      bytes: stat.size,
    };
  } finally {
    try { await connection.query('SET SESSION foreign_key_checks = 1'); } catch { /* ignore */ }
    try { await connection.end(); } catch { /* ignore */ }
  }
}

async function isGzipFile(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(2);
    await handle.read(buf, 0, 2, 0);
    return buf[0] === 0x1f && buf[1] === 0x8b;
  } finally {
    await handle.close();
  }
}
