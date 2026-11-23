import mysql from 'mysql2/promise';
import { decrypt } from './secrets.js';

const SYSTEM_DBS = new Set(['information_schema', 'performance_schema', 'mysql', 'sys']);

export function buildConfig(conn, overrides = {}) {
  const config = {
    host: conn.host || '127.0.0.1',
    port: Number(conn.port) || 3306,
    user: conn.user || 'root',
    password: decrypt(conn.passwordEnc),
    connectTimeout: Number(conn.connectTimeout) || 15000,
    charset: 'utf8mb4',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    ...overrides,
  };
  if (conn.ssl) config.ssl = conn.sslInsecure ? { rejectUnauthorized: false } : {};
  return config;
}

export async function withConnection(conn, fn) {
  const connection = await mysql.createConnection(buildConfig(conn));
  try {
    return await fn(connection);
  } finally {
    try { await connection.end(); } catch { /* ignore */ }
  }
}

export async function testConnection(conn) {
  const started = Date.now();
  const info = await withConnection(conn, async (c) => {
    const [rows] = await c.query(
      'SELECT VERSION() AS version, @@character_set_server AS charset, @@collation_server AS collation, CURRENT_USER() AS currentUser'
    );
    return rows[0];
  });
  return {
    ok: true,
    latencyMs: Date.now() - started,
    ...info,
  };
}

export async function listDatabases(conn) {
  return withConnection(conn, async (c) => {
    const [rows] = await c.query(
      `SELECT s.SCHEMA_NAME AS name,
              s.DEFAULT_CHARACTER_SET_NAME AS charset,
              s.DEFAULT_COLLATION_NAME AS collation,
              COALESCE(SUM(t.TABLE_TYPE = 'BASE TABLE'), 0) AS tableCount,
              COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS sizeBytes
         FROM information_schema.SCHEMATA s
         LEFT JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = s.SCHEMA_NAME
        GROUP BY s.SCHEMA_NAME, s.DEFAULT_CHARACTER_SET_NAME, s.DEFAULT_COLLATION_NAME
        ORDER BY s.SCHEMA_NAME`
    );
    return rows
      .filter((row) => !SYSTEM_DBS.has(row.name))
      .map((row) => ({
        name: row.name,
        charset: row.charset,
        collation: row.collation,
        tableCount: Number(row.tableCount) || 0,
        sizeBytes: Number(row.sizeBytes) || 0,
      }));
  });
}

export async function listTables(conn, database) {
  return withConnection(conn, async (c) => {
    const [rows] = await c.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, ENGINE AS engine,
              COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) AS sizeBytes,
              TABLE_ROWS AS approxRows
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME`,
      [database]
    );
    return rows.map((r) => ({
      name: r.name,
      type: r.type,
      engine: r.engine,
      sizeBytes: Number(r.sizeBytes) || 0,
      approxRows: Number(r.approxRows) || 0,
    }));
  });
}

export { SYSTEM_DBS };
