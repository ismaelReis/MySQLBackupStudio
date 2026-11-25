/* MySQL Backup Studio — interface (vanilla JS, sem build). */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ ícones */

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
  play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  restore: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>',
  disk: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M7 15h.01M11 15h.01"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 20h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
};

function icon(name, cls = '') {
  const body = ICONS[name] || '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${body}</svg>`;
}

const LOGO = `<svg width="38" height="38" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <rect width="64" height="64" rx="15" fill="#121b25" stroke="#2a3a4c"/>
  <ellipse cx="32" cy="20" rx="15" ry="6.5" fill="#f29111"/>
  <path d="M17 20v23c0 3.6 6.7 6.5 15 6.5s15-2.9 15-6.5V20" stroke="#f29111" stroke-width="3.4"/>
  <path d="M17 31.5c0 3.6 6.7 6.5 15 6.5s15-2.9 15-6.5" stroke="#f29111" stroke-width="3.4"/>
</svg>`;

/* ------------------------------------------------------------------ utilidades */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 10 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const suffix = (txt) => (diff >= 0 ? `em ${txt}` : `há ${txt}`);
  if (abs < 60000) return diff >= 0 ? 'em instantes' : 'agora';
  const mins = Math.round(abs / 60000);
  if (mins < 60) return suffix(`${mins} min`);
  const hours = Math.round(mins / 60);
  if (hours < 24) return suffix(`${hours} h`);
  const days = Math.round(hours / 24);
  return suffix(`${days} d`);
}

function fmtDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return ms > 0 ? '<1s' : '0s';
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function fmtNumber(n) {
  return Number(n || 0).toLocaleString('pt-BR');
}

const STATUS = {
  queued: { label: 'Na fila', cls: 'yellow' },
  running: { label: 'Executando', cls: 'orange' },
  success: { label: 'Sucesso', cls: 'green' },
  partial: { label: 'Parcial', cls: 'yellow' },
  failed: { label: 'Falhou', cls: 'red' },
  cancelled: { label: 'Cancelado', cls: '' },
  pending: { label: 'Pendente', cls: '' },
};

function plural(n, one, many) {
  return `${fmtNumber(n)} ${Number(n) === 1 ? one : many}`;
}

function statusPill(status) {
  const s = STATUS[status] || { label: status || '—', cls: '' };
  return `<span class="pill ${s.cls}"><span class="dot"></span>${esc(s.label)}</span>`;
}

async function api(path, options = {}) {
  const opts = { ...options };
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  }
  const res = await fetch(path, opts);
  const type = res.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Falha na requisição (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ------------------------------------------------------------------ estado */

let S = null;
let route = 'overview';
let refreshTimer = null;
let sse = null;
const liveProgress = new Map();
const dbCache = new Map();

function scheduleRefresh(delay = 260) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadState().catch(() => {}), delay);
}

async function loadState() {
  S = await api('/api/state');
  if (!$('#main')) return;
  render();
  setServerStatus(true);
}

function setServerStatus(online, message) {
  const el = $('#server-status');
  if (!el) return;
  const dot = $('.dot', el);
  if (!dot) return;
  dot.classList.toggle('online', online);
  dot.classList.toggle('offline', !online);
  $('span:last-child', el).textContent = message || (online ? 'Servidor online' : 'Servidor offline');
  if (online && S) $('#version-label').textContent = `v${S.version}`;
}

function navigate(next) {
  if (location.hash !== `#/${next}`) location.hash = `#/${next}`;
  else {
    route = next;
    render();
  }
}

/* ------------------------------------------------------------------ render base */

function render() {
  if (!S) return;
  route = (location.hash || '#/overview').replace(/^#\/?/, '') || 'overview';
  if (!['overview', 'connections', 'jobs', 'backups', 'settings'].includes(route)) route = 'overview';

  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));

  let html = '';
  switch (route) {
    case 'overview': html = renderOverview(); break;
    case 'connections': html = renderConnections(); break;
    case 'jobs': html = renderJobs(); break;
    case 'backups': html = renderBackups(); break;
    case 'settings': html = renderSettings(); break;
  }
  $('#main').innerHTML = html;
}

