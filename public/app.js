import { fixTerms, joinSpoken } from '/dictation.mjs';

/** The server prints a link with its token. The token moves from the address bar to this tab's session storage. */
const TOKEN = (() => {
  const fromLink = new URLSearchParams(location.search).get('token');
  if (!fromLink) {
    try {
      return sessionStorage.getItem('sdc.token') ?? '';
    } catch {
      return '';
    }
  }
  try {
    sessionStorage.setItem('sdc.token', fromLink);
  } catch {}
  history.replaceState(null, '', location.pathname + location.hash);
  return fromLink;
})();
const app = /** @type {HTMLElement} */ (document.getElementById('app'));
const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);

// ---------- Formatting

const esc = (/** @type {unknown} */ v) => String(v ?? '').replace(/[&<>"']/g, (c) => /** @type {Record<string, string>} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = (/** @type {number | null | undefined} */ v) => (v == null || Number.isNaN(v) ? '–' : v.toFixed(1));
const f2 = (/** @type {number | null | undefined} */ v) => (v == null || Number.isNaN(v) ? '–' : v.toFixed(2));
const mmss = (/** @type {number} */ sec) => `${String(Math.floor(Math.abs(sec) / 60)).padStart(2, '0')}:${String(Math.floor(Math.abs(sec) % 60)).padStart(2, '0')}`;
const day = (/** @type {string} */ iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const hm = (/** @type {number} */ min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} m` : `${min} m`);
const minutesFor = (/** @type {number} */ probes) => (/** @type {Record<number, number>} */ ({ 5: 30, 8: 45, 12: 60 }))[probes] ?? 45;
const secondsSince = (/** @type {string} */ iso) => Math.max(0, (Date.now() - Date.parse(iso)) / 1000);

/** Interviewer replies are short prose; this covers paragraphs, lists, bold and code. */
function md(/** @type {string} */ src) {
  const inline = (/** @type {string} */ s) => s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return esc(src).split(/\n{2,}/).map((chunk) => {
    const lines = chunk.split('\n');
    if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    return `<p>${inline(chunk).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

const svg = (/** @type {string} */ d, w = 2.4) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.6),
  dot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>',
  up: svg('<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>', 2.6),
  dash: svg('<path d="M7 12h10"/>'),
  ring: svg('<circle cx="12" cy="12" r="7"/>', 2),
  cross: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
  play: svg('<path d="M7 5l12 7-12 7z"/>', 2),
  arrow: svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>', 2),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>', 2),
  retry: svg('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>', 2),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>', 2),
};
const READY = {
  Ready: { tone: 'accent', icon: ICON.check },
  Close: { tone: 'ink', icon: ICON.dot },
  Building: { tone: 'warn', icon: ICON.up },
  'No data': { tone: 'faint', icon: ICON.dash },
};
const VERDICT_TONE = /** @type {Record<string, string>} */ ({ 'Strong hire': 'accent', Hire: 'accent', 'Lean hire': 'ink', 'Lean no hire': 'warn', 'No hire': 'warn' });
const status = (/** @type {string} */ label, /** @type {{ tone: string, icon: string }} */ m) => `<span class="status tone-${m.tone}">${m.icon}${esc(label)}</span>`;
const PHASES = [['Scope and estimates', 0.15], ['APIs and data model', 0.3], ['High-level design', 0.5], ['Deep dive', 0.8], ['Failures and wrap-up', 1]];

// ---------- State and API

const S = {
  /** @type {any} */ data: null,
  /** The target role. The first state from the server sets it from the profile. */
  target: '',
  view: 'overview', arg: '', /** @type {Record<string, string>} */ query: {},
  /** @type {any} */ live: null, /** @type {any} */ report: null,
  busy: false, locked: false, pending: '', error: '', flash: '', /** @type {string | null} */ confirm: null,
  /** @type {AbortController | null} */ ctl: null,
  animated: false, /** @type {number | undefined} */ clock: undefined, /** @type {number | undefined} */ poll: undefined, /** @type {number | undefined} */ notesTimer: undefined,
};

/**
 * Without a valid token or a running server nothing works, so the whole page says how to get a fresh link.
 * It stays locked: after that, no request goes out. @returns {Error}
 */
function locked() {
  if (!S.locked) {
    S.locked = true;
    clearInterval(S.clock);
    clearTimeout(S.poll);
    document.body.innerHTML = `<main class="main locked"><section class="panel"><div class="empty" role="alert"><strong>The coach server stopped. Open the new link that it printed.</strong>
      <span>Each time the server starts, it prints a new link in the terminal, like <code>System Design Coach on http://127.0.0.1:…/?token=…</code>. If the server is not running, start it, then open that link. The Mac app opens it for you.</span>
      <span>A link works only while the server that printed it runs, so an older link, tab or bookmark stops working.</span></div></section></main>`;
  }
  return new Error('The coach needs the link that its server printed.');
}

/** A request that cannot reach the server locks the page. An abort is the user's Stop, not a network error. */
const net = (/** @type {Promise<any>} */ p) => p.catch((e) => {
  throw e?.name === 'AbortError' ? e : locked();
});

async function api(/** @type {string} */ path, /** @type {unknown} */ body) {
  if (S.locked) throw locked();
  const res = await net(fetch(path, body === undefined ? { headers: { 'X-SDC-Token': TOKEN } } : {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-SDC-Token': TOKEN },
  }));
  if (res.status === 401) throw locked();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

/** POSTs and reads the server-sent events of the response. */
async function stream(/** @type {string} */ path, /** @type {unknown} */ body, /** @type {(e: string, d: any) => void} */ on, /** @type {AbortSignal} */ signal) {
  if (S.locked) throw locked();
  const res = await net(fetch(path, { method: 'POST', body: JSON.stringify(body), signal, headers: { 'Content-Type': 'application/json', 'X-SDC-Token': TOKEN } }));
  if (res.status === 401) throw locked();
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `${res.status} ${res.statusText}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await net(reader.read());
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
      // Split on \n only. A regex with the m flag also breaks lines at U+2028 and U+2029.
      const lines = buf.slice(0, i).split('\n');
      buf = buf.slice(i + 2);
      const field = (/** @type {string} */ name) => lines.find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2);
      const ev = field('event');
      const data = field('data');
      if (ev && data) on(ev, JSON.parse(data));
    }
  }
}

/** The server holds this stream open while it runs. When it ends or fails, the server stopped, so the page locks for good. */
async function watchServer() {
  try {
    const res = await fetch('/api/live', { headers: { 'X-SDC-Token': TOKEN } });
    const reader = /** @type {ReadableStream<Uint8Array>} */ (res.body).getReader();
    while (!(await reader.read()).done); // each read is a heartbeat
  } catch {}
  locked();
}

async function refresh() {
  S.data = await api('/api/state');
  // Once, from the profile. After that, the rail select changes it.
  S.target ||= S.data.profile.target || 'google-l5';
  if (!S.data.roles.some((/** @type {any} */ r) => r.id === S.target)) S.target = S.data.roles[0].id;
}

/** The target role lives in the profile, because the page origin changes with the port at each server start. */
function setTarget(/** @type {string} */ id) {
  S.target = id;
  $('#target').value = id;
  api('/api/profile', { target: id }).catch((e) => {
    S.flash = `Could not save the target role: ${e.message}`;
    render();
  });
  render();
}

/** An answer draft lives in this tab until its interview ends, is discarded or is deleted. */
function dropDraft(/** @type {string} */ id) {
  try {
    sessionStorage.removeItem(`sdc.draft.${id}`);
  } catch {}
}

const role = (/** @type {string} */ id) => S.data.roles.find((/** @type {any} */ r) => r.id === id);
const question = (/** @type {string} */ id) => S.data.questions.find((/** @type {any} */ q) => q.id === id);
const dim = (/** @type {string} */ id) => S.data.dimensions.find((/** @type {any} */ d) => d.id === id);
const catName = (/** @type {string} */ id) => S.data.categories.find((/** @type {any} */ c) => c.id === id)?.name ?? id;
const roleName = (/** @type {any} */ r) => `${r.company} ${r.title} (${r.level})`;
const roleShort = (/** @type {any} */ r) => `${r.company} ${r.level}`;
/** The role's bars as one weighted number on the 0-4 scale, comparable to a weighted interview score. */
const weightedBar = (/** @type {any} */ r) => {
  const ids = Object.keys(r.bars);
  return ids.reduce((a, id) => a + r.bars[id] * r.weights[id], 0) / ids.reduce((a, id) => a + r.weights[id], 0);
};

// ---------- Charts

function arcPath() {
  const pt = (/** @type {number} */ deg) => `${(60 + 40 * Math.cos((deg * Math.PI) / 180)).toFixed(2)} ${(56 + 40 * Math.sin((deg * Math.PI) / 180)).toFixed(2)}`;
  return `M ${pt(150)} A 40 40 0 1 1 ${pt(30)}`;
}
const ARC = arcPath();

function gauge(/** @type {any} */ r, /** @type {any} */ rd) {
  const m = READY[/** @type {keyof typeof READY} */ (rd.status)];
  const pct = rd.pct ?? 0;
  const tone = rd.status === 'Building' ? 'warn' : rd.status === 'Close' ? 'ink' : 'accent';
  const label = `${roleName(r)}: ${rd.pct == null ? 'no data yet' : `${rd.pct}% ready`}, ${rd.status}. Make it the target role.`;
  return `<button type="button" class="gauge" data-act="target" data-id="${esc(r.id)}" aria-pressed="${r.id === S.target}" aria-label="${esc(label)}">
    <svg viewBox="0 0 120 92" aria-hidden="true"><path class="arc-track" d="${ARC}"/>${pct > 0 ? `<path class="arc-fill tone-${tone}" d="${ARC}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - pct}"/>` : ''}<text class="gauge-value" x="60" y="62" text-anchor="middle">${rd.pct == null ? '–' : `${rd.pct}%`}</text></svg>
    <span class="who">${esc(r.company)} ${esc(r.level)}</span><span class="title">${esc(r.title)}</span>${status(rd.status, m)}</button>`;
}

/** A 0-4 bar with ticks at the L4 and L5 bars and a marker at the target role's bar. */
function bar(/** @type {number | null} */ v, /** @type {number} */ target, /** @type {string} */ tone) {
  const pct = (/** @type {number} */ x) => `${(Math.max(0, Math.min(4, x)) / 4) * 100}%`;
  return `<svg class="bar" width="100%" height="20" aria-hidden="true"><rect class="track" x="0" y="7" width="100%" height="6" rx="3"/>${v ? `<rect class="fill tone-${tone}" x="0" y="7" width="${pct(v)}" height="6" rx="3"/>` : ''}<rect class="tick-l4" x="50%" y="1" width="2" height="18" transform="translate(-1 0)"/><rect class="tick-l5" x="75%" y="1" width="2" height="18" transform="translate(-1 0)"/><rect class="tick-target" x="${pct(target)}" y="0" width="8" height="3" rx="1" transform="translate(-4 0)"/></svg>`;
}

function trend(/** @type {{ label: string, value: number, title: string }[]} */ pts, /** @type {number} */ barValue) {
  const W = 560, H = 210, L = 30, R = 70, T = 14, B = 30;
  const x = (/** @type {number} */ i) => (pts.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (pts.length - 1));
  const y = (/** @type {number} */ v) => T + ((4 - v) / 4) * (H - T - B);
  let g = '';
  for (const v of [0, 1, 2, 3, 4]) g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  g += `<line class="barline" x1="${L}" x2="${W - R}" y1="${y(barValue)}" y2="${y(barValue)}"/><text class="strong" x="${W - R + 8}" y="${y(barValue) + 4}">bar ${f1(barValue)}</text>`;
  if (pts.length > 1) g += `<polyline class="line" points="${pts.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}"/>`;
  const step = Math.max(1, Math.ceil(pts.length / 7));
  pts.forEach((p, i) => {
    const last = i === pts.length - 1;
    g += `<g><title>${esc(p.title)}</title><circle class="hit" cx="${x(i)}" cy="${y(p.value)}" r="14"/><circle class="dot${last ? ' last' : ''}" cx="${x(i)}" cy="${y(p.value)}" r="${last ? 5.5 : 4}"/></g>`;
    if (i % step === 0 || last) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`;
  });
  const lastPt = pts[pts.length - 1];
  // Near the bar, a centred label runs into the "bar" label to the right of the last point.
  const near = Math.abs(y(lastPt.value) - 12 - (y(barValue) + 4)) < 16;
  g += `<text class="strong" x="${x(pts.length - 1) - (near ? 10 : 0)}" y="${y(lastPt.value) - 12}" text-anchor="${near ? 'end' : 'middle'}">${f2(lastPt.value)}</text>`;
  const desc = `Weighted score over ${pts.length} interviews, latest ${f2(lastPt.value)}, against a bar of ${f1(barValue)}.`;
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(desc)}">${g}</svg>`;
}

