import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import mysql from 'mysql2/promise';
import { escapeId } from 'mysql2';
import { buildConfig } from './mysql.js';
import { splitStatements } from './split-sql.js';
import { TMP_DIR } from './config.js';

async function stageBackup(source, destination) {
  const input = await fs.promises.open(source, 'r');
  try {
    const { size: sourceBytes } = await input.stat();
    const header = Buffer.alloc(2);
    await input.read(header, 0, header.length, 0);
    const compressed = source.toLowerCase().endsWith('.gz') || (header[0] === 0x1f && header[1] === 0x8b);
    const streams = [input.createReadStream({ start: 0 })];
    if (compressed) streams.push(zlib.createGunzip());
    streams.push(fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    // Só entrega o SQL depois de ler tudo e, para gzip, verificar o trailer.
    await pipeline(...streams);
    const { size } = await fs.promises.stat(destination);
    let hasSql = false;
    for await (const _ of splitStatements(fs.createReadStream(destination))) {
      hasSql = true;
      break;
    }
    if (!hasSql) throw new Error('O arquivo não contém comandos SQL.');
    return { sourceBytes, size };
  } finally {
    await input.close();
  }
}

/**
 * Restaura um arquivo .sql ou .sql.gz em um banco de destino.
 * Valida uma cópia local do arquivo inteiro antes de tocar no banco de destino.
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
  const startedAt = Date.now();
  const tempDir = await fs.promises.mkdtemp(path.join(TMP_DIR, 'restore-'));
  const stagedPath = path.join(tempDir, 'backup.sql');

  let connection;
  let statements = 0;
  try {
    onProgress({ phase: 'validate', statements: 0, percent: 0 });
    let staged;
    try {
      staged = await stageBackup(filePath, stagedPath);
    } catch (err) {
      throw new Error(`Não foi possível validar o arquivo de backup: ${err.message}. Nenhuma alteração foi feita no banco de destino.`);
    }
    connection = await mysql.createConnection(
      buildConfig(connRecord, { multipleStatements: false, dateStrings: true })
    );
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

    const raw = fs.createReadStream(stagedPath);
    let consumed = 0;
    raw.on('data', (chunk) => {
      consumed += chunk.length;
      onProgress({
        phase: 'restore',
        statements,
        percent: Math.min(99, Math.round((consumed / staged.size) * 100)),
      });
    });

    for await (const statement of splitStatements(raw)) {
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
      bytes: staged.sourceBytes,
    };
  } finally {
    if (connection) {
      try { await connection.query('SET SESSION foreign_key_checks = 1'); } catch { /* ignore */ }
      try { await connection.end(); } catch { /* ignore */ }
    }
    await fs.promises.unlink(stagedPath).catch((err) => {
      if (err.code !== 'ENOENT') console.error('[restore] limpeza:', err.code || err.message);
    });
    await fs.promises.rmdir(tempDir).catch((err) => {
      if (err.code !== 'ENOENT') console.error('[restore] limpeza:', err.code || err.message);
    });
  }
}