function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head">
    <div><h1>${esc(title)}</h1><div class="sub">${subtitle}</div></div>
    <div class="head-actions">${actions}</div>
  </div>`;
}

function statCard(label, value, hint, iconName) {
  return `<div class="card stat">
    <div class="stat-icon">${icon(iconName)}</div>
    <div class="label">${esc(label)}</div>
    <div class="value">${value}</div>
    <div class="hint">${hint}</div>
  </div>`;
}

function emptyState(iconName, title, text, action = '') {
  return `<div class="empty">${icon(iconName)}<h3>${esc(title)}</h3><p class="small">${esc(text)}</p>${action}</div>`;
}

/* ------------------------------------------------------------------ visão geral */

function renderOverview() {
  const activeRuns = S.runs.filter((r) => r.status === 'running' || r.status === 'queued');
  const upcoming = S.jobs
    .filter((j) => j.enabled && j.nextRunAt)
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
    .slice(0, 5);
  const recent = S.runs.filter((r) => !['running', 'queued'].includes(r.status)).slice(0, 6);
  const stats = S.stats;

  const activeHtml = activeRuns.length
    ? `<div class="card" style="margin-bottom:22px">
        <div class="card-head"><h2>${icon('pulse', 'spin')} Execuções em andamento</h2><span class="pill orange">${activeRuns.length} ativa(s)</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:16px">
          ${activeRuns.map(renderActiveRun).join('')}
        </div>
      </div>`
    : '';

  return `
    ${pageHead('Visão geral', 'Seus backups, agendamentos e conexões em um só lugar.',
      `<button class="btn" data-action="new-connection">${icon('plus')} Nova conexão</button>
       <button class="btn primary" data-action="new-job">${icon('plus')} Novo agendamento</button>`)}

    ${activeHtml}

    <div class="grid stats">
      ${statCard('Agendamentos ativos', `${stats.enabledJobs}<span class="muted" style="font-size:1rem"> / ${stats.jobs}</span>`, 'Backups recorrentes configurados', 'clock')}
      ${statCard('Backups gerados', fmtNumber(stats.totalBackups), 'Bancos copiados com sucesso (histórico)', 'shield')}
      ${statCard('Espaço em disco', fmtBytes(stats.diskBytes), `${fmtNumber(stats.diskFiles)} arquivo(s) na pasta de backups`, 'disk')}
      ${statCard('Bancos com falha (24h)', fmtNumber(stats.failedLast24h), stats.failedLast24h ? 'Verifique as execuções abaixo' : 'Nenhuma falha recente', 'alert')}
    </div>

    <div class="two-col">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Execuções recentes</h2><a class="btn ghost small" href="#/backups">Ver todos</a></div>
          <div class="card-body flush">
            ${recent.length ? renderRunsTable(recent) : emptyState('folder', 'Nenhuma execução ainda', 'Crie um agendamento e clique em "Executar" para gerar o primeiro backup.', `<button class="btn primary small" data-action="new-job">${icon('plus')} Criar agendamento</button>`)}
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card-head"><h2>Próximas execuções</h2><a class="btn ghost small" href="#/jobs">Gerenciar</a></div>
          <div class="card-body flush">
            ${upcoming.length ? `<table>
              <tbody>
                ${upcoming.map((j) => `<tr>
                  <td>
                    <div class="strong">${esc(j.name)}</div>
                    <div class="tiny muted">${esc(j.scheduleText)}</div>
                  </td>
                  <td class="right nowrap">
                    <div class="small">${esc(fmtDateShort(j.nextRunAt))}</div>
                    <div class="tiny muted">${esc(fmtRelative(j.nextRunAt))}</div>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>` : emptyState('calendar', 'Nada agendado', 'Ative ou crie um agendamento para ver os próximos horários.')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2>Status</h2></div>
          <div class="card-body">
            <div class="kv"><span class="k">Última execução</span><span class="v">${stats.lastRunAt ? esc(fmtRelative(stats.lastRunAt)) : '—'}</span></div>
            <div class="kv"><span class="k">Resultado</span><span class="v">${stats.lastRunStatus ? statusPill(stats.lastRunStatus) : '—'}</span></div>
            <div class="kv"><span class="k">Conexões</span><span class="v">${stats.connections}</span></div>
            <div class="kv"><span class="k">Fuso horário local</span><span class="v small">${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || 'local')}</span></div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderActiveRun(run) {
  const progress = liveProgress.get(run.id);
  const started = run.startedAt || run.queuedAt;
  let detail = run.status === 'queued' ? 'Aguardando na fila…' : 'Iniciando…';
  if (progress) {
    if (progress.phase === 'rows') {
      detail = `${progress.database} · ${progress.table} · ${plural(progress.rows, 'linha', 'linhas')}`;
    } else if (progress.phase === 'table') {
      detail = `${progress.database} · lendo ${progress.table}`;
    } else if (progress.phase === 'table-done') {
      detail = `${progress.database} · ${progress.table} concluída (${plural(progress.rows, 'linha', 'linhas')})`;
    }
  }
  return `<div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px">
        <div class="strong">${esc(run.jobName)}</div>
        <div class="tiny muted">${run.trigger === 'schedule' ? 'Agendado' : 'Manual'} · iniciado ${esc(fmtRelative(started))} · ${esc(run.connectionName)}</div>
      </div>
      ${statusPill(run.status)}
      <button class="btn small danger" data-action="cancel-run" data-id="${esc(run.id)}">Cancelar</button>
    </div>
    <div class="progress"><span></span></div>
    <div class="live-text" data-live-run="${esc(run.id)}">${esc(detail)}</div>
  </div>`;
}

function runTotals(run) {
  const dbs = run.databases || [];
  const ok = dbs.filter((d) => d.status === 'success').length;
  const failed = dbs.filter((d) => d.status === 'failed' || d.status === 'cancelled').length;
  const bytes = dbs.reduce((sum, d) => sum + (d.bytes || 0), 0);
  return { ok, failed, total: dbs.length, bytes };
}

function renderRunsTable(runs) {
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Agendamento</th><th>Status</th><th>Início</th><th>Duração</th><th>Bancos</th><th class="right">Tamanho</th>
    </tr></thead>
    <tbody>
      ${runs.map((run) => {
        const t = runTotals(run);
        return `<tr>
          <td><div class="strong">${esc(run.jobName)}</div><div class="tiny muted">${run.trigger === 'schedule' ? 'Agendado' : 'Manual'}</div></td>
          <td>${statusPill(run.status)}</td>
          <td class="nowrap small">${esc(fmtDateTime(run.startedAt || run.queuedAt))}</td>
          <td class="small muted nowrap">${esc(fmtDuration(run.durationMs))}</td>
          <td class="small">${t.ok}/${t.total}${t.failed ? ` <span class="pill red">${t.failed} falha(s)</span>` : ''}</td>
          <td class="right small nowrap">${fmtBytes(t.bytes)}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

/* ------------------------------------------------------------------ conexões */

function renderConnections() {
  const cards = S.connections.map((conn) => {
    const jobs = S.jobs.filter((j) => j.connectionId === conn.id).length;
    const test = conn.lastTestOk === true
      ? '<span class="pill green"><span class="dot"></span>Testada</span>'
      : conn.lastTestOk === false
        ? '<span class="pill red"><span class="dot"></span>Falhou</span>'
        : '<span class="pill">Não testada</span>';
    return `<div class="card entity">
      <div class="entity-top">
        <div class="entity-title">
          <div class="avatar">${icon('database')}</div>
          <div style="min-width:0">
            <h3 title="${esc(conn.name)}">${esc(conn.name)}</h3>
            <div class="entity-sub">${esc(conn.host)}:${conn.port}</div>
          </div>
        </div>
        ${test}
      </div>
      <div class="entity-meta">
        <div class="meta-row">${icon('user')}<span>${esc(conn.user)}</span></div>
        <div class="meta-row">${icon('lock')}<span>${conn.hasPassword ? 'Senha salva (criptografada)' : 'Sem senha'}</span></div>
        <div class="meta-row">${icon('shield')}<span>${conn.ssl ? (conn.sslInsecure ? 'SSL (sem validação de certificado)' : 'SSL ativado') : 'Sem SSL'}</span></div>
        <div class="meta-row">${icon('clock')}<span>${jobs} agendamento(s) usando esta conexão</span></div>
      </div>
      <div class="entity-actions">
        <button class="btn small" data-action="test-connection" data-id="${esc(conn.id)}">${icon('pulse')} Testar</button>
        <button class="btn small" data-action="edit-connection" data-id="${esc(conn.id)}">${icon('edit')} Editar</button>
        <button class="btn small danger" data-action="delete-connection" data-id="${esc(conn.id)}" aria-label="Excluir conexão" title="Excluir conexão">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('');

  return `
    ${pageHead('Conexões', 'Servidores MySQL/MariaDB usados nos backups.',
      `<button class="btn primary" data-action="new-connection">${icon('plus')} Nova conexão</button>`)}
    ${S.connections.length ? `<div class="card-grid">${cards}</div>` : `<div class="card">${emptyState('database', 'Nenhuma conexão cadastrada', 'Cadastre seu servidor MySQL para poder selecionar os bancos e agendar backups.', `<button class="btn primary" data-action="new-connection">${icon('plus')} Cadastrar conexão</button>`)}</div>`}`;
}

/* ------------------------------------------------------------------ agendamentos */

function renderJobs() {
  const cards = S.jobs.map((job) => {
    const all = job.databases.includes('*');
    const chips = all
      ? '<span class="chip more">Todos os bancos (inclui futuros)</span>'
      : job.databases.slice(0, 5).map((d) => `<span class="chip">${esc(d)}</span>`).join('') +
        (job.databases.length > 5 ? `<span class="chip more">+${job.databases.length - 5}</span>` : '');
    const retention = [];
    if (job.retention?.keepLast) retention.push(`manter ${job.retention.keepLast}`);
    if (job.retention?.keepDays) retention.push(`máx. ${job.retention.keepDays} dias`);
    return `<div class="card entity">
      <div class="entity-top">
        <div class="entity-title">
          <div class="avatar blue">${icon('folder')}</div>
          <div style="min-width:0">
            <h3 title="${esc(job.name)}">${esc(job.name)}</h3>
            <div class="entity-sub">${esc(job.connectionName)}</div>
          </div>
        </div>
        <div class="inline">
          ${job.busy ? '<span class="pill orange"><span class="dot"></span>Executando</span>' : ''}
          ${job.enabled ? '<span class="pill green">Ativo</span>' : '<span class="pill">Pausado</span>'}
        </div>
      </div>
      <div class="chips">${chips}</div>
      <div class="entity-meta">
        <div class="meta-row">${icon('calendar')}<span>${esc(job.scheduleText)}</span></div>
        <div class="meta-row">${icon('timer')}<span>${job.enabled && job.nextRunAt ? `Próxima: ${esc(fmtDateShort(job.nextRunAt))} (${esc(fmtRelative(job.nextRunAt))})` : 'Sem próxima execução'}</span></div>
        <div class="meta-row">${icon('shield')}<span>Retenção: ${retention.length ? esc(retention.join(' · ')) : 'sem limite'}</span></div>
        <div class="meta-row">${icon('folder')}<span class="truncate" title="${esc(job.backupFolder)}">${esc(job.backupFolder)}</span></div>
        <div class="meta-row">${icon('pulse')}<span>Última: ${job.lastRunAt ? `${esc(fmtRelative(job.lastRunAt))} · ${STATUS[job.lastStatus]?.label || job.lastStatus}` : 'nunca executado'}</span></div>
      </div>
      <div class="entity-actions">
        <button class="btn small primary" data-action="run-job" data-id="${esc(job.id)}" ${job.busy ? 'disabled' : ''} title="Executar backup agora">${icon('play')} Executar</button>
        <button class="btn small" data-action="edit-job" data-id="${esc(job.id)}">${icon('edit')} Editar</button>
        <button class="btn small" data-action="toggle-job" data-id="${esc(job.id)}">${job.enabled ? `${icon('timer')} Pausar` : `${icon('play')} Ativar`}</button>
        <button class="btn small danger" data-action="delete-job" data-id="${esc(job.id)}" aria-label="Excluir agendamento" title="Excluir agendamento">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('');

  return `
    ${pageHead('Agendamentos', 'Escolha os bancos, a frequência e a retenção de cada backup.',
      `<button class="btn primary" data-action="new-job">${icon('plus')} Novo agendamento</button>`)}
    ${S.jobs.length ? `<div class="card-grid">${cards}</div>` : `<div class="card">${emptyState('clock', 'Nenhum agendamento', 'Crie um agendamento para fazer backup automático dos seus bancos MySQL.', `<button class="btn primary" data-action="new-job">${icon('plus')} Criar agendamento</button>`)}</div>`}`;
}

/* ------------------------------------------------------------------ backups */

function renderBackups() {
  const runs = S.runs.filter((r) => r.databases?.length || r.error);
  const files = S.backups || [];
  const fileMap = new Map(files.map((f) => [f.id, f]));
  const unavailable = S.unavailableBackupFolders || [];
  return `
    ${pageHead('Backups', 'Histórico de execuções e arquivos disponíveis para download e restauração.',
      `<button class="btn" data-action="refresh">${icon('refresh')} Atualizar</button>
       <button class="btn primary" data-action="new-job">${icon('plus')} Novo agendamento</button>`)}

    <div class="stack">
      ${runs.length ? runs.map((r) => renderRunCard(r, fileMap)).join('') : `<div class="card">${emptyState('folder', 'Nenhum backup ainda', 'Os arquivos gerados aparecerão aqui, com opções de download e restauração.', `<button class="btn primary" data-action="new-job">${icon('plus')} Criar agendamento</button>`)}</div>`}
    </div>

    <div class="card" style="margin-top:22px">
      <div class="card-head">
        <h2>Arquivos nas pastas de backup</h2>
        <span class="small muted">${fmtNumber(S.stats.diskFiles)} arquivo(s) · ${fmtBytes(S.stats.diskBytes)}</span>
      </div>
      <div class="card-body flush">
        ${unavailable.length ? `<div class="warn-box">Pastas não acessíveis: ${unavailable.map((folder) => `<span class="mono">${esc(folder)}</span>`).join(' · ')}</div>` : ''}
        ${files.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Arquivo</th><th class="right">Tamanho</th><th>Modificado</th><th class="right">Ações</th></tr></thead>
          <tbody>
            ${files.map((f) => `<tr>
              <td class="mono truncate" title="${esc(f.displayPath)}">${esc(f.displayPath)}</td>
              <td class="right small nowrap">${fmtBytes(f.bytes)}</td>
              <td class="small muted nowrap">${esc(fmtDateTime(f.modifiedAt))}</td>
              <td class="right nowrap">
                 <a class="btn small" href="/api/backups/download?id=${encodeURIComponent(f.id)}">${icon('download')} Baixar</a>
                 <button class="btn small" data-action="restore" data-file-id="${esc(f.id)}" data-file="${esc(f.displayPath)}" data-database="${esc(f.database)}">${icon('restore')} Restaurar</button>
                 <button class="btn small danger" data-action="delete-file" data-file-id="${esc(f.id)}" data-path="${esc(f.displayPath)}" aria-label="Excluir arquivo" title="Excluir arquivo">${icon('trash')}</button>
              </td>
            </tr>`).join('')}
          </tbody>
        </table></div>` : `<div class="empty">${icon('folder')}<p>Nenhum arquivo disponível nas pastas de backup.</p></div>`}
      </div>
    </div>`;
}

function renderRunCard(run, fileMap) {
  const t = runTotals(run);
  const live = liveProgress.get(run.id);
  const isActive = ['running', 'queued'].includes(run.status);
  return `<div class="run">
    <div class="run-head">
      <div class="run-title">
        <h3>${esc(run.jobName)}</h3>
        <div class="run-meta">
          <span>${run.trigger === 'schedule' ? 'Agendado' : 'Manual'}</span>
          <span>${esc(fmtDateTime(run.startedAt || run.queuedAt))}</span>
          <span>${esc(fmtDuration(run.durationMs))}</span>
          <span>${t.ok}/${t.total} banco(s)</span>
          <span>${fmtBytes(t.bytes)}</span>
        </div>
      </div>
      ${isActive && live ? `<span class="live-text" data-live-run="${esc(run.id)}">${esc(live.phase === 'rows' ? `${live.database} · ${live.table} · ${fmtNumber(live.rows)} linhas` : `${live.database || ''} · ${live.table || 'preparando…'}`)}</span>` : ''}
      ${statusPill(run.status)}
      ${isActive ? `<button class="btn small danger" data-action="cancel-run" data-id="${esc(run.id)}">Cancelar</button>` : ''}
    </div>
    <div class="run-dbs">
      ${(run.databases || []).map((db) => {
        const file = fileMap.get(db.fileId);
        const existsOnDisk = Boolean(file);
        const canRestore = db.status === 'success' && existsOnDisk;
        const canDownload = existsOnDisk;
        return `<div class="db-row">
          <span class="db-name" title="${esc(db.name)}">${esc(db.name)}</span>
          ${statusPill(db.status)}
          <div class="db-stats">
            ${db.status === 'success'
              ? `<span>${fmtBytes(db.bytes)}</span><span>${plural(db.rows, 'linha', 'linhas')}</span><span>${plural(db.tables, 'tabela', 'tabelas')}</span><span>${esc(fmtDuration(db.durationMs))}</span>`
              : `<span class="truncate" title="${esc(db.error || '')}">${esc(db.error || 'Aguardando…')}</span>`}
            ${db.file && !existsOnDisk ? '<span class="pill yellow">arquivo indisponível</span>' : ''}
          </div>
          <div class="db-actions">
            ${canDownload ? `<a class="btn small" href="/api/backups/download?id=${encodeURIComponent(file.id)}" title="Baixar .sql.gz">${icon('download')} Baixar</a>` : ''}
            ${canRestore ? `<button class="btn small" data-action="restore" data-file-id="${esc(file.id)}" data-file="${esc(file.displayPath)}" data-database="${esc(db.name)}" title="Restaurar em um banco">${icon('restore')} Restaurar</button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>
    ${run.error ? `<div class="run-error">${esc(run.error)}</div>` : ''}
  </div>`;
}

/* ------------------------------------------------------------------ configurações */

function renderSettings() {
  return `
    ${pageHead('Configurações', 'Preferências gerais e informações da instalação.')}
    <div class="two-col">
      <div class="card pad">
        <div class="section-label">Padrões de backup</div>
        <form id="settings-form" class="form">
          <div class="field">
            <label for="set-keep">Retenção padrão (manter últimos)</label>
            <input id="set-keep" name="defaultKeepLast" type="number" min="0" class="input" value="${S.settings.defaultKeepLast}">
            <span class="help">Usado como sugestão ao criar novos agendamentos. 0 = sem limite.</span>
          </div>
          <div class="field">
            <label for="set-concurrent">Execuções simultâneas</label>
            <input id="set-concurrent" name="maxConcurrentJobs" type="number" min="1" max="4" class="input" value="${S.settings.maxConcurrentJobs}">
            <span class="help">Quantos backups podem rodar ao mesmo tempo (1 a 4).</span>
          </div>
          <div class="field">
            <label for="set-history">Histórico de execuções</label>
            <input id="set-history" name="runHistoryLimit" type="number" min="20" max="2000" class="input" value="${S.settings.runHistoryLimit}">
            <span class="help">Quantidade de execuções mantidas no histórico.</span>
          </div>
          <div class="inline">
            <button class="btn primary" type="submit">${icon('check')} Salvar preferências</button>
          </div>
        </form>
      </div>

      <div class="stack">
        <div class="card pad">
          <div class="section-label">Instalação</div>
          <div class="kv"><span class="k">Versão</span><span class="v">${esc(S.version)}</span></div>
          <div class="kv"><span class="k">Pasta de dados</span><span class="v mono small">${esc(S.paths?.dataDir || 'data')}</span></div>
          <div class="kv"><span class="k">Pasta padrão de backups</span><span class="v mono small">${esc(S.paths?.backupDir || 'data/backups')}</span></div>
          <div class="kv"><span class="k">Arquivos</span><span class="v">${fmtNumber(S.stats.diskFiles)} · ${fmtBytes(S.stats.diskBytes)}</span></div>
          <div class="kv"><span class="k">Servidor</span><span class="v mono small">${esc(location.host)}</span></div>
        </div>

        <div class="card pad">
          <div class="section-label">Como funciona</div>
          <p class="small muted" style="line-height:1.7">
            Os backups são gerados pelo próprio aplicativo (driver nativo), sem depender do
            <code>mysqldump</code>. Cada banco vira um arquivo <code>.sql.gz</code> com estrutura,
            dados, views, rotinas, triggers e eventos. A restauração pode ser feita pela tela de
            Backups, escolhendo a conexão e o banco de destino.
          </p>
        </div>

        <div class="card pad">
          <div class="section-label">Segurança</div>
          <p class="small muted" style="line-height:1.7">
            As senhas ficam criptografadas com AES-256-GCM usando uma chave local exclusiva desta
            instalação. O servidor escuta apenas em <code>127.0.0.1</code> por padrão.
          </p>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ modal base */

let activeModal = null;

function openModal({ title, subtitle = '', body = '', footer = '', wide = false, stack = false, onClose }) {
  const root = $('#modal-root');
  const previous = activeModal;
  if (previous && !stack) previous.close(true);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  if (stack && previous) {
    backdrop.style.zIndex = String(110 + root.querySelectorAll('.modal-backdrop').length * 2);
  }
  backdrop.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head">
      <div><h2>${esc(title)}</h2>${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}</div>
      <button type="button" class="btn icon ghost" data-close aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>`;
  root.appendChild(backdrop);

  const close = (silent = false) => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    if (activeModal?.backdrop === backdrop) activeModal = previous || null;
    if (!silent && onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && activeModal?.backdrop === backdrop) close();
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) close();
  });

  activeModal = { backdrop, close, previous };
  return { el: $('.modal', backdrop), backdrop, close };
}

function confirmDialog({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const { close } = openModal({
      title,
      stack: true,
      body: `<p class="muted" style="line-height:1.65">${message}</p>`,
      footer: `<button type="button" class="btn ghost" data-close>Cancelar</button>
               <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-confirm>${esc(confirmLabel)}</button>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    $('[data-confirm]', activeModal.backdrop).addEventListener('click', () => {
      answered = true;
      resolve(true);
      close(true);
    });
  });
}

function toast(kind, title, message = '') {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const ic = kind === 'success' ? 'check' : kind === 'error' ? 'alert' : 'info';
  el.innerHTML = `${icon(ic)}<div class="t-body"><strong>${esc(title)}</strong>${message ? `<div class="t-msg">${esc(message)}</div>` : ''}</div>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s ease, transform .2s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 220);
  }, kind === 'error' ? 8000 : 4500);
}

/* ------------------------------------------------------------------ conexão: formulário */

function openConnectionModal(conn = null) {
  const isEdit = Boolean(conn);
  const body = `<form id="conn-form" class="form" autocomplete="off">
    <div class="field">
      <label for="conn-name">Nome da conexão</label>
      <input id="conn-name" name="name" class="input" required maxlength="80" placeholder="Ex.: Servidor de produção" value="${esc(conn?.name || '')}">
    </div>
    <div class="form-row three">
      <div class="field">
        <label for="conn-host">Host</label>
        <input id="conn-host" name="host" class="input" required placeholder="127.0.0.1" value="${esc(conn?.host || '127.0.0.1')}">
      </div>
      <div class="field">
        <label for="conn-port">Porta</label>
        <input id="conn-port" name="port" class="input" type="number" min="1" max="65535" value="${conn?.port || 3306}">
      </div>
      <div class="field">
        <label for="conn-timeout">Timeout (ms)</label>
        <input id="conn-timeout" name="connectTimeout" class="input" type="number" min="1000" step="1000" value="${conn?.connectTimeout || 15000}">
      </div>
    </div>
    <div class="form-row">
      <div class="field">
        <label for="conn-user">Usuário</label>
        <input id="conn-user" name="user" class="input" required placeholder="root" value="${esc(conn?.user || '')}">
      </div>
      <div class="field">
        <label for="conn-pass">Senha</label>
        <input id="conn-pass" name="password" class="input" type="password" autocomplete="new-password"
          placeholder="${isEdit ? 'Deixe em branco para manter a senha salva' : 'Senha do MySQL'}">
        <span class="help">${isEdit && conn?.hasPassword ? 'Existe uma senha salva (criptografada).' : 'A senha fica criptografada no disco.'}</span>
      </div>
    </div>
    <div class="form">
      <label class="check">
        <input type="checkbox" id="conn-ssl" ${conn?.ssl ? 'checked' : ''}>
        <span>Usar SSL/TLS
          <span class="help">Marque se o servidor exige conexão segura.</span>
        </span>
      </label>
      <label class="check">
        <input type="checkbox" id="conn-ssl-insecure" ${conn?.sslInsecure ? 'checked' : ''}>
        <span>Aceitar certificado SSL sem validação
          <span class="help">Use apenas em servidores com certificado autoassinado.</span>
        </span>
      </label>
    </div>
    <div id="conn-test-result"></div>
    <div class="hint-box">Dica: use um usuário MySQL com permissão de leitura (SELECT, SHOW VIEW, TRIGGER, LOCK TABLES) nos bancos que serão copiados.</div>
  </form>`;

  const footer = `<button type="button" class="btn" id="conn-test">${icon('pulse')} Testar conexão</button>
    <span class="spacer"></span>
    <button type="button" class="btn ghost" data-close>Cancelar</button>
    <button type="button" class="btn primary" id="conn-save">${isEdit ? 'Salvar alterações' : 'Cadastrar conexão'}</button>`;

  const modal = openModal({
    title: isEdit ? 'Editar conexão' : 'Nova conexão',
    subtitle: 'Dados de acesso ao servidor MySQL/MariaDB.',
    body,
    footer,
  });

  const form = $('#conn-form', modal.el);
  const result = $('#conn-test-result', modal.el);

  const readings = () => ({
    id: conn?.id,
    name: $('#conn-name', form).value.trim() || 'Conexão',
    host: $('#conn-host', form).value.trim(),
    port: Number($('#conn-port', form).value) || 3306,
    user: $('#conn-user', form).value.trim(),
    password: $('#conn-pass', form).value,
    ssl: $('#conn-ssl', form).checked,
    sslInsecure: $('#conn-ssl-insecure', form).checked,
    connectTimeout: Number($('#conn-timeout', form).value) || 15000,
  });

  $('#conn-test', modal.el).addEventListener('click', async () => {
    const btn = $('#conn-test', modal.el);
    btn.disabled = true;
    result.innerHTML = `<div class="hint-box">Conectando…</div>`;
    try {
      const data = await api('/api/connections/test', { method: 'POST', body: readings() });
      result.innerHTML = `<div class="hint-box" style="border-color:rgba(52,211,153,.3);background:rgba(52,211,153,.07);color:#a7f3d0">
        ${icon('check')} Conectado em ${data.latencyMs} ms · MySQL ${esc(data.version)} · ${esc(data.currentUser)}
      </div>`;
    } catch (err) {
      result.innerHTML = `<div class="warn-box" style="border-color:rgba(248,113,113,.3);background:rgba(248,113,113,.07);color:#fca5a5">
        ${icon('alert')} ${esc(err.message)}
      </div>`;
    } finally {
      btn.disabled = false;
    }
  });

  $('#conn-save', modal.el).addEventListener('click', async () => {
    if (!form.reportValidity()) return;
    const btn = $('#conn-save', modal.el);
    btn.disabled = true;
    try {
      const payload = readings();
      delete payload.id;
      if (isEdit) await api(`/api/connections/${conn.id}`, { method: 'PUT', body: payload });
      else await api('/api/connections', { method: 'POST', body: payload });
      modal.close(true);
      toast('success', isEdit ? 'Conexão atualizada' : 'Conexão cadastrada', 'Use o botão Testar para confirmar o acesso.');
      await loadState();
    } catch (err) {
      toast('error', 'Não foi possível salvar', err.message);
      btn.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ agendamento: formulário */

const DOW = [
  { value: 0, label: 'Dom' }, { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' }, { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

async function openJobModal(job = null) {
  if (!S.connections.length) {
    const { close } = openModal({
      title: 'Cadastre uma conexão primeiro',
      body: '<p class="muted">Para criar um agendamento é necessário ter ao menos uma conexão MySQL cadastrada.</p>',
      footer: `<button type="button" class="btn ghost" data-close>Fechar</button>
               <button type="button" class="btn primary" id="go-conn">${icon('plus')} Cadastrar conexão</button>`,
    });
    $('#go-conn', activeModal.backdrop).addEventListener('click', () => {
      close(true);
      openConnectionModal();
    });
    return;
  }

  const isEdit = Boolean(job);
  const schedule = job?.schedule || { mode: 'daily', time: '02:00', days: [1], cron: '0 2 * * *' };
  const selectedDbs = new Set((job?.databases || []).filter((d) => d !== '*'));
  let allDbs = (job?.databases || []).includes('*');
  let mode = schedule.mode || 'daily';

  const defaultKeep = S.settings.defaultKeepLast;

  const body = `<form id="job-form" class="form" autocomplete="off">
    <div class="field">
      <label for="job-name">Nome do agendamento</label>
      <input id="job-name" name="name" class="input" required maxlength="80" placeholder="Ex.: Produção — diário" value="${esc(job?.name || '')}">
    </div>
    <div class="field">
      <label for="job-conn">Conexão</label>
      <select id="job-conn" name="connectionId" class="input" required>
        ${S.connections.map((c) => `<option value="${esc(c.id)}" ${job?.connectionId === c.id ? 'selected' : ''}>${esc(c.name)} — ${esc(c.host)}:${c.port}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Bancos de dados <span class="muted" style="font-weight:400">(selecione um ou mais)</span></label>
      <div id="db-picker" class="db-picker"><div class="loading-line">Carregando bancos…</div></div>
    </div>
    <div class="divider"></div>
    <div class="field">
      <label>Frequência</label>
      <div class="segmented" id="schedule-mode">
        ${['manual', 'daily', 'weekly', 'cron'].map((m) => `<button type="button" data-mode="${m}" class="${mode === m ? 'active' : ''}">${m === 'manual' ? 'Manual' : m === 'daily' ? 'Diário' : m === 'weekly' ? 'Semanal' : 'Cron'}</button>`).join('')}
      </div>
    </div>
    <div id="schedule-time-wrap">
      <div class="field">
        <label for="job-time">Horário de execução</label>
        <input id="job-time" class="input" type="time" value="${esc(schedule.time || '02:00')}" style="max-width:190px">
        <span class="help">Horário local do computador onde o app está rodando.</span>
      </div>
    </div>
    <div id="schedule-days-wrap" class="field hidden">
      <label>Dias da semana</label>
      <div class="inline" id="job-days">
        ${DOW.map((d) => `<label class="check" style="gap:6px"><input type="checkbox" value="${d.value}" ${(schedule.days || []).includes(d.value) ? 'checked' : ''}> ${d.label}</label>`).join('')}
      </div>
    </div>
    <div id="schedule-cron-wrap" class="field hidden">
      <label for="job-cron">Expressão cron</label>
      <input id="job-cron" class="input mono" value="${esc(schedule.cron || '0 2 * * *')}" placeholder="0 2 * * *">
      <span class="help">Formato: minuto hora dia-do-mês mês dia-da-semana. Ex.: <code>0 */6 * * *</code> a cada 6 horas.</span>
    </div>
    <div class="divider"></div>
    <div class="form-row">
      <div class="field">
        <label for="job-keep-last">Retenção · manter últimos</label>
        <input id="job-keep-last" class="input" type="number" min="0" value="${job?.retention?.keepLast ?? defaultKeep}">
        <span class="help">0 = não apagar por quantidade.</span>
      </div>
      <div class="field">
        <label for="job-keep-days">Retenção · idade máxima (dias)</label>
        <input id="job-keep-days" class="input" type="number" min="0" value="${job?.retention?.keepDays ?? 0}">
        <span class="help">0 = não apagar por idade.</span>
      </div>
    </div>
    <div class="hint-box">A retenção é aplicada por banco na pasta usada pela execução, depois de gerar o backup com sucesso.</div>
    <div class="divider"></div>
    <div class="field">
      <label for="job-backup-base">Pasta de backup (opcional)</label>
      <input id="job-backup-base" class="input mono" readonly value="${esc(job?.backupBase || '')}" placeholder="${esc(S.paths.backupDir)}">
      <span class="help">O app cria uma subpasta por agendamento e não move arquivos antigos.</span>
      ${job ? `<span class="help">Destino salvo: <span class="mono">${esc(job.backupFolder)}</span></span>` : ''}
      <div class="inline">
        <button type="button" class="btn small" id="job-pick-folder"${S.canPickBackupFolder ? '' : ' disabled'}>${icon('folder')} Selecionar pasta…</button>
        <button type="button" class="btn small" id="job-reset-folder"${job?.backupBase ? '' : ' disabled'}>Usar pasta padrão</button>
        <button type="button" class="btn small" id="job-check-folder">Verificar pasta</button>
        <span id="job-folder-status" class="help" role="status"></span>
      </div>
      ${S.canPickBackupFolder ? '' : '<span class="help">Para selecionar outra pasta, abra o app localmente em uma sessão do Windows.</span>'}
    </div>
    <div class="divider"></div>
    <label class="check">
      <input type="checkbox" id="job-enabled" ${job ? (job.enabled ? 'checked' : '') : 'checked'}>
      <span>Agendamento ativo <span class="help">Desative para pausar sem apagar a configuração.</span></span>
    </label>
    <div class="field">
      <label for="job-notes">Observações (opcional)</label>
      <textarea id="job-notes" class="input" placeholder="Anotações sobre este backup…">${esc(job?.notes || '')}</textarea>
    </div>
  </form>`;

  const footer = `<button type="button" class="btn ghost" data-close>Cancelar</button>
    <button type="button" class="btn primary" id="job-save">${isEdit ? 'Salvar alterações' : 'Criar agendamento'}</button>`;

  const modal = openModal({
    title: isEdit ? 'Editar agendamento' : 'Novo agendamento',
    subtitle: 'Escolha a conexão, os bancos e quando o backup deve rodar.',
    body,
    footer,
    wide: true,
  });

  const el = modal.el;
  const picker = $('#db-picker', el);
  const timeWrap = $('#schedule-time-wrap', el);
  const daysWrap = $('#schedule-days-wrap', el);
  const cronWrap = $('#schedule-cron-wrap', el);
  const connSelect = $('#job-conn', el);

  const syncMode = () => {
    $$('#schedule-mode button', el).forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    const manual = mode === 'manual';
    timeWrap.classList.toggle('hidden', manual || mode === 'cron');
    daysWrap.classList.toggle('hidden', mode !== 'weekly');
    cronWrap.classList.toggle('hidden', mode !== 'cron');
  };

  $$('#schedule-mode button', el).forEach((b) => {
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      if (mode === 'weekly' && !$$('#job-days input:checked', el).length) {
        const monday = $('#job-days input[value="1"]', el);
        if (monday) monday.checked = true;
      }
      syncMode();
    });
  });
  syncMode();

  const renderPicker = (databases) => {
    picker.innerHTML = `
      <label class="db-option all-option">
        <input type="checkbox" data-all ${allDbs ? 'checked' : ''}>
        <span class="db-n">Todos os bancos</span>
        <span class="db-i">inclui bancos criados no futuro</span>
      </label>
      ${databases.map((d) => `<label class="db-option">
        <input type="checkbox" data-db value="${esc(d.name)}" ${!allDbs && selectedDbs.has(d.name) ? 'checked' : ''} ${allDbs ? 'disabled' : ''}>
        <span class="db-n">${esc(d.name)}</span>
        <span class="db-i">${plural(d.tableCount, 'tabela', 'tabelas')} · ${fmtBytes(d.sizeBytes)}</span>
      </label>`).join('')}`;
  };

  const loadDbs = async (connectionId) => {
    picker.innerHTML = '<div class="loading-line">Carregando bancos…</div>';
    try {
      let databases = dbCache.get(connectionId);
      if (!databases) {
        const data = await api(`/api/connections/${connectionId}/databases`);
        databases = data.databases;
        dbCache.set(connectionId, databases);
      }
      if (!databases.length) {
        picker.innerHTML = '<div class="loading-line">Nenhum banco de usuário encontrado nesta conexão.</div>';
        return;
      }
      renderPicker(databases);
    } catch (err) {
      picker.innerHTML = `<div class="loading-line" style="color:var(--red)">Não foi possível listar os bancos: ${esc(err.message)}</div>
        <label class="db-option all-option"><input type="checkbox" data-all ${allDbs ? 'checked' : ''}><span class="db-n">Todos os bancos</span><span class="db-i">tentar mesmo assim</span></label>`;
    }
  };

  picker.addEventListener('change', (e) => {
    if (e.target.matches('[data-all]')) {
      allDbs = e.target.checked;
      $$('input[data-db]', picker).forEach((input) => {
        input.disabled = allDbs;
        if (allDbs) input.checked = false;
        else if (selectedDbs.has(input.value)) input.checked = true;
      });
    } else if (e.target.matches('[data-db]')) {
      if (e.target.checked) selectedDbs.add(e.target.value);
      else selectedDbs.delete(e.target.value);
    }
  });

  const folderInput = $('#job-backup-base', el);
  const folderStatus = $('#job-folder-status', el);
  const checkFolder = $('#job-check-folder', el);
  const pickFolder = $('#job-pick-folder', el);
  const resetFolder = $('#job-reset-folder', el);
  const saveJob = $('#job-save', el);
  pickFolder.addEventListener('click', async () => {
    if (saveJob.disabled) return;
    pickFolder.disabled = resetFolder.disabled = checkFolder.disabled = saveJob.disabled = true;
    folderStatus.textContent = 'Selecione a pasta na janela do Windows…';
    try {
      const { backupBase } = await api('/api/jobs/pick-backup-folder', {
        method: 'POST',
        body: { backupBase: folderInput.value },
      });
      if (backupBase !== null) folderInput.value = backupBase;
      folderStatus.textContent = '';
    } catch (err) {
      folderStatus.textContent = err.message;
    } finally {
      pickFolder.disabled = checkFolder.disabled = saveJob.disabled = false;
      resetFolder.disabled = !folderInput.value;
    }
  });
  resetFolder.addEventListener('click', () => {
    folderInput.value = '';
    folderStatus.textContent = '';
    resetFolder.disabled = true;
  });
  checkFolder.addEventListener('click', async () => {
    const backupBase = folderInput.value;
    checkFolder.disabled = true;
    pickFolder.disabled = true;
    folderStatus.textContent = 'Verificando acesso…';
    try {
      const { folder } = await api('/api/jobs/check-backup-folder', {
        method: 'POST',
        body: { backupBase, jobId: job?.id },
      });
      if (folderInput.value === backupBase) folderStatus.textContent = `Gravação permitida em ${folder}.`;
    } catch (err) {
      if (folderInput.value === backupBase) folderStatus.textContent = err.message;
    } finally {
      checkFolder.disabled = false;
      pickFolder.disabled = !S.canPickBackupFolder;
    }
  });

  connSelect.addEventListener('change', () => loadDbs(connSelect.value));
  await loadDbs(connSelect.value);

  $('#job-save', el).addEventListener('click', async () => {
    const name = $('#job-name', el).value.trim();
    if (!name) { toast('error', 'Informe um nome para o agendamento'); return; }

    let databases = [];
    if (allDbs) databases = ['*'];
    else databases = $$('input[data-db]:checked', picker).map((i) => i.value);
    if (!databases.length) { toast('error', 'Selecione ao menos um banco de dados'); return; }

    const days = $$('#job-days input:checked', el).map((i) => Number(i.value));
    if (mode === 'weekly' && !days.length) { toast('error', 'Selecione ao menos um dia da semana'); return; }

    const payload = {
      name,
      connectionId: connSelect.value,
      databases,
      enabled: $('#job-enabled', el).checked,
      schedule: {
        mode,
        time: $('#job-time', el).value || '02:00',
        days,
        cron: $('#job-cron', el).value.trim() || '0 2 * * *',
      },
      retention: {
        keepLast: Number($('#job-keep-last', el).value) || 0,
        keepDays: Number($('#job-keep-days', el).value) || 0,
      },
      notes: $('#job-notes', el).value,
      backupBase: folderInput.value,
    };

    const btn = $('#job-save', el);
    btn.disabled = true;
    try {
      if (isEdit) await api(`/api/jobs/${job.id}`, { method: 'PUT', body: payload });
      else await api('/api/jobs', { method: 'POST', body: payload });
      modal.close(true);
      toast('success', isEdit ? 'Agendamento atualizado' : 'Agendamento criado', payload.schedule.mode === 'manual' ? 'Execute manualmente pela tela de agendamentos.' : 'O backup rodará automaticamente no horário configurado.');
      dbCache.delete(payload.connectionId);
      await loadState();
    } catch (err) {
      toast('error', 'Não foi possível salvar', err.message);
      btn.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ restauração */

function openRestoreModal(fileId, file, database) {
  const conns = S.connections;
  if (!conns.length) {
    toast('error', 'Nenhuma conexão cadastrada', 'Cadastre uma conexão para restaurar o backup.');
    return;
  }
  const body = `<form id="restore-form" class="form">
    <div class="hint-box">
      <strong>Arquivo:</strong> <span class="mono">${esc(file)}</span><br>
      <strong>Banco de origem:</strong> <span class="mono">${esc(database || 'Não identificado')}</span>
    </div>
    <div class="field">
      <label for="restore-conn">Conexão de destino</label>
      <select id="restore-conn" class="input" required>
        ${conns.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} — ${esc(c.host)}:${c.port}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label for="restore-db">Banco de destino</label>
      <input id="restore-db" class="input mono" required value="${esc(database)}" pattern="[A-Za-z0-9_.\\-\\$]+">
      <span class="help">Será criado se não existir.</span>
    </div>
    <label class="check">
      <input type="checkbox" id="restore-recreate">
      <span>Apagar e recriar o banco de destino
        <span class="help">Remove todos os dados atuais do banco de destino antes de restaurar.</span>
      </span>
    </label>
    <div class="warn-box">
      ${icon('alert')} A restauração executa <code>DROP TABLE</code> e recria as tabelas contidas no arquivo.
      Tabelas do banco de destino que não existem no backup não são removidas (exceto com a opção acima).
    </div>
    <div id="restore-progress" class="hidden">
      <div class="progress" style="margin-top:4px"><span></span></div>
      <div class="small muted" data-restore-status style="margin-top:8px">Preparando…</div>
    </div>
  </form>`;

  const footer = `<button type="button" class="btn ghost" data-close>Fechar</button>
    <button type="button" class="btn primary" id="restore-go">${icon('restore')} Restaurar backup</button>`;

  const modal = openModal({
    title: 'Restaurar backup',
    subtitle: 'Atenção: os dados atuais das tabelas de destino serão substituídos.',
    body,
    footer,
    wide: true,
  });

  const el = modal.el;
  const progressBox = $('#restore-progress', el);
  const statusEl = $('[data-restore-status]', el);
  const btn = $('#restore-go', el);

  btn.addEventListener('click', async () => {
    const form = $('#restore-form', el);
    if (!form.reportValidity()) return;
    const targetDatabase = $('#restore-db', el).value.trim();
    const connectionId = $('#restore-conn', el).value;
    const recreate = $('#restore-recreate', el).checked;
    if (recreate) {
      const ok = await confirmDialog({
        title: 'Apagar banco de destino?',
        message: `O banco <strong>${esc(targetDatabase)}</strong> será <strong>apagado por completo</strong> e recriado, e só então o backup será restaurado. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Apagar e restaurar',
        danger: true,
      });
      if (!ok) return;
    }
    btn.disabled = true;
    progressBox.classList.remove('hidden');
    statusEl.textContent = 'Enviando…';
    try {
      const result = await api('/api/restore', {
        method: 'POST',
        body: { connectionId, targetDatabase, fileId, recreate },
      });
      statusEl.innerHTML = `<span style="color:var(--green)">${esc(fmtNumber(result.statements))} comandos restaurados em ${esc(fmtDuration(result.durationMs))}.</span>`;
      toast('success', 'Backup restaurado', `Banco "${targetDatabase}" restaurado com sucesso.`);
      btn.textContent = 'Concluído';
      btn.disabled = true;
    } catch (err) {
      statusEl.innerHTML = `<span style="color:var(--red)">${esc(err.message)}</span>`;
      toast('error', 'Falha na restauração', err.message);
      btn.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ ações */

function findJob(id) {
  return S.jobs.find((j) => j.id === id);
}

async function toggleJob(job) {
  const payload = {
    name: job.name,
    connectionId: job.connectionId,
    databases: job.databases,
    schedule: job.schedule,
    retention: job.retention,
    enabled: !job.enabled,
    notes: job.notes,
  };
  await api(`/api/jobs/${job.id}`, { method: 'PUT', body: payload });
  toast('success', job.enabled ? 'Agendamento pausado' : 'Agendamento ativado', job.name);
  await loadState();
}

async function handleAction(action, el) {
  switch (action) {
    case 'new-connection':
      openConnectionModal();
      break;
    case 'edit-connection': {
      const conn = S.connections.find((c) => c.id === el.dataset.id);
      if (conn) openConnectionModal(conn);
      break;
    }
    case 'test-connection': {
      const conn = S.connections.find((c) => c.id === el.dataset.id);
      if (!conn) return;
      el.disabled = true;
      const original = el.innerHTML;
      el.innerHTML = `${icon('refresh', 'spin')} Testando`;
      try {
        const data = await api('/api/connections/test', { method: 'POST', body: { id: conn.id } });
        toast('success', 'Conexão OK', `MySQL ${data.version} · ${data.latencyMs} ms · ${data.currentUser}`);
        await loadState();
      } catch (err) {
        toast('error', 'Falha ao conectar', err.message);
        await loadState();
      } finally {
        el.disabled = false;
        el.innerHTML = original;
      }
      break;
    }
    case 'delete-connection': {
      const conn = S.connections.find((c) => c.id === el.dataset.id);
      if (!conn) return;
      const used = S.jobs.filter((j) => j.connectionId === conn.id).length;
      if (used) {
        toast('error', 'Conexão em uso', `Existem ${used} agendamento(s) usando esta conexão. Remova-os primeiro.`);
        return;
      }
      const ok = await confirmDialog({
        title: 'Excluir conexão?',
        message: `A conexão <strong>${esc(conn.name)}</strong> será removida. Os arquivos de backup já gerados não serão apagados.`,
        confirmLabel: 'Excluir conexão',
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/connections/${conn.id}`, { method: 'DELETE' });
        toast('success', 'Conexão excluída');
        await loadState();
      } catch (err) {
        toast('error', 'Não foi possível excluir', err.message);
      }
      break;
    }
    case 'new-job':
      openJobModal();
      break;
    case 'edit-job': {
      const job = findJob(el.dataset.id);
      if (job) openJobModal(job);
      break;
    }
    case 'run-job': {
      const job = findJob(el.dataset.id);
      if (!job) return;
      el.disabled = true;
      try {
        await api(`/api/jobs/${job.id}/run`, { method: 'POST' });
        toast('info', 'Backup iniciado', job.name);
        scheduleRefresh(100);
      } catch (err) {
        toast('error', 'Não foi possível iniciar', err.message);
        el.disabled = false;
      }
      break;
    }
    case 'toggle-job': {
      const job = findJob(el.dataset.id);
      if (!job) return;
      try {
        await toggleJob(job);
      } catch (err) {
        toast('error', 'Não foi possível alterar', err.message);
      }
      break;
    }
    case 'delete-job': {
      const job = findJob(el.dataset.id);
      if (!job) return;
      const ok = await confirmDialog({
        title: 'Excluir agendamento?',
        message: `O agendamento <strong>${esc(job.name)}</strong> será removido. Os arquivos de backup já gerados permanecerão no disco.`,
        confirmLabel: 'Excluir agendamento',
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/jobs/${job.id}`, { method: 'DELETE' });
        toast('success', 'Agendamento excluído');
        await loadState();
      } catch (err) {
        toast('error', 'Não foi possível excluir', err.message);
      }
      break;
    }
    case 'cancel-run': {
      try {
        await api(`/api/runs/${el.dataset.id}/cancel`, { method: 'POST' });
        toast('info', 'Cancelamento solicitado', 'A execução será interrompida com segurança.');
        scheduleRefresh(400);
      } catch (err) {
        toast('error', 'Não foi possível cancelar', err.message);
      }
      break;
    }
    case 'restore':
      openRestoreModal(el.dataset.fileId, el.dataset.file, el.dataset.database);
      break;
    case 'delete-file': {
      const rel = el.dataset.path;
      const ok = await confirmDialog({
        title: 'Excluir arquivo de backup?',
        message: `O arquivo <strong class="mono">${esc(rel)}</strong> será apagado do disco. Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir arquivo',
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/backups?id=${encodeURIComponent(el.dataset.fileId)}`, { method: 'DELETE' });
        toast('success', 'Arquivo excluído');
        await loadState();
      } catch (err) {
        toast('error', 'Não foi possível excluir', err.message);
      }
      break;
    }
    case 'refresh':
      await loadState();
      toast('info', 'Dados atualizados');
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------ eventos SSE */

function onServerEvent(ev) {
  if (!ev || !ev.type) return;
  switch (ev.type) {
    case 'database-progress': {
      liveProgress.set(ev.runId, {
        database: ev.database,
        table: ev.table,
        rows: ev.rows || 0,
        phase: ev.phase,
      });
      const node = $(`[data-live-run="${ev.runId}"]`);
      if (node) {
        node.textContent = ev.phase === 'rows'
          ? `${ev.database} · ${ev.table} · ${plural(ev.rows, 'linha', 'linhas')}`
          : ev.phase === 'table'
            ? `${ev.database} · lendo ${ev.table}`
            : `${ev.database} · ${ev.table || 'preparando…'}`;
      }
      break;
    }
    case 'run-queued':
    case 'run-started':
    case 'run-finished':
    case 'database-started':
    case 'database-finished':
    case 'backup-deleted':
      if (ev.type === 'run-finished') {
        liveProgress.delete(ev.runId);
        const msg = ev.status === 'success' ? 'Backup concluído com sucesso' : ev.status === 'partial' ? 'Backup concluído com falhas parciais' : ev.status === 'cancelled' ? 'Backup cancelado' : 'Backup falhou';
        toast(ev.status === 'success' ? 'success' : ev.status === 'failed' ? 'error' : 'info', msg, ev.error || (ev.totals ? `${ev.totals.ok}/${ev.totals.databases} banco(s) · ${fmtBytes(ev.totals.bytes)}` : ''));
      }
      scheduleRefresh(250);
      break;
    case 'restore-progress': {
      const status = $('[data-restore-status]');
      if (status) {
        status.textContent = ev.phase === 'validate'
          ? 'Validando o arquivo de backup…'
          : `${fmtNumber(ev.statements)} comando(s) executado(s) · ${ev.percent || 0}%`;
      }
      break;
    }
    case 'restore-finished':
      break;
    default:
      break;
  }
}

function connectSSE() {
  if (sse) sse.close();
  sse = new EventSource('/api/events');
  sse.onopen = () => setServerStatus(true);
  sse.onerror = () => setServerStatus(false, 'Reconectando…');
  sse.onmessage = (e) => {
    try { onServerEvent(JSON.parse(e.data)); } catch { /* ignora */ }
  };
}

/* ------------------------------------------------------------------ inicialização */

function init() {
  $('#brand-logo').innerHTML = LOGO;
  $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });

  window.addEventListener('hashchange', render);

  $('#main').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.tagName === 'A') return;
    e.preventDefault();
    handleAction(el.dataset.action, el).catch((err) => toast('error', 'Erro', err.message));
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'settings-form') return;
    e.preventDefault();
    const form = e.target;
    const body = {
      defaultKeepLast: Number(form.defaultKeepLast.value) || 0,
      maxConcurrentJobs: Number(form.maxConcurrentJobs.value) || 1,
      runHistoryLimit: Number(form.runHistoryLimit.value) || 400,
    };
    api('/api/settings', { method: 'PUT', body })
      .then(() => { toast('success', 'Preferências salvas'); return loadState(); })
      .catch((err) => toast('error', 'Não foi possível salvar', err.message));
  });

  loadState()
    .then(() => {
      connectSSE();
      setServerStatus(true);
    })
    .catch((err) => {
      setServerStatus(false, 'Servidor offline');
      $('#main').innerHTML = `<div class="card pad">${emptyState('alert', 'Não foi possível carregar', err.message, '<button class="btn primary" onclick="location.reload()">Tentar novamente</button>')}</div>`;
    });
}

init();
