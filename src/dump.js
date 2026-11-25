import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { escapeId } from 'mysql2';
import { createGzipWriter } from './io.js';
import { buildInsert, qualified } from './sql-utils.js';
import { buildConfig } from './mysql.js';

const BATCH_ROWS = 400;
const BATCH_BYTES = 1_500_000;

function stripDefiner(sql) {
  return sql.replace(/DEFINER=`(?:[^`]|``)*`@`(?:[^`]|``)*`\s*/g, '');
}

/** Remove a qualificação `banco`.`objeto` para permitir restaurar em outro banco. */
function stripDatabasePrefix(sql, database) {
  return sql.split(`\`${database}\`.`).join('');
}

function stripAutoIncrement(sql) {
  return sql.replace(/\s+AUTO_INCREMENT=\d+/g, '');
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function listObjects(connection, database) {
  const [tables] = await connection.query(
    `SELECT TABLE_NAME AS \`name\`, TABLE_TYPE AS \`type\`
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME`,
    [database]
  );
  return tables;
}

async function loadViewOrder(connection, database, viewNames) {
  const names = new Set(viewNames);
  const deps = new Map(viewNames.map((n) => [n, new Set()]));
  try {
    const [rows] = await connection.query(
      `SELECT VIEW_NAME AS viewName, TABLE_NAME AS tableName
         FROM information_schema.VIEW_TABLE_USAGE
        WHERE VIEW_SCHEMA = ? AND TABLE_SCHEMA = ?`,
      [database, database]
    );
    for (const row of rows) {
      if (names.has(row.viewName) && names.has(row.tableName) && row.viewName !== row.tableName) {
        deps.get(row.viewName).add(row.tableName);
      }
    }
  } catch {
    // Servidores antigos/MariaDB sem VIEW_TABLE_USAGE: mantém ordem alfabética.
    return viewNames;
  }

  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = (name) => {
    if (visited.has(name) || visiting.has(name)) return;
    visiting.add(name);
    for (const dep of deps.get(name) || []) visit(dep);
    visiting.delete(name);
    visited.add(name);
    ordered.push(name);
  };
  for (const name of viewNames) visit(name);
  return ordered;
}

async function loadTriggers(connection, database) {
  const [rows] = await connection.query(
    `SELECT TRIGGER_NAME AS \`name\`, EVENT_MANIPULATION AS \`event\`, ACTION_TIMING AS \`timing\`,
            ACTION_STATEMENT AS \`body\`, ACTION_ORDER AS \`actionOrder\`
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = ?
      ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION, ACTION_ORDER`,
    [database]
  );
  const byName = new Map();
  for (const row of rows) {
    const key = `${row.timing} ${row.event} ${row.name}`;
    byName.set(key, row);
  }
  return [...byName.values()];
}

async function loadRoutines(connection, database) {
  const [routines] = await connection.query(
    `SELECT ROUTINE_NAME AS \`name\`, ROUTINE_TYPE AS \`type\`, DTD_IDENTIFIER AS \`returnType\`,
            IS_DETERMINISTIC AS \`deterministic\`, SQL_DATA_ACCESS AS \`dataAccess\`,
            SECURITY_TYPE AS \`security\`, ROUTINE_COMMENT AS \`comment\`
       FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = ?
      ORDER BY ROUTINE_TYPE, ROUTINE_NAME`,
    [database]
  );
  if (!routines.length) return [];
  const [params] = await connection.query(
    `SELECT SPECIFIC_NAME AS \`routineName\`, PARAMETER_MODE AS \`mode\`, PARAMETER_NAME AS \`name\`,
            DTD_IDENTIFIER AS \`dataType\`, ORDINAL_POSITION AS \`position\`
       FROM information_schema.PARAMETERS
      WHERE SPECIFIC_SCHEMA = ? AND ORDINAL_POSITION > 0
      ORDER BY SPECIFIC_NAME, ORDINAL_POSITION`,
    [database]
  );
  const [bodies] = await connection.query(
    `SELECT ROUTINE_NAME AS \`name\`, ROUTINE_DEFINITION AS \`body\`
       FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = ?`,
    [database]
  );
  const bodyMap = new Map(bodies.map((b) => [b.name, b.body]));
  const paramMap = new Map();
  for (const p of params) {
    if (!paramMap.has(p.routineName)) paramMap.set(p.routineName, []);
    paramMap.get(p.routineName).push(p);
  }
  return routines.map((r) => ({
    ...r,
    body: bodyMap.get(r.name) || '',
    params: paramMap.get(r.name) || [],
  }));
}

async function loadEvents(connection, database) {
  const [rows] = await connection.query(
    `SELECT EVENT_NAME AS \`name\`, EVENT_DEFINITION AS \`body\`, EVENT_TYPE AS \`type\`,
            EXECUTE_AT AS \`executeAt\`, INTERVAL_VALUE AS \`intervalValue\`, INTERVAL_FIELD AS \`intervalField\`,
            STARTS AS \`starts\`, ENDS AS \`ends\`, STATUS AS \`status\`, ON_COMPLETION AS \`onCompletion\`
       FROM information_schema.EVENTS
      WHERE EVENT_SCHEMA = ?
      ORDER BY EVENT_NAME`,
    [database]
  );
  return rows;
}

function routineDdl(routine) {
  const params = (routine.params || [])
    .map((p) => {
      const mode = routine.type === 'FUNCTION' ? '' : `${(p.mode || 'IN').toUpperCase()} `;
      return `${mode}${escapeId(p.name)} ${p.dataType}`;
    })
    .join(', ');
  const lines = [];
  const kind = routine.type === 'FUNCTION' ? 'FUNCTION' : 'PROCEDURE';
  const returns = routine.type === 'FUNCTION' ? ` RETURNS ${routine.returnType}` : '';
  lines.push(`CREATE ${kind} ${escapeId(routine.name)}(${params})${returns}`);
  lines.push(`    ${routine.deterministic === 'YES' ? 'DETERMINISTIC' : 'NOT DETERMINISTIC'}`);
  lines.push(`    ${(routine.dataAccess || 'SQL').toUpperCase()} SQL SECURITY ${(routine.security || 'DEFINER').toUpperCase()}`);
  if (routine.comment) lines.push(`    COMMENT ${sqlString(routine.comment)}`);
  lines.push(routine.body || '');
  return lines.join('\n');
}

function eventDdl(event) {
  const parts = [`CREATE EVENT ${escapeId(event.name)}`];
  if (event.type === 'ONE TIME') {
    parts.push(`ON SCHEDULE AT ${sqlString(event.executeAt)}`);
  } else {
    let sched = `ON SCHEDULE EVERY ${event.intervalValue} ${event.intervalField}`;
    if (event.starts) sched += ` STARTS ${sqlString(event.starts)}`;
    if (event.ends) sched += ` ENDS ${sqlString(event.ends)}`;
    parts.push(sched);
  }
  parts.push(`ON COMPLETION ${event.onCompletion === 'PRESERVE' ? 'PRESERVE' : 'NOT PRESERVE'}`);
  parts.push(event.status === 'DISABLED' ? 'DISABLE' : 'ENABLE');
  parts.push(`DO ${event.body}`);
  return `${parts.join('\n')}\n`;
}

/**
 * Gera um dump .sql.gz nativo (sem mysqldump) de um único banco.
 */
export async function dumpDatabase({
  connection: connRecord,
  database,
  filePath,
  isCancelled = () => false,
  onProgress = () => {},
}) {
  const startedAt = Date.now();
  const stats = {
    database,
    tables: 0,
    views: 0,
    routines: 0,
    triggers: 0,
    events: 0,
    rows: 0,
  };

  const connection = await mysql.createConnection(buildConfig(connRecord));
  const partialPath = `${filePath}.part`;
  let writer;

  const checkCancel = () => {
    if (isCancelled()) throw new Error('Backup cancelado pelo usuário.');
  };

  try {
    writer = await createGzipWriter(partialPath);
    await connection.query("SET SESSION time_zone = '+00:00'");
    // Snapshot consistente para tabelas InnoDB durante toda a leitura.
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const [[versionRow]] = await connection.query(
      'SELECT VERSION() AS version, @@character_set_server AS charset, @@collation_server AS collation'
    );

    const header = [
      '-- ------------------------------------------------------------',
      '-- MySQL Backup Studio',
      `-- Banco de dados : ${database}`,
      `-- Servidor       : ${connRecord.host}:${connRecord.port}`,
      `-- Versão MySQL   : ${versionRow.version}`,
      `-- Gerado em      : ${new Date().toISOString()}`,
      '-- ------------------------------------------------------------',
      '',
      'SET NAMES utf8mb4;',
      'SET @OLD_TIME_ZONE=@@TIME_ZONE, TIME_ZONE=\'+00:00\';',
      'SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;',
      'SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;',
      'SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE=\'NO_AUTO_VALUE_ON_ZERO\';',
      '',
    ].join('\n');
    await writer.write(header);

    const objects = await listObjects(connection, database);
    const tables = objects.filter((o) => o.type === 'BASE TABLE').map((o) => o.name);
    const viewNames = objects.filter((o) => o.type === 'VIEW').map((o) => o.name);

    // ---- Tabelas (estrutura + dados) ----
    for (const table of tables) {
      checkCancel();
      onProgress({ phase: 'table', database, table, stats });

      const [[createRow]] = await connection.query(`SHOW CREATE TABLE ${qualified(database, table)}`);
      const ddl = stripAutoIncrement(createRow['Create Table']);

      const [columns] = await connection.query(
        `SHOW FULL COLUMNS FROM ${qualified(database, table)}`
      );
      const insertColumns = columns
        .filter((c) => !/(VIRTUAL|STORED)\s+GENERATED/i.test(c.Extra || ''))
        .map((c) => c.Field);

      await writer.write(
        `--\n-- Estrutura da tabela ${escapeId(table)}\n--\n\n` +
        `DROP TABLE IF EXISTS ${escapeId(table)};\n${ddl};\n\n`
      );

      if (insertColumns.length === 0) {
        await writer.write(`-- (tabela sem colunas inseríveis)\n\n`);
        stats.tables += 1;
        continue;
      }

      const selectCols = insertColumns.map((c) => escapeId(c)).join(', ');
      const query = connection.connection.query(
        `SELECT ${selectCols} FROM ${qualified(database, table)}`
      );
      const stream = query.stream({ objectMode: true });

      let batch = [];
      let batchBytes = 0;
      let tableRows = 0;

      for await (const row of stream) {
        checkCancel();
        const values = insertColumns.map((c) => row[c]);
        batch.push(values);
        batchBytes += 64;
        tableRows += 1;
        if (batch.length >= BATCH_ROWS || batchBytes >= BATCH_BYTES) {
          await writer.write(buildInsert(table, insertColumns, batch));
          stats.rows += batch.length;
          batch = [];
          batchBytes = 0;
          onProgress({ phase: 'rows', database, table, rows: tableRows, stats });
        }
      }
      if (batch.length) {
        await writer.write(buildInsert(table, insertColumns, batch));
        stats.rows += batch.length;
      }
      await writer.write('\n');
      stats.tables += 1;
      onProgress({ phase: 'table-done', database, table, rows: tableRows, stats });
    }

    // ---- Views (ordem de dependência) ----
    const viewOrder = await loadViewOrder(connection, database, viewNames);
    for (const view of viewOrder) {
      checkCancel();
      const [[row]] = await connection.query(`SHOW CREATE VIEW ${qualified(database, view)}`);
      const ddl = stripDefiner(stripDatabasePrefix(row['Create View'] || '', database));
      await writer.write(
        `--\n-- View ${escapeId(view)}\n--\n\nDROP VIEW IF EXISTS ${escapeId(view)};\n${ddl};\n\n`
      );
      stats.views += 1;
    }

    // ---- Rotinas ----
    const routines = await loadRoutines(connection, database);
    if (routines.length) {
      await writer.write('DELIMITER ;;\n\n');
      for (const routine of routines) {
        checkCancel();
        const kind = routine.type === 'FUNCTION' ? 'FUNCTION' : 'PROCEDURE';
        if (!routine.body) {
          await writer.write(
            `--\n-- ${kind} ${escapeId(routine.name)}: definição não visível com o usuário atual (permissão SHOW_ROUTINE).\n\n`
          );
          continue;
        }
        await writer.write(
          `--\n-- ${kind === 'FUNCTION' ? 'Função' : 'Procedure'} ${escapeId(routine.name)}\n--\n` +
          `DROP ${kind} IF EXISTS ${escapeId(routine.name)};;\n` +
          `${stripDefiner(routineDdl(routine))};;\n\n`
        );
        stats.routines += 1;
      }
      await writer.write('DELIMITER ;\n\n');
    }

    // ---- Triggers (após os dados para não dispararem durante a restauração) ----
    const triggers = await loadTriggers(connection, database);
    if (triggers.length) {
      await writer.write('DELIMITER ;;\n\n');
      const [rows] = await connection.query(
        `SELECT TRIGGER_NAME AS n, EVENT_OBJECT_TABLE AS t
           FROM information_schema.TRIGGERS
          WHERE TRIGGER_SCHEMA = ?`,
        [database]
      );
      const tableByTrigger = new Map(rows.map((r) => [r.n, r.t]));
      for (const trigger of triggers) {
        checkCancel();
        const table = tableByTrigger.get(trigger.name);
        if (!table) continue;
        await writer.write(
          `--\n-- Trigger ${escapeId(trigger.name)}\n--\n` +
          `DROP TRIGGER IF EXISTS ${escapeId(trigger.name)};;\n` +
          `CREATE TRIGGER ${escapeId(trigger.name)} ${trigger.timing} ${trigger.event} ON ${escapeId(table)}\n` +
          `FOR EACH ROW ${trigger.body};;\n\n`
        );
        stats.triggers += 1;
      }
      await writer.write('DELIMITER ;\n\n');
    }

    // ---- Eventos ----
    let events = [];
    try {
      events = await loadEvents(connection, database);
    } catch {
      events = [];
    }
    if (events.length) {
      await writer.write('DELIMITER ;;\n\n');
      for (const event of events) {
        checkCancel();
        await writer.write(
          `--\n-- Evento ${escapeId(event.name)}\n--\n` +
          `DROP EVENT IF EXISTS ${escapeId(event.name)};;\n` +
          `${stripDefiner(eventDdl(event))};;\n\n`
        );
        stats.events += 1;
      }
      await writer.write('DELIMITER ;\n\n');
    }

    await writer.write(
      [
        '',
        'SET SQL_MODE=@OLD_SQL_MODE;',
        'SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;',
        'SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;',
        'SET TIME_ZONE=@OLD_TIME_ZONE;',
        '',
        '-- Fim do backup',
        '',
      ].join('\n')
    );

    const uncompressedBytes = await writer.end();
    try { await connection.query('COMMIT'); } catch { /* ignore */ }
    const { size } = await fs.promises.stat(partialPath);
    checkCancel();
    await fs.promises.rename(partialPath, filePath);
    return {
      ...stats,
      filePath,
      bytes: size,
      uncompressedBytes,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    if (writer) {
      await writer.abort();
      await fs.promises.unlink(partialPath).catch(() => {});
    }
    throw err;
  } finally {
    try { await connection.end(); } catch { /* ignore */ }
  }
}
