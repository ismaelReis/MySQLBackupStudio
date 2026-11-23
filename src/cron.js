/**
 * Utilitário de agendamento: parser de cron de 5 campos + tradução para texto.
 * Campos: minuto hora dia-do-mês mês dia-da-semana
 * Suporta: *, intervalos (a-b), passos (a/n e a-b/n), listas com vírgula e nomes de mês/dia.
 */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const RANGES = [
  [0, 59], // minuto
  [0, 23], // hora
  [1, 31], // dia do mês
  [1, 12], // mês
  [0, 6],  // dia da semana (0 = domingo)
];

function parseValue(token, index) {
  const lower = token.toLowerCase();
  let value = Number(token);
  if (Number.isNaN(value)) {
    const names = index === 3 ? MONTHS : index === 4 ? DAYS : null;
    const found = names ? names.indexOf(lower.slice(0, 3)) : -1;
    if (found < 0) throw new Error(`Valor inválido no cron: "${token}"`);
    value = index === 3 ? found + 1 : found;
  }
  return value;
}

function parseField(field, index) {
  const [min, max] = RANGES[index];
  const values = new Set();
  for (const part of field.split(',')) {
    const piece = part.trim();
    if (!piece) throw new Error('Campo de cron vazio');
    const [rangePart, stepPart] = piece.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) throw new Error(`Passo inválido no cron: "${piece}"`);

    let start;
    let end;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-');
      start = parseValue(a, index);
      end = parseValue(b, index);
    } else {
      start = parseValue(rangePart, index);
      end = stepPart === undefined ? start : max;
    }
    if (start < min || end > max || start > end) {
      throw new Error(`Intervalo fora do permitido no cron: "${piece}"`);
    }
    for (let v = start; v <= end; v += step) values.add(v);
  }
  return values;
}

export function parseCron(expression) {
  const fields = String(expression || '').trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Expressão cron deve ter 5 campos: minuto hora dia mês dia-da-semana');
  return {
    minute: parseField(fields[0], 0),
    hour: parseField(fields[1], 1),
    dayOfMonth: parseField(fields[2], 2),
    month: parseField(fields[3], 3),
    dayOfWeek: parseField(fields[4], 4),
    source: fields.join(' '),
  };
}

/** Verifica se um Date (hora local) corresponde à expressão. */
export function cronMatches(parsed, date) {
  if (!parsed.minute.has(date.getMinutes())) return false;
  if (!parsed.hour.has(date.getHours())) return false;
  if (!parsed.month.has(date.getMonth() + 1)) return false;

  const dom = date.getDate();
  const dow = date.getDay();
  const domRestricted = parsed.dayOfMonth.size !== 31;
  const dowRestricted = parsed.dayOfWeek.size !== 7;

  // Cron clássico: quando os dois campos são restritos, basta um deles bater.
  if (domRestricted && dowRestricted) {
    return parsed.dayOfMonth.has(dom) || parsed.dayOfWeek.has(dow);
  }
  return parsed.dayOfMonth.has(dom) && parsed.dayOfWeek.has(dow);
}

/** Próxima execução a partir de `from` (exclusivo). */
export function nextRun(expression, from = new Date()) {
  const parsed = typeof expression === 'string' ? parseCron(expression) : expression;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = 366 * 24 * 60 * 2;
  for (let i = 0; i < limit; i++) {
    if (cronMatches(parsed, d)) return new Date(d.getTime());
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

export function isValidCron(expression) {
  try { parseCron(expression); return true; } catch { return false; }
}

const DOW_LABELS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Texto amigável em português para uma agenda de job. */
export function describeSchedule(schedule) {
  if (!schedule || schedule.mode === 'manual') return 'Manual';
  if (schedule.mode === 'daily') return `Diário às ${schedule.time || '00:00'}`;
  if (schedule.mode === 'weekly') {
    const days = (schedule.days || []).map((d) => DOW_LABELS[d]).filter(Boolean);
    return `Semanal (${days.join(', ') || 'nenhum dia'}) às ${schedule.time || '00:00'}`;
  }
  if (!schedule.cron) return 'Manual';
  return `Cron: ${schedule.cron}`;
}

/** Converte a agenda amigável em expressão cron (usada pelo agendador). */
export function scheduleToCron(schedule) {
  if (!schedule || schedule.mode === 'manual') return null;
  if (schedule.mode === 'daily' || schedule.mode === 'weekly') {
    const [hh, mm] = String(schedule.time || '00:00').split(':').map(Number);
    if (!Number.isInteger(hh) || hh < 0 || hh > 23 || !Number.isInteger(mm) || mm < 0 || mm > 59) {
      throw new Error('Horário inválido. Use HH:MM.');
    }
    if (schedule.mode === 'daily') return `${mm} ${hh} * * *`;
    const days = (schedule.days || []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (!days.length) throw new Error('Selecione ao menos um dia da semana.');
    return `${mm} ${hh} * * ${[...new Set(days)].sort().join(',')}`;
  }
  if (schedule.mode === 'cron') {
    parseCron(schedule.cron);
    return schedule.cron.trim();
  }
  throw new Error('Modo de agenda desconhecido: ' + schedule.mode);
}