/** Status of one proficiency value against the target bar. */
function dimStatus(/** @type {number | null} */ v, /** @type {number} */ target) {
  if (v == null) return status('No data', READY['No data']);
  const short = target - v;
  if (short <= 0) return status('Meets bar', { tone: 'accent', icon: ICON.check });
  return status(`${short.toFixed(1)} to bar`, short <= 1 ? { tone: 'ink', icon: ICON.dot } : { tone: 'warn', icon: ICON.up });
}

const pips = (/** @type {number} */ score) => `<span class="pips${score < 2 ? ' warn' : ''}" aria-hidden="true">${[1, 2, 3, 4].map((i) => `<i class="${i <= score ? 'on' : ''}"></i>`).join('')}</span>`;

// ---------- Views

function flash() {
  return S.flash ? `<p class="error-line" role="alert">${esc(S.flash)}</p>` : '';
}

function viewOverview() {
  const d = S.data;
  const r = role(S.target);
  const prof = d.proficiency;
  const graded = d.sessions.filter((/** @type {any} */ s) => s.counted);
  const minutes = graded.reduce((/** @type {number} */ a, /** @type {any} */ s) => a + s.minutes, 0);
  const live = d.sessions.find((/** @type {any} */ s) => s.status === 'live');
  const start = live
    ? `<a class="btn primary" href="#interview">${ICON.play}Resume interview</a>`
    : `<a class="btn primary" href="#interview">${ICON.play}Start interview</a>`;
  const head = `<div class="page-head"><div class="meta"><h1>Overview</h1><p class="small muted"><span class="num">${graded.length}</span> graded ${graded.length === 1 ? 'interview' : 'interviews'} · <span class="num">${hm(minutes)}</span> practised · target ${esc(roleName(r))}</p></div>${start}</div>`;

  const gauges = `<section class="panel" aria-labelledby="h-ready"><div class="panel-head"><h2 id="h-ready">Readiness by role</h2><span class="small muted">100% means every dimension meets that role's bar.${prof.n && prof.n < 3 ? ` Based on ${prof.n} graded ${prof.n === 1 ? 'interview' : 'interviews'}; Ready needs 3.` : ''} Select a role to target it.</span></div>
    <div class="gauges${S.animated ? '' : ' enter'}">${d.roles.map((/** @type {any} */ x) => gauge(x, d.readiness[x.id])).join('')}</div></section>`;
  S.animated = true;

  const rows = d.dimensions.map((/** @type {any} */ x) => {
    const v = prof.dims[x.id].value;
    const target = r.bars[x.id];
    const tone = v == null ? 'ink' : v < 2 ? 'warn' : 'accent';
    return `<div class="dimrow"><span class="label" title="${esc(x.label)}">${esc(x.short)}</span>${bar(v, target, tone)}<span class="num">${f1(v)}</span>${dimStatus(v, target)}</div>`;
  }).join('');
  const profPanel = `<section class="panel" aria-labelledby="h-prof"><div class="panel-head"><h2 id="h-prof">Proficiency by dimension</h2><span class="small muted">Recency-weighted, last 5 interviews</span></div>
    <div class="axis-note" aria-hidden="true"><span><i class="l4"></i>L4 bar 2.0</span><span><i class="l5"></i>L5 bar 3.0</span><span><i class="target"></i>${esc(roleShort(r))} bar</span></div>
    <div class="dims">${rows}</div>${prof.n ? '' : '<p class="small faint">No graded interviews yet. Your first one fills this in.</p>'}</section>`;

  const rec = d.next[r.id];
  const q = question(rec.questionId);
  const gap = rec.dim ? d.readiness[r.id].gaps.find((/** @type {any} */ g) => g.dim === rec.dim) : null;
  const why = rec.reason === 'starter' ? 'A classic first question that touches every dimension.'
    : rec.reason === 'gap' ? `It tests your biggest gap for ${roleShort(r)}: ${dim(rec.dim).label.toLowerCase()} at ${f1(gap?.value)} against a bar of ${gap?.bar}.`
      : `You meet every ${roleShort(r)} bar. This stretches ${dim(rec.dim).label.toLowerCase()}, your thinnest margin.`;
  const next = `<section class="panel next stack" aria-labelledby="h-next"><h2 id="h-next">Next: design ${esc(q.title)}</h2><p class="muted">${esc(catName(q.category))}. ${esc(why)}</p>
    <p class="meta-line">8 probes · about 45 minutes · ${esc(roleShort(r))} interviewer</p>
    <div class="row"><button type="button" class="btn primary" data-act="start" data-id="${esc(q.id)}"${live ? ' disabled title="Finish the running interview first"' : ''}>${ICON.play}Start this one</button><a class="btn" href="#interview">Choose another</a></div></section>`;

  const pts = graded.slice().reverse().map((/** @type {any} */ s) => ({ label: day(s.endedAt), value: s.weighted[r.id], title: `${day(s.endedAt)} · ${s.title} · ${f2(s.weighted[r.id])} · ${s.verdict[r.id]}` }));
  const trendPanel = `<section class="panel" aria-labelledby="h-trend"><div class="panel-head"><h2 id="h-trend">Score over time</h2><span class="small muted">Weighted for ${esc(roleShort(r))}</span></div>
    ${pts.length ? trend(pts, weightedBar(r)) : '<div class="empty"><strong>Your trend starts with your first graded interview.</strong><span>Each one adds a point against the bar for your target role.</span></div>'}</section>`;

  const recent = d.sessions.slice(0, 6);
  const table = recent.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Question</th><th class="right">Score</th><th>${esc(roleShort(r))}</th></tr></thead><tbody>${recent.map((/** @type {any} */ s) => sessionRow(s, r, false)).join('')}</tbody></table></div>`
    : '<div class="empty"><strong>No interviews yet.</strong><span>Start one and it shows up here with its verdict.</span></div>';
  const recentPanel = `<section class="panel" aria-labelledby="h-recent"><div class="panel-head"><h2 id="h-recent">Recent interviews</h2><a class="small" href="#history">All history</a></div>${table}</section>`;

  const last = graded[0];
  const note = last?.topGap ? `<section class="panel note stack" aria-labelledby="h-note"><div class="panel-head"><h2 id="h-note">Coach note</h2><span class="small muted">${esc(last.title)} · ${esc(day(last.endedAt))}</span></div>
    <p>${esc(last.topGap.gap)}</p>${last.topGap.l5Answer ? `<p class="answer">An L5 answer: ${esc(last.topGap.l5Answer)}</p>` : ''}<a class="small" href="#session/${esc(last.id)}">Open the scorecard</a></section>`
    : `<section class="panel note stack" aria-labelledby="h-note"><h2 id="h-note">Coach note</h2><p class="muted">After each graded interview, the most valuable thing to practise next shows here.</p></section>`;

  return `${head}${flash()}${gauges}<div class="cols">${profPanel}<div class="stack">${next}${trendPanel}</div></div><div class="cols">${recentPanel}${note}</div>`;
}

function sessionRow(/** @type {any} */ s, /** @type {any} */ r, /** @type {boolean} */ full) {
  const result = s.status === 'graded' ? `<span class="status tone-${VERDICT_TONE[s.verdict[r.id]]}">${esc(s.verdict[r.id])}</span>`
    : s.status === 'live' ? '<span class="chip warn">Live</span>' : s.status === 'grading' ? '<span class="chip">Grading</span>' : '<span class="chip">Not graded</span>';
  const href = s.status === 'live' ? '#interview' : `#session/${s.id}`;
  const own = role(s.roleId);
  return `<tr class="link" data-href="${esc(href)}"><td class="num faint">${esc(day(s.createdAt))}</td><td><a class="title-cell" href="${esc(href)}">${esc(s.title)}</a>${full ? `<div class="small faint">${esc(catName(s.category))}</div>` : ''}</td>${full ? `<td class="small">${esc(own ? roleShort(own) : s.roleId)}</td><td class="num right">${s.probesUsed}/${s.probes}</td><td class="num right">${s.minutes} m</td>` : ''}<td class="num right">${s.status === 'graded' ? f2(s.weighted[r.id]) : '–'}</td><td>${result}</td></tr>`;
}

