import { escape, escapeId } from 'mysql2';

/**
 * Converte um valor retornado pelo driver em SQL literal seguro.
 * Strings, buffers, datas, JSON e nulos são tratados.
 */
export function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    const str =
      `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
      `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
    return escape(str);
  }
  if (typeof value === 'object') return escape(JSON.stringify(value));
  return escape(String(value));
}

export function ident(name) {
  return escapeId(name);
}

export function qualified(database, name) {
  return `${escapeId(database)}.${escapeId(name)}`;
}

/**
 * Monta um INSERT multi-linha. Recebe lista de linhas no formato array de valores.
 * A tabela não é qualificada com o banco: assim o mesmo dump pode ser restaurado
 * em um banco com outro nome (a conexão de restauração define o banco atual).
 */
export function buildInsert(table, columns, rows) {
  const cols = columns.map((c) => escapeId(c)).join(', ');
  const values = rows.map((row) => `(${row.map(sqlValue).join(', ')})`).join(',\n');
  return `INSERT INTO ${escapeId(table)} (${cols}) VALUES\n${values};\n`;
}
