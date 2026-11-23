import { StringDecoder } from 'node:string_decoder';

function hasExecutableSql(stmt) {
  const stripped = stmt
    .replace(/\/\*(?!!)[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*--.*$/gm, ' ')
    .replace(/^[ \t]*#.*$/gm, ' ')
    .trim();
  return stripped.length > 0;
}

/**
 * Divide um fluxo de texto SQL em comandos, respeitando strings, comentários,
 * identificadores com crase e diretivas DELIMITER (compatível com mysqldump).
 */
export async function* splitStatements(readable) {
  const decoder = new StringDecoder('utf8');
  let buf = '';
  let stmt = '';
  let state = 'normal'; // normal | single | double | backtick | line | block
  let delimiter = ';';
  let atLineStart = true;
  let statementStarted = false;

  function* consume(final) {
    let i = 0;
    while (i < buf.length) {
      const c = buf[i];

      // Diretiva DELIMITER (comando do cliente) no início da linha.
      if (state === 'normal' && atLineStart && !statementStarted) {
        const nl = buf.indexOf('\n', i);
        if (nl === -1) {
          if (!final) break;
        } else {
          const line = buf.slice(i, nl + 1);
          const match = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*\r?\n$/i.exec(line);
          if (match) {
            delimiter = match[1];
            i = nl + 1;
            continue;
          }
        }
      }

      if (state === 'line') {
        stmt += c;
        i += 1;
        if (c === '\n') { state = 'normal'; atLineStart = true; } else { atLineStart = false; }
        continue;
      }

      if (state === 'block') {
        if (c === '*' && i + 1 < buf.length && buf[i + 1] === '/') {
          stmt += '*/';
          i += 2;
          state = 'normal';
          atLineStart = false;
          continue;
        }
        if (c === '*' && i + 1 >= buf.length && !final) break;
        stmt += c;
        i += 1;
        if (c === '\n') atLineStart = true; else atLineStart = false;
        continue;
      }

      if (state === 'single' || state === 'double' || state === 'backtick') {
        const quote = state === 'single' ? "'" : state === 'double' ? '"' : '`';
        if (c === '\\') {
          if (i + 1 >= buf.length && !final) break;
          stmt += c + (buf[i + 1] || '');
          i += 2;
          atLineStart = false;
          continue;
        }
        if (c === quote) {
          if (i + 1 >= buf.length && !final) break;
          if (buf[i + 1] === quote) {
            stmt += c + c;
            i += 2;
            atLineStart = false;
            continue;
          }
          stmt += c;
          i += 1;
          state = 'normal';
          atLineStart = false;
          continue;
        }
        stmt += c;
        i += 1;
        if (c === '\n') atLineStart = true; else atLineStart = false;
        continue;
      }

      // Estado normal.
      if (c === '-' && buf[i + 1] === '-') {
        if (i + 2 >= buf.length && !final) break;
        if (i + 2 < buf.length && /\s/.test(buf[i + 2])) {
          state = 'line';
          stmt += '--';
          i += 2;
          atLineStart = false;
          continue;
        }
      }
      if (c === '#') {
        state = 'line';
        stmt += c;
        i += 1;
        atLineStart = false;
        continue;
      }
      if (c === '/' && buf[i + 1] === '*') {
        if (i + 1 >= buf.length && !final) break;
        state = 'block';
        stmt += '/*';
        i += 2;
        atLineStart = false;
        continue;
      }
      if (c === "'") {
        state = 'single';
        stmt += c;
        i += 1;
        atLineStart = false;
        continue;
      }
      if (c === '"') {
        state = 'double';
        stmt += c;
        i += 1;
        atLineStart = false;
        continue;
      }
      if (c === '`') {
        state = 'backtick';
        stmt += c;
        i += 1;
        atLineStart = false;
        continue;
      }

      if (buf.startsWith(delimiter, i)) {
        if (hasExecutableSql(stmt)) yield stmt.trim();
        stmt = '';
        i += delimiter.length;
        atLineStart = false;
        statementStarted = false;
        continue;
      }
      if (!final && i + delimiter.length > buf.length && delimiter.startsWith(buf.slice(i))) {
        break;
      }

      stmt += c;
      i += 1;
      if (c === '\n') {
        atLineStart = true;
      } else if (c !== ' ' && c !== '\t' && c !== '\r') {
        atLineStart = false;
        statementStarted = true;
      }
    }
    buf = buf.slice(i);
  }

  for await (const chunk of readable) {
    buf += decoder.write(chunk);
    yield* consume(false);
  }
  buf += decoder.end();
  yield* consume(true);
  if (hasExecutableSql(stmt)) yield stmt.trim();
}