function viewSetup() {
  const d = S.data;
  const r = role(S.target);
  const rec = d.next[r.id];
  const pre = S.query.q && question(S.query.q) ? S.query.q : rec.questionId;
  const groups = d.categories.map((/** @type {any} */ c) => `<optgroup label="${esc(c.name)}">${d.questions.filter((/** @type {any} */ q) => q.category === c.id)
    .map((/** @type {any} */ q) => `<option value="${esc(q.id)}"${q.id === pre ? ' selected' : ''}>${esc(q.title)}${q.id === rec.questionId ? ' (recommended)' : ''}${q.attempts ? ` · ${q.attempts}×` : ''}</option>`).join('')}</optgroup>`).join('');
  const roles = d.roles.map((/** @type {any} */ x) => `<option value="${esc(x.id)}"${x.id === S.target ? ' selected' : ''}>${esc(roleName(x))}</option>`).join('');
  const probes = d.probeOptions.map((/** @type {number} */ n) => `<label><input type="radio" name="probes" value="${n}"${n === 8 ? ' checked' : ''}><span><span class="num">${n}</span> probes · about ${minutesFor(n)} min</span></label>`).join('');
  return `<div class="page-head"><div class="meta"><h1>Start an interview</h1><p class="small muted">Claude runs it here, then grades it against the strict rubric.</p></div></div>${flash()}
  <div class="setup"><section class="panel"><form class="form" id="setup">
    <div class="field"><label for="f-q">Question</label><select id="f-q" name="questionId">${groups}</select></div>
    <p class="brief-box" id="f-brief">${esc(question(pre).brief)}</p>
    <div class="field"><label for="f-role">Interview for</label><select id="f-role" name="roleId">${roles}</select></div>
    <fieldset class="field"><legend>Length</legend><div class="seg">${probes}</div></fieldset>
    <div class="field"><label for="f-bg">Your background <span class="faint">(optional)</span></label>
      <textarea id="f-bg" name="background" rows="3" maxlength="2000" aria-describedby="f-bg-hint" placeholder="For example: backend engineer for four years, mostly payment APIs on AWS with Postgres and Kafka. I have not led a design end to end yet.">${esc(d.profile.background)}</textarea>
      <p class="small faint" id="f-bg-hint">It helps the interviewer pitch questions at your level. It stays on this computer, except in your prompts to Claude.</p></div>
    <div><button class="btn primary" type="submit">${ICON.play}Start interview</button></div>
  </form></section>
  <section class="panel stack" aria-labelledby="h-how"><h2 id="h-how">How it works</h2><ol class="steps">
    <li><strong>Claude interviews you</strong> as an engineer from the company you picked, one probe at a time, and drills into vague answers.</li>
    <li><strong>Each probe tests one rubric dimension.</strong> The coverage list shows what has been tested so far.</li>
    <li><strong>After the last probe, Claude grades the transcript.</strong> Every score needs a quote of your exact words. Ideas the interviewer fed you stop at the L4 bar.</li>
    <li><strong>The dashboard updates</strong> your proficiency and your readiness for all eight roles.</li></ol>
    <p class="small muted">Write as you would speak: ask clarifying questions, give numbers, name the trade-offs. Your design notes go to Claude with every answer.</p></section></div>`;
}

function roomSkeleton(/** @type {any} */ s) {
  const q = s.question;
  const r = role(s.roleId) ?? role(S.target); // a role that the bank no longer has
  return `<div class="room" id="room" data-id="${esc(s.id)}">
  <section class="panel chat" aria-labelledby="h-room"><div class="chat-head"><div class="meta"><h1 id="h-room">Design ${esc(q.title)}</h1><p class="small muted">${esc(roleName(r))} · ${esc(catName(q.category))}</p></div><span class="chip num" id="probe-chip"></span></div>
    <div class="log" id="log" aria-live="polite" aria-relevant="additions"></div>
    <form class="composer" id="composer"><label for="answer" class="visually-hidden">Your answer</label>
      <textarea id="answer" placeholder="Think out loud: clarify, estimate, propose, justify."></textarea>
      <div class="row"><span class="hint" id="dict-hint" aria-live="polite">${composerHint()}</span>${SHELL ? `<button type="button" class="btn mic" id="mic" data-act="dictate" title="Dictate your answer (⌘D)">${ICON.mic}Dictate</button>` : ''}<span id="composer-actions"></span></div></form></section>
  <aside class="side"><section class="panel clock" id="clock" aria-label="Clock"></section>
    <section class="panel" aria-labelledby="h-cov"><div class="panel-head"><h2 id="h-cov">Rubric coverage</h2><span class="small muted num" id="probe-count"></span></div><ul class="tracker" id="tracker"></ul></section>
    <section class="panel notes"><div class="panel-head"><h2><label for="notes">Design notes</label></h2><span class="small faint" id="notes-state">Claude reads these</span></div><textarea id="notes" placeholder="Requirements, estimates, APIs, schema, components…"></textarea></section>
    <section class="panel stack"><h2>The brief</h2><p class="small muted">${esc(q.brief)}</p></section>
    <div id="room-actions"></div></aside></div>`;
}

function msgHtml(/** @type {any} */ m, /** @type {number} */ probeNo) {
  const me = m.role === 'candidate';
  const tag = !me && m.tag?.kind === 'probe' ? `<span class="chip accent">Probe ${probeNo}${m.tag.dim ? ` · ${esc(dim(m.tag.dim)?.short ?? m.tag.dim)}` : ''}</span>`
    : !me && m.tag?.kind === 'wrap' ? '<span class="chip">Closing</span>' : '';
  return `<div class="msg${me ? ' me' : ''}"><div class="who"><span>${me ? 'You' : 'Interviewer'}</span><span class="num faint">${mmss(m.at)}</span>${tag}</div><div class="body">${me ? esc(m.text) : md(m.text)}</div></div>`;
}

function updateRoom() {
  const s = S.live;
  if (!s || !$('#room')) return;
  let n = 0;
  const probed = new Set();
  let current = null;
  const html = s.transcript.map((/** @type {any} */ m) => {
    if (m.role === 'interviewer' && m.tag?.kind === 'probe') {
      n++;
      if (m.tag.dim) probed.add(m.tag.dim);
      current = m.tag.dim;
    }
    return msgHtml(m, n);
  }).join('');
  const pending = S.busy ? `<div class="msg"><div class="who"><span>Interviewer</span></div><div class="body caret" id="pending-body">${md(S.pending)}</div></div>` : '';
  const err = S.error ? `<p class="error-line" role="alert">${esc(S.error)}</p>` : '';
  const log = $('#log');
  const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.innerHTML = html + pending + err;
  if (stick) log.scrollTop = log.scrollHeight;
  $('#probe-chip').textContent = `Probe ${Math.min(n, s.probes)} of ${s.probes}`;
  $('#probe-count').textContent = `${probed.size} of ${S.data.dimensions.length}`;
  $('#tracker').innerHTML = S.data.dimensions.map((/** @type {any} */ x) => {
    const cls = x.id === current ? 'now' : probed.has(x.id) ? 'done' : '';
    return `<li class="${cls}">${x.id === current ? ICON.dot : probed.has(x.id) ? ICON.check : ICON.ring}<span>${esc(x.label)}</span>${x.id === current ? '<span class="visually-hidden">, probing now</span>' : probed.has(x.id) ? '<span class="visually-hidden">, tested</span>' : ''}</li>`;
  }).join('');
  const lastIsMine = s.transcript.at(-1)?.role === 'candidate';
  $('#composer-actions').innerHTML = S.busy
    ? `<button type="button" class="btn" data-act="stop">${ICON.stop}Stop</button>`
    : `${lastIsMine ? `<button type="button" class="btn" data-act="retry">${ICON.retry}Ask again</button>` : ''}<button type="submit" class="btn primary" form="composer">${ICON.arrow}Send</button>`;
  $('#room-actions').innerHTML = S.confirm === 'end'
    ? `<div class="confirm" role="group" aria-label="Confirm end"><span>End and grade now? Dimensions not tested yet score 0.</span><button type="button" class="btn primary" data-act="end-yes">End and grade</button><button type="button" class="btn" data-act="confirm-no">Keep going</button></div>`
    : S.confirm === 'discard'
      ? `<div class="confirm" role="group" aria-label="Confirm discard"><span>Discard this interview without grading? It moves to the trash folder.</span><button type="button" class="btn danger" data-act="discard-yes">Discard</button><button type="button" class="btn" data-act="confirm-no">Keep it</button></div>`
      : `<div class="stack"><button type="button" class="btn" data-act="end-ask"${S.busy ? ' disabled' : ''}>End and grade</button><a class="btn" href="#overview">Leave for now</a><button type="button" class="btn danger" data-act="discard-ask"${S.busy ? ' disabled' : ''}>Discard</button></div>`;
  tick();
}

function tick() {
  const s = S.live;
  const el = $('#clock');
  if (!s || !el) return;
  const planned = minutesFor(s.probes) * 60;
  const sec = secondsSince(s.startedAt);
  const left = planned - sec;
  const phase = PHASES.findIndex(([, end]) => sec / planned < /** @type {number} */ (end));
  el.innerHTML = `<div class="panel-head"><h2>${left >= 0 ? 'Time left' : 'Over time'}</h2><span class="small muted num">${mmss(sec)} elapsed</span></div>
    <div class="time${left < 0 ? ' over' : ''}">${left < 0 ? '+' : ''}${mmss(left)}</div>
    <ol class="phases">${PHASES.map(([name, end], i) => `<li class="${i === phase ? 'now' : i < phase || phase < 0 ? 'done' : ''}"><span class="num">${String(Math.round((i ? /** @type {number} */ (PHASES[i - 1][1]) : 0) * planned / 60)).padStart(2, '0')}–${Math.round(/** @type {number} */ (end) * planned / 60)}</span><span>${esc(name)}</span></li>`).join('')}</ol>`;
}

function viewReport() {
  const s = S.report;
  const q = s.question;
  const r = role(s.roleId) ?? role(S.target); // a role that the bank no longer has
  const head = `<div class="page-head"><div class="meta"><h1>Design ${esc(q.title)}</h1><p class="small muted">${esc(day(s.createdAt))} · ${esc(roleName(r))} · <span class="num">${s.summary.minutes}</span> min · <span class="num">${s.summary.probesUsed}/${s.probes}</span> probes</p></div><a class="btn" href="#history">All history</a></div>`;
  const del = S.confirm === `delete-${s.id}`
    ? `<div class="confirm" role="group" aria-label="Confirm delete"><span>Delete this interview? It moves to the trash folder and your scores are recalculated without it.</span><button type="button" class="btn danger" data-act="delete-yes" data-id="${esc(s.id)}">Delete</button><button type="button" class="btn" data-act="confirm-no">Keep it</button></div>`
    : `<div><button type="button" class="btn danger" data-act="delete-ask" data-id="${esc(s.id)}">Delete interview</button></div>`;
  const transcript = `<section class="panel"><details><summary>Transcript and design notes</summary><div class="transcript">${(() => {
    let n = 0;
    return s.transcript.map((/** @type {any} */ m) => msgHtml(m, m.tag?.kind === 'probe' ? ++n : n)).join('');
  })()}</div>${s.notes ? `<pre class="notes-view">${esc(s.notes)}</pre>` : ''}</details></section>`;

  if (s.status === 'live') return `${head}<section class="panel"><div class="empty"><strong>This interview is still running.</strong><a class="btn primary" href="#interview">Resume it</a></div></section>`;
  if (s.status === 'grading') return `${head}<section class="panel"><div class="empty" role="status"><strong class="with-icon"><span class="spinner" aria-hidden="true"></span>Claude is grading the transcript against the rubric.</strong><span>It reads every answer and checks each score against your exact words. This usually takes one to two minutes.</span></div></section>${transcript}`;
  if (s.status !== 'graded') return `${head}<section class="panel"><div class="empty"><strong>This interview is not graded.</strong><span class="error-line">${esc(s.gradeError || '')}</span><button type="button" class="btn primary" data-act="grade" data-id="${esc(s.id)}">${ICON.retry}Grade it again</button></div></section>${transcript}${del}`;

  const g = s.grade;
  const sum = s.summary;
  const v = sum.verdict[r.id];
  const verdictPanel = `<section class="panel" aria-labelledby="h-verdict"><div class="verdict"><h2 id="h-verdict" class="big tone-${VERDICT_TONE[v]}">${esc(v)}</h2><span class="score">${f2(sum.weighted[r.id])}</span><span class="muted">weighted for ${esc(roleShort(r))}, bar ${f1(weightedBar(r))}</span></div>
    <div class="verdicts" aria-label="Verdict for every role">${S.data.roles.map((/** @type {any} */ x) => `<span class="chip${VERDICT_TONE[sum.verdict[x.id]] === 'accent' ? ' accent' : VERDICT_TONE[sum.verdict[x.id]] === 'warn' ? ' warn' : ''}">${esc(roleShort(x))} · ${esc(sum.verdict[x.id])}</span>`).join('')}</div>
    ${g.levelReadout ? `<p class="readout">${esc(g.levelReadout)}</p>` : ''}${g.summary ? `<p class="readout">${esc(g.summary)}</p>` : ''}</section>`;

  const cards = S.data.dimensions.map((/** @type {any} */ x) => {
    const c = g.dims[x.id];
    const flags = [
      c.capped === 'evidence' ? `<span class="chip warn">No verified quote, scored 0 (grader gave ${c.graderScore})</span>` : '',
      c.capped === 'prompted' ? `<span class="chip warn">Prompted, capped at L4 (grader gave ${c.graderScore})</span>` : '',
      c.prompted && c.capped !== 'prompted' ? '<span class="chip">Prompted</span>' : '',
    ].join('');
    const quotes = c.evidence.length ? `<ul class="quotes">${c.evidence.map((/** @type {any} */ e) => `<li class="${e.verified ? 'ok' : 'bad'}">${e.verified ? ICON.check : ICON.cross}<span>“${esc(e.quote)}”${e.verified ? '' : '<span class="visually-hidden"> (not found in your words, dropped)</span>'}</span></li>`).join('')}</ul>` : '';
    const level = S.data.scale[c.score];
    return `<article class="scorecard"><div class="row"><h3>${esc(x.label)}</h3>${pips(c.score)}</div><div class="row"><span class="small"><span class="num">${c.score}</span>/4 · ${esc(level.name)}</span><span class="small faint">bar ${r.bars[x.id]}</span></div>${flags ? `<div class="row">${flags}</div>` : ''}
      <p class="small">${esc(c.justification)}</p>${quotes}${c.missed ? `<p class="missed"><strong>An L5 answer adds:</strong> ${esc(c.missed)}</p>` : ''}</article>`;
  }).join('');
  const scorePanel = `<section class="panel" aria-labelledby="h-scores"><div class="panel-head"><h2 id="h-scores">Scores and evidence</h2><span class="small muted">A crossed-out quote was not found in your words, so it earned nothing.</span></div><div class="scorecards">${cards}</div></section>`;

  const gaps = g.gaps.length ? g.gaps.map((/** @type {any} */ x) => `<div class="gap"><span class="chip warn self-start">${esc(dim(x.dimension)?.label ?? x.dimension)}</span><strong>${esc(x.gap)}</strong><dl>${x.l5Answer ? `<dt>L5 answer</dt><dd>${esc(x.l5Answer)}</dd>` : ''}${x.drill ? `<dt>Drill</dt><dd>${esc(x.drill)}</dd>` : ''}</dl></div>`).join('') : '<p class="muted">No gaps recorded.</p>';
  const lower = `<div class="cols"><section class="panel" aria-labelledby="h-gaps"><div class="panel-head"><h2 id="h-gaps">Gaps to close</h2></div><div class="gaps">${gaps}</div></section>
    <div class="stack"><section class="panel stack" aria-labelledby="h-str"><h2 id="h-str">Strengths</h2>${g.strengths.length ? `<ul class="plain">${g.strengths.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">None recorded.</p>'}</section>
    <section class="panel stack" aria-labelledby="h-crux"><h2 id="h-crux">What a strong answer covers</h2><p class="muted">${esc(q.crux)}</p><button type="button" class="btn self-start" data-act="start" data-id="${esc(q.id)}" data-role="${esc(s.roleId)}">${ICON.play}Practise it again</button></section></div></div>`;
  return `${head}${flash()}${verdictPanel}${scorePanel}${lower}${transcript}${del}`;
}

function viewHistory() {
  const d = S.data;
  const r = role(S.target);
  if (!d.sessions.length) return `<div class="page-head"><div class="meta"><h1>History</h1></div></div><section class="panel"><div class="empty"><strong>No interviews yet.</strong><span>Each interview you finish is listed here with its scorecard.</span><a class="btn primary" href="#interview">${ICON.play}Start your first interview</a></div></section>`;
  return `<div class="page-head"><div class="meta"><h1>History</h1><p class="small muted">${d.sessions.length} ${d.sessions.length === 1 ? 'interview' : 'interviews'}. Score and verdict are for your target, ${esc(roleName(r))}.</p></div></div>
  <section class="panel"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Question</th><th>Asked as</th><th class="right">Probes</th><th class="right">Length</th><th class="right">Score</th><th>Verdict</th></tr></thead><tbody>${d.sessions.map((/** @type {any} */ s) => sessionRow(s, r, true)).join('')}</tbody></table></div></section>`;
}

function viewQuestions() {
  const d = S.data;
  const r = role(S.target);
  const best = (/** @type {string} */ id) => {
    const xs = d.sessions.filter((/** @type {any} */ s) => s.questionId === id && s.status === 'graded');
    return xs.length ? xs.reduce((/** @type {any} */ a, /** @type {any} */ s) => (s.weighted[r.id] > a.weighted[r.id] ? s : a)) : null;
  };
  const groups = d.categories.map((/** @type {any} */ c) => {
    const qs = d.questions.filter((/** @type {any} */ q) => q.category === c.id);
    return `<div class="qgroup"><h2>${esc(c.name)}</h2>${qs.map((/** @type {any} */ q) => {
      const b = best(q.id);
      return `<div class="qrow"><div><div class="t">Design ${esc(q.title)}</div><div class="b">${esc(q.brief)}</div></div>
        <div class="tags">${q.stress.map((/** @type {string} */ x) => `<span class="chip accent">${esc(dim(x).short)}</span>`).join('')}${q.companies.map((/** @type {string} */ x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
        <div class="stats small">${q.attempts ? `<span class="num">${q.attempts}</span>× · best <span class="num">${b ? f2(b.weighted[r.id]) : '–'}</span>` : '<span class="faint">Not tried</span>'}</div>
        <a class="btn" href="#interview?q=${esc(q.id)}">${ICON.play}Practise</a></div>`;
    }).join('')}</div>`;
  }).join('');
  return `<div class="page-head"><div class="meta"><h1>Questions</h1><p class="small muted">${d.questions.length} questions in ${d.categories.length} categories. Blue tags are the dimensions each one tests hardest; grey tags are companies that ask it.</p></div></div><section class="panel stack">${groups}</section>`;
}

function viewRubric() {
  const d = S.data;
  const scale = `<ul class="plain">${d.scale.map((/** @type {any} */ x) => `<li><span class="num">${x.level}</span> <strong>${esc(x.name)}</strong>: ${esc(x.meaning)}</li>`).join('')}</ul>`;
  const anchors = `<div class="table-wrap"><table class="anchors"><thead><tr><th>Dimension</th>${[1, 2, 3, 4].map((l) => `<th>${l} · ${esc(d.scale[l].name)}</th>`).join('')}</tr></thead><tbody>${d.dimensions.map((/** @type {any} */ x) => `<tr><td>${esc(x.label)}</td>${[1, 2, 3, 4].map((l) => `<td>${esc(x.anchors[l])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const bars = `<div class="table-wrap"><table class="bars-table"><thead><tr><th>Role</th>${d.dimensions.map((/** @type {any} */ x) => `<th class="right">${esc(x.short)}</th>`).join('')}<th class="right">Weighted</th></tr></thead><tbody>${d.roles.map((/** @type {any} */ r) => `<tr><td>${esc(roleName(r))}</td>${d.dimensions.map((/** @type {any} */ x) => `<td class="right">${r.bars[x.id]}<span class="faint">×${r.weights[x.id]}</span></td>`).join('')}<td class="right">${f1(weightedBar(r))}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="page-head"><div class="meta"><h1>Rubric</h1><p class="small muted">The strict marking scheme. Every interview is graded against it, and the code enforces the evidence rules after Claude answers.</p></div></div>
  <section class="panel stack"><h2>Scale</h2>${scale}</section>
  <section class="panel stack"><h2>Level anchors</h2>${anchors}</section>
  <section class="panel stack"><h2>Grading rules</h2><ol class="rules">${d.rules.map((/** @type {string} */ x) => `<li>${esc(x)}</li>`).join('')}</ol></section>
  <section class="panel stack"><h2>Role bars and weights</h2><p class="small muted">Each cell is the minimum level, then the weight from 1 to 3. The scale uses Google numbering: 2 is the mid-level bar and 3 is the senior bar. Company labels do not line up, so Amazon L5 sits on the same rung as Google L4.</p>${bars}</section>
  <section class="panel stack"><h2>How each loop runs</h2><div class="table-wrap"><table class="anchors"><thead><tr><th>Role</th><th>Design rounds</th><th>What weighs most</th><th>Same rung as</th></tr></thead><tbody>${d.roles.map((/** @type {any} */ r) => `<tr><td>${esc(roleName(r))}</td><td>${esc(r.rounds)}</td><td>${esc(r.focus)}</td><td>${esc(r.equiv.replace(/^Same rung as /, '').replace(/\.$/, ''))}</td></tr>`).join('')}</tbody></table></div><p class="small faint">Sources and confidence: docs/company-bars.md in the repository.</p></section>
  <section class="panel stack"><h2>How the numbers work</h2><ul class="plain">
    <li><strong>Verdict.</strong> Hire needs every bar met; strong hire also beats half of them. Lean hire allows one point short, but not on a weight-3 dimension. Lean no hire allows up to three points short in total, none more than one. Anything else is no hire.</li>
    <li><strong>Proficiency.</strong> The recency-weighted mean of your last five counted interviews (weights 1, 0.8, 0.64…). An interview counts once it is graded and has at least three answers.</li>
    <li><strong>Readiness.</strong> Half is the weighted share of the role's bars you meet, half is your weakest dimension, because a loop fails on its worst signal. Ready also needs three counted interviews.</li></ul></section>`;
}

// ---------- Rendering and routing

function setNav() {
  for (const a of document.querySelectorAll('#nav a')) {
    const v = /** @type {HTMLElement} */ (a).dataset.view;
    const on = v === S.view || (v === 'history' && S.view === 'session');
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const live = S.data?.sessions.some((/** @type {any} */ s) => s.status === 'live');
  $('#nav .live-dot').hidden = !live;
}

async function render() {
  clearInterval(S.clock);
  clearTimeout(S.poll);
  if (!S.data || S.locked) return;
  setNav();
  if (S.view === 'interview') {
    const live = S.data.sessions.find((/** @type {any} */ s) => s.status === 'live');
    if (!live) {
      S.live = null;
      app.innerHTML = viewSetup();
      return;
    }
    if (S.live?.id !== live.id) S.live = await api(`/api/sessions/${live.id}`);
    if ($('#room')?.dataset.id !== S.live.id) {
      app.innerHTML = roomSkeleton(S.live);
      $('#notes').value = S.live.notes || '';
      try {
        $('#answer').value = sessionStorage.getItem(`sdc.draft.${S.live.id}`) || '';
      } catch {}
    }
    updateRoom();
    paintDictation();
    S.clock = window.setInterval(tick, 1000);
    return;
  }
  if (S.view === 'session') {
    if (S.report?.id !== S.arg) {
      app.innerHTML = '<p class="muted">Loading…</p>';
      try {
        S.report = await api(`/api/sessions/${encodeURIComponent(S.arg)}`);
      } catch (e) {
        app.innerHTML = `<section class="panel"><div class="empty"><strong>That interview is not here.</strong><span>${esc(/** @type {Error} */ (e).message)}</span><a class="btn" href="#history">Back to history</a></div></section>`;
        return;
      }
    }
    app.innerHTML = viewReport();
    if (S.report.status === 'grading') S.poll = window.setTimeout(pollReport, 2500);
    return;
  }
  const views = /** @type {Record<string, () => string>} */ ({ overview: viewOverview, history: viewHistory, questions: viewQuestions, rubric: viewRubric });
  app.innerHTML = (Object.hasOwn(views, S.view) ? views[S.view] : viewOverview)();
}

async function pollReport() {
  try {
    const s = await api(`/api/sessions/${S.report.id}`);
    if (s.status !== 'grading') {
      S.report = s;
      await refresh();
    }
  } catch {}
  if (S.view === 'session') render();
}

function route() {
  const [path, qs] = (location.hash.slice(1) || 'overview').split('?');
  const [view, arg = ''] = path.split('/');
  Object.assign(S, { view, arg, query: Object.fromEntries(new URLSearchParams(qs ?? '')), confirm: null, flash: '' });
  if (LIVE.includes(D.state)) void stopDictation(); // the words so far stay in the draft
  else Object.assign(D, { state: 'off', review: false });
  render().then(() => {
    if (view !== 'interview') app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  });
}

// ---------- Actions

/** Without a background, the server uses the saved one. */
async function start(/** @type {string} */ questionId, /** @type {string} */ roleId, /** @type {number} */ probes, /** @type {string | undefined} */ background) {
  try {
    S.live = await api('/api/sessions', { questionId, roleId, probes, background });
    await refresh();
    if (location.hash === '#interview') render();
    else location.hash = '#interview';
  } catch (e) {
    S.flash = `Could not start the interview: ${/** @type {Error} */ (e).message}`;
    render();
  }
}

async function send(retry = false) {
  const s = S.live;
  if (!s || S.busy) return;
  if (!retry) await stopDictation();
  const box = $('#answer');
  const text = retry ? '' : box.value.trim();
  if (!retry && !text) return box.focus();
  if (!retry) {
    s.transcript.push({ role: 'candidate', text, at: secondsSince(s.startedAt) });
    box.value = '';
    dropDraft(s.id);
    Object.assign(D, { state: 'off', review: false });
    paintDictation();
  }
  Object.assign(S, { busy: true, pending: '', error: '', ctl: new AbortController() });
  updateRoom();
  try {
    await stream(`/api/sessions/${s.id}/turn`, { text, notes: $('#notes').value }, (ev, data) => {
      if (ev === 'delta') {
        S.pending += data.text;
        const b = $('#pending-body');
        if (b) b.innerHTML = md(S.pending);
        const log = $('#log');
        if (log) log.scrollTop = log.scrollHeight;
      } else if (ev === 'done') {
        s.transcript.push(data.message);
        s.status = data.status;
      } else if (ev === 'error') S.error = `The interviewer's reply did not come through: ${data.error}`;
    }, /** @type {AbortSignal} */ (S.ctl?.signal));
  } catch (e) {
    if (/** @type {Error} */ (e).name !== 'AbortError') S.error = /** @type {Error} */ (e).message;
  }
  Object.assign(S, { busy: false, pending: '', ctl: null });
  if (s.status === 'grading') {
    dropDraft(s.id);
    await refresh();
    location.hash = `#session/${s.id}`;
    return;
  }
  updateRoom();
  $('#answer')?.focus();
}

async function end() {
  const s = S.live;
  if (!s) return;
  try {
    await api(`/api/sessions/${s.id}/end`, {});
    dropDraft(s.id);
    await refresh();
    S.report = null;
    location.hash = `#session/${s.id}`;
  } catch (e) {
    S.error = /** @type {Error} */ (e).message;
    S.confirm = null;
    updateRoom();
  }
}

function saveNotesSoon() {
  clearTimeout(S.notesTimer);
  $('#notes-state').textContent = 'Editing…';
  S.notesTimer = window.setTimeout(async () => {
    if (!S.live) return;
    try {
      await api(`/api/sessions/${S.live.id}/notes`, { notes: $('#notes')?.value ?? '' });
      S.live.notes = $('#notes')?.value ?? '';
      const st = $('#notes-state');
      if (st) st.textContent = 'Saved · Claude reads these';
    } catch (e) {
      const st = $('#notes-state');
      if (st) st.textContent = `Not saved: ${/** @type {Error} */ (e).message}`;
    }
  }, 1200);
}

// ---------- Claude login

/** The Mac app's bridge to its window. In a browser it is missing, and a terminal does the sign-in. */
const SHELL = /** @type {any} */ (window).webkit?.messageHandlers?.sdc;
let signingIn = false;

/** Shows the Claude login in the rail. @returns {Promise<boolean>} true when interviews can run and the login does not end soon */
async function showAuth() {
  /** @type {any} */
  const a = await api('/api/auth').catch((e) => ({ error: e.message }));
  if (S.locked) return false;
  const days = a.expiresAt ? Math.ceil((Date.parse(a.expiresAt) - Date.now()) / 86_400_000) : Infinity;
  const ok = a.loggedIn === true && days > 3;
  const plan = a.plan ? `, ${a.plan[0].toUpperCase()}${a.plan.slice(1)} plan` : '';
  const text = a.error ? `Cannot read the Claude login: ${a.error}`
    : !a.loggedIn ? 'Not signed in to Claude. Interviews need it.'
    : !ok ? `Your Claude login ends ${days <= 1 ? 'within a day' : `in ${days} days`}.`
    : `Signed in to Claude${plan}.`;
  let action = '';
  if (!ok && !a.error) {
    const terms = '<span class="faint">Use is billed or limited on your own Anthropic account, under Anthropic\'s terms for that account.</span>';
    action = !SHELL ? `<span>In a terminal, run <code>claude auth login</code> to sign in with a Claude plan, or <code>claude auth login --console</code> to use an API key.</span>${terms}`
      : signingIn ? '<button class="btn" disabled>Waiting for sign-in…</button><span>Finish in Terminal and your browser.</span>'
      : `<button class="btn" data-act="login">Sign in with a Claude plan</button><button class="btn" data-act="login-console">Use an API key (Console)</button>${terms}`;
  }
  const el = $('#auth');
  el.className = `rail-note auth${ok ? '' : ' tone-warn'}`;
  el.innerHTML = `<span>${esc(text)}</span>${action}`;
  return ok;
}

/** Asks the Mac app to run Anthropic's sign-in, then checks every 3 s for up to 10 minutes. @param {'login' | 'login-console'} kind */
async function signIn(kind) {
  SHELL.postMessage(kind);
  signingIn = true;
  for (let i = 0; i < 200 && !S.locked && !(await showAuth()); i++) await new Promise((r) => setTimeout(r, 3000));
  signingIn = false;
  await showAuth();
}

// ---------- Dictation, in the Mac app

/** The states in which the microphone is on or about to be. */
const LIVE = ['starting', 'downloading', 'listening', 'stopping'];
/** The spoken words go between the answer text before and after the caret. */
const D = {
  state: 'off', before: '', after: '', spoken: '', error: '', settings: false, review: false,
  /** @type {Promise<void>} */ stopped: Promise.resolve(), /** @type {null | (() => void)} */ idle: null,
};
const METER = '<span class="meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';

function composerHint() {
  const sendKey = `<kbd>${MAC ? '⌘' : 'Ctrl'}</kbd> <kbd>Enter</kbd> to send`;
  if (!SHELL) return sendKey;
  return D.state === 'starting' ? 'Starting the microphone…'
    : D.state === 'downloading' ? 'Downloading the speech model. This happens once.'
    : D.state === 'listening' ? `${METER}Listening. Select Stop or press <kbd>⌘</kbd> <kbd>D</kbd> when you finish.`
    : D.state === 'stopping' ? 'Writing down your last words…'
    : D.state === 'error' ? `${esc(D.error)}${D.settings ? ' <button type="button" class="linkish" data-act="mic-settings">Open System Settings</button>' : ''}`
    : D.review ? 'Read it over, then send. Claude grades these exact words.'
    : `${sendKey} · <kbd>⌘</kbd> <kbd>D</kbd> to dictate`;
}

function paintDictation() {
  const box = $('#answer');
  const hint = $('#dict-hint');
  const mic = $('#mic');
  if (!box || !hint) return;
  const on = LIVE.includes(D.state);
  box.readOnly = on;
  box.classList.toggle('dictating', on);
  hint.classList.toggle('tone-warn', D.state === 'error');
  hint.innerHTML = composerHint();
  if (mic) {
    mic.toggleAttribute('data-on', on);
    mic.disabled = D.state === 'stopping';
    mic.innerHTML = on ? `${ICON.stop}Stop` : `${ICON.mic}Dictate`;
  }
}

function paintSpoken() {
  const box = $('#answer');
  if (!box) return;
  box.value = joinSpoken(D.before, fixTerms(D.spoken), D.after);
  if (!D.after) box.scrollTop = box.scrollHeight;
}

function startDictation() {
  const box = $('#answer');
  if (!SHELL || !box || LIVE.includes(D.state)) return;
  Object.assign(D, { state: 'starting', before: box.value.slice(0, box.selectionStart), after: box.value.slice(box.selectionEnd), spoken: '', error: '', settings: false, review: false });
  SHELL.postMessage('dictate-start');
  paintDictation();
}

/** @returns {Promise<void>} resolves when the last words are in the answer box */
function stopDictation() {
  if (!LIVE.includes(D.state)) return Promise.resolve();
  if (D.state !== 'stopping') {
    D.state = 'stopping';
    D.stopped = new Promise((resolve) => { D.idle = () => resolve(); });
    SHELL.postMessage('dictate-stop');
    paintDictation();
    // The app answers within a second or two. If it does not, keep the words so far.
    setTimeout(() => D.state === 'stopping' && finishDictation(), 5000);
  }
  return D.stopped;
}

/** Puts the final words in the box and the draft, with the caret after them. */
function finishDictation() {
  const spoken = fixTerms(D.spoken);
  const text = joinSpoken(D.before, spoken, D.after);
  const caret = joinSpoken(D.before, spoken, '').length;
  Object.assign(D, { state: 'off', review: spoken.trim() !== '' });
  if (S.live) {
    try {
      sessionStorage.setItem(`sdc.draft.${S.live.id}`, text);
    } catch {}
  }
  const box = $('#answer');
  if (box) {
    box.value = text;
    paintDictation();
    box.focus();
    box.setSelectionRange(caret, caret);
  }
  D.idle?.();
  D.idle = null;
}

/** Events from Dictation.swift: a state, the words so far, or the microphone level. */
/** @type {any} */ (window).sdcDictation = (/** @type {any} */ e) => {
  if (typeof e.level === 'number') {
    const bars = document.querySelectorAll('#dict-hint .meter i');
    bars.forEach((b, i) => b.classList.toggle('on', i < Math.round(e.level * bars.length)));
    return;
  }
  if (!LIVE.includes(D.state)) return;
  if (typeof e.text === 'string') {
    D.spoken = e.text + (e.volatile ?? '');
    paintSpoken();
  }
  if (e.state === 'idle') finishDictation();
  else if (e.state === 'error') {
    finishDictation();
    Object.assign(D, { state: 'error', error: String(e.error), settings: e.settings === true, review: false });
    paintDictation();
  } else if (e.state && D.state !== 'stopping') {
    D.state = e.state;
    paintDictation();
  }
};

document.addEventListener('click', async (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  const row = t.closest('tr[data-href]');
  if (row && !t.closest('a')) location.hash = /** @type {string} */ (/** @type {HTMLElement} */ (row).dataset.href);
  const el = /** @type {HTMLElement | null} */ (t.closest('[data-act]'));
  if (!el) return;
  const { act, id = '' } = el.dataset;
  if (act === 'target') setTarget(id);
  else if (act === 'start') start(id, el.dataset.role || S.target, 8);
  else if (act === 'stop') S.ctl?.abort();
  else if (act === 'retry') send(true);
  else if (act === 'login' || act === 'login-console') void signIn(act);
  else if (act === 'dictate') LIVE.includes(D.state) ? void stopDictation() : startDictation();
  else if (act === 'mic-settings') SHELL?.postMessage('mic-settings');
  else if (act === 'end-ask') {
    S.confirm = 'end';
    updateRoom();
  } else if (act === 'end-yes') end();
  else if (act === 'discard-ask') {
    S.confirm = 'discard';
    updateRoom();
  } else if (act === 'discard-yes') {
    try {
      await api(`/api/sessions/${S.live.id}/delete`, {});
      dropDraft(S.live.id);
      S.live = null;
      await refresh();
      location.hash = '#overview';
    } catch (err) {
      S.error = /** @type {Error} */ (err).message;
      S.confirm = null;
      updateRoom();
    }
  } else if (act === 'confirm-no') {
    S.confirm = null;
    S.view === 'interview' ? updateRoom() : render();
  } else if (act === 'grade') {
    try {
      S.report = await api(`/api/sessions/${id}/grade`, {});
    } catch (err) {
      S.flash = /** @type {Error} */ (err).message;
    }
    render();
  } else if (act === 'delete-ask') {
    S.confirm = `delete-${id}`;
    render();
  } else if (act === 'delete-yes') {
    try {
      await api(`/api/sessions/${id}/delete`, {});
      dropDraft(id);
      S.report = null;
      await refresh();
      location.hash = '#history';
    } catch (err) {
      S.flash = /** @type {Error} */ (err).message;
      render();
    }
  }
});

document.addEventListener('submit', (e) => {
  const form = /** @type {HTMLFormElement} */ (e.target);
  e.preventDefault();
  if (form.id === 'composer') send();
  if (form.id === 'setup') {
    const f = new FormData(form);
    // .value, not FormData: FormData can turn each line break into \r\n and push the text past the limit.
    start(String(f.get('questionId')), String(f.get('roleId')), Number(f.get('probes')), $('#f-bg').value);
  }
});

document.addEventListener('keydown', (e) => {
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.id === 'answer' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    send();
  } else if (SHELL && $('#answer') && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    LIVE.includes(D.state) ? void stopDictation() : startDictation();
  } else if (e.key === 'Escape' && LIVE.includes(D.state)) {
    e.preventDefault();
    void stopDictation();
  }
});

document.addEventListener('input', (e) => {
  const t = /** @type {HTMLTextAreaElement} */ (e.target);
  if (t.id === 'notes') saveNotesSoon();
  if (t.id === 'answer' && S.live) {
    try {
      sessionStorage.setItem(`sdc.draft.${S.live.id}`, t.value);
    } catch {}
  }
  if (t.id === 'answer' && (D.review || D.state === 'error')) {
    Object.assign(D, { state: 'off', review: false });
    paintDictation();
  }
});

document.addEventListener('change', (e) => {
  const t = /** @type {HTMLSelectElement} */ (e.target);
  if (t.id === 'f-q') $('#f-brief').textContent = question(t.value)?.brief ?? '';
  if (t.id === 'target') setTarget(t.value);
});

window.addEventListener('hashchange', route);

(async () => {
  if (!TOKEN) return void locked();
  void watchServer();
  try {
    await refresh();
  } catch (e) {
    if (S.locked) return;
    app.innerHTML = `<section class="panel"><div class="empty"><strong>The coach server is not answering.</strong><span>${esc(/** @type {Error} */ (e).message)}. Start it with node server.mjs, then reload.</span></div></section>`;
    return;
  }
  $('#target').innerHTML = S.data.roles.map((/** @type {any} */ r) => `<option value="${esc(r.id)}"${r.id === S.target ? ' selected' : ''}>${esc(roleShort(r))}</option>`).join('');
  $('#models').textContent = `Interviewer ${S.data.models.interviewer.model} · grader ${S.data.models.grader.model}`;
  void showAuth();
  route();
})();
