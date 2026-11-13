import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, ask, authStatus } from './lib/claude.mjs';
import {
  GRADE_SCHEMA, PROBE_OPTIONS, candidateText, graderSystem, graderTurn, interviewerSystem, interviewerTurn,
  minutesFor, mustWrap, opener, probeState, tagFilter, tagOf,
} from './lib/prompts.mjs';
import { CATEGORIES, QUESTION, QUESTIONS } from './lib/questions.mjs';
import { DIMENSIONS, ROLE, ROLES, RULES, SCALE } from './lib/rubric.mjs';
import { proficiency, readiness, recommend, scoresOf, strictGrade, verdict, weighted } from './lib/scoring.mjs';
import { BACKGROUND_LIMIT, ID_RE, createStore } from './lib/store.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BODY_LIMIT = 256 * 1024;
const TEXT_LIMIT = 20_000;
const NOTES_LIMIT = 40_000;
const STATIC = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/dictation.mjs', ['dictation.mjs', 'text/javascript; charset=utf-8']],
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
]);
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

const env = process.env;
const config = {
  // 0 is a free port at each start, so a page or link from an earlier start never reaches this one.
  port: Number(env.SDC_PORT ?? 0),
  home: env.SDC_HOME || join(homedir(), '.system-design-coach'),
};

class HttpError extends Error {
  constructor(/** @type {number} */ status, /** @type {string} */ msg) {
    super(msg);
    this.status = status;
  }
}

function json(/** @type {import('node:http').ServerResponse} */ res, /** @type {number} */ status, /** @type {unknown} */ body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** @returns {Promise<Record<string, unknown>>} */
async function readBody(/** @type {import('node:http').IncomingMessage} */ req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new HttpError(413, 'body is over 256 KB');
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'body is not JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'body must be a JSON object');
  return body;
}

const optText = (/** @type {unknown} */ v, /** @type {string} */ name, /** @type {number} */ max) => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v.length > max) throw new HttpError(400, `${name} must be text of at most ${max} characters`);
  return v;
};

const iso = () => new Date().toISOString();
const secondsSince = (/** @type {string} */ t) => Math.max(0, Math.round((Date.now() - Date.parse(t)) / 1000));
const candidateTurns = (/** @type {any} */ s) => s.transcript.filter((/** @type {any} */ m) => m.role === 'candidate').length;
/** A graded interview counts toward proficiency only with three or more answers; a false start does not. */
const counted = (/** @type {any} */ s) => s.status === 'graded' && candidateTurns(s) >= 3;
/** A saved session may name a question that the bank no longer has. Then its id stands in for the title. */
const questionOf = (/** @type {string} */ id) => (Object.hasOwn(QUESTION, id) ? QUESTION[id] : { id, title: id, brief: '', crux: '' });

async function main() {
  const store = await createStore(config.home);
  for (const s of store.list()) {
    if (s.status === 'grading') await store.put({ ...s, status: 'grade_failed', gradeError: 'The server stopped while grading. Grade it again.' });
  }
  const token = randomBytes(32).toString('hex');
  /** @type {Set<string>} */
  const busy = new Set();

  /** @param {any} s */
  function summary(s) {
    const q = questionOf(s.questionId);
    const out = {
      id: s.id, questionId: s.questionId, title: q.title, category: q.category, roleId: s.roleId, probes: s.probes,
      status: s.status, createdAt: s.createdAt, endedAt: s.endedAt,
      minutes: Math.round((s.endedAt ? (Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 1000 : secondsSince(s.startedAt)) / 60),
      answers: candidateTurns(s), counted: counted(s), probesUsed: probeState(s.transcript).used,
    };
    if (s.status !== 'graded') return out;
    const scores = scoresOf(s.grade);
    return {
      ...out, scores, summary: s.grade.summary, topGap: s.grade.gaps[0] ?? null,
      weighted: Object.fromEntries(ROLES.map((r) => [r.id, weighted(scores, r)])),
      verdict: Object.fromEntries(ROLES.map((r) => [r.id, verdict(scores, r)])),
    };
  }

  function state() {
    const all = store.list().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const graded = all.filter(counted).sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    const prof = proficiency(graded.map((s) => scoresOf(s.grade)));
    /** @type {Record<string, number>} */
    const attempts = {};
    for (const s of all) attempts[s.questionId] = (attempts[s.questionId] ?? 0) + 1;
    return {
      scale: SCALE, dimensions: DIMENSIONS, rules: RULES, roles: ROLES, categories: CATEGORIES,
      questions: QUESTIONS.map(({ crux, ...q }) => ({ ...q, attempts: attempts[q.id] ?? 0 })),
      probeOptions: PROBE_OPTIONS, models: MODELS, profile: { background: store.background(), target: store.target() },
      sessions: all.map(summary),
      proficiency: prof,
      readiness: Object.fromEntries(ROLES.map((r) => [r.id, readiness(prof, r)])),
      next: Object.fromEntries(ROLES.map((r) => {
        const x = recommend(prof, r, attempts, QUESTIONS);
        return [r.id, { questionId: x.question.id, dim: x.dim, reason: x.reason }];
      })),
    };
  }

  /** The full session. The interviewer's hidden notes show only once it is graded. @param {any} s */
  function detail(s) {
    const { crux, ...q } = questionOf(s.questionId);
    return { ...s, question: s.status === 'graded' ? { ...q, crux } : q, summary: summary(s) };
  }

  function session(/** @type {string} */ id) {
    const s = ID_RE.test(id) ? store.get(id) : undefined;
    if (!s) throw new HttpError(404, 'no such interview');
    return s;
  }

  /** @type {Set<string>} */
  const grading = new Set();
  /**
   * Grades in the background. The browser polls the session until the status changes.
   * It never rejects, because its callers do not wait: a failed write leaves the session grade_failed in memory.
   * @param {any} s
   */
  async function grade(s) {
    if (grading.has(s.id)) return;
    grading.add(s.id);
    try {
      s.status = 'grading';
      s.gradeError = null;
      await store.put(s);
      const role = ROLE[s.roleId];
      const question = QUESTION[s.questionId];
      const minutes = Math.round((Date.parse(s.endedAt) - Date.parse(s.startedAt)) / 60000);
      const { structured, text } = await ask({
        ...MODELS.grader, system: graderSystem(role, s.background ?? store.background()), schema: GRADE_SCHEMA, timeoutMs: 600_000,
        prompt: graderTurn({ role, question, transcript: s.transcript, notes: s.notes, minutes, planned: minutesFor(s.probes) }),
      });
      const raw = structured ?? JSON.parse(text);
      s.grade = strictGrade(raw, candidateText(s.transcript, s.notes));
      s.gradedAt = iso();
      s.status = 'graded';
    } catch (e) {
      s.status = 'grade_failed';
      s.gradeError = e instanceof Error ? e.message : String(e);
    } finally {
      grading.delete(s.id);
    }
    try {
      await store.put(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      s.status = 'grade_failed';
      s.gradeError = `The grade could not be saved: ${msg}`;
      console.error(`could not save the grade of ${s.id}: ${msg}`);
    }
  }

  /** One interviewer reply, streamed as server-sent events over the POST response. */
  async function turn(/** @type {import('node:http').ServerResponse} */ res, /** @type {any} */ s, /** @type {Record<string, unknown>} */ b) {
    if (s.status !== 'live') throw new HttpError(409, 'this interview is over');
    if (busy.has(s.id)) throw new HttpError(409, 'the interviewer is still answering');
    const text = (optText(b.text, 'text', TEXT_LIMIT) ?? '').trim();
    const notes = optText(b.notes, 'notes', NOTES_LIMIT);
    if (!text && s.transcript.at(-1).role !== 'candidate') throw new HttpError(400, 'write an answer first');
    busy.add(s.id);
    if (notes !== undefined) s.notes = notes;
    if (text) s.transcript.push({ role: 'candidate', text, at: secondsSince(s.startedAt) });
    const elapsedMin = Math.round(secondsSince(s.startedAt) / 60);
    const closing = mustWrap(s.transcript, s.probes, elapsedMin);
    const ctl = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) ctl.abort();
    });
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
    // JSON.stringify leaves U+2028 and U+2029 raw. Some line parsers break lines there, so they go out escaped.
    const send = (/** @type {string} */ event, /** @type {unknown} */ data) => {
      if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data).replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)}\n\n`);
    };
    try {
      await store.put(s);
      const filter = tagFilter();
      const { text: reply } = await ask({
        ...MODELS.interviewer, signal: ctl.signal,
        // A session started without a background, or before profiles, uses the saved one.
        system: interviewerSystem(ROLE[s.roleId], QUESTION[s.questionId], s.probes, s.background ?? store.background()),
        prompt: interviewerTurn({ transcript: s.transcript, notes: s.notes, probes: s.probes, elapsedMin }),
        onText: (d) => {
          const out = filter.push(d);
          if (out) send('delta', { text: out });
        },
      });
      const { tag, body } = tagOf(reply);
      const message = { role: 'interviewer', text: body, at: secondsSince(s.startedAt), tag };
      s.transcript.push(message);
      const wrapped = closing || tag.kind === 'wrap';
      if (wrapped) {
        s.status = 'grading';
        s.endedAt = iso();
      }
      await store.put(s);
      send('done', { message, status: s.status, probes: probeState(s.transcript) });
      if (wrapped) void grade(s);
    } catch (e) {
      send('error', { error: e instanceof Error ? e.message : String(e) });
    } finally {
      busy.delete(s.id);
      res.end();
    }
  }

  let port = config.port;
  /** The server listens only on 127.0.0.1, so that is the only host and origin it answers. */
  const host = () => `127.0.0.1:${port}`;

  /** @returns {string | null} why the POST is refused */
  function postGuard(/** @type {import('node:http').IncomingMessage} */ req) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return 'Content-Type must be application/json';
    if (req.headers.origin !== `http://${host()}`) return 'Origin is not allowed';
    if (!['same-origin', 'none'].includes(String(req.headers['sec-fetch-site']))) return 'Sec-Fetch-Site must be same-origin';
    return null;
  }

  /** The token is only in the link that the server prints, so other programs, users and sites cannot read or start anything. */
  function tokenOk(/** @type {import('node:http').IncomingMessage} */ req) {
    const got = Buffer.from(String(req.headers['x-sdc-token'] ?? ''));
    const want = Buffer.from(token);
    return got.length === want.length && timingSafeEqual(got, want);
  }

  /** @param {import('node:http').IncomingMessage} req @param {import('node:http').ServerResponse} res */
  async function route(req, res) {
    let path;
    try {
      path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    } catch {
      throw new HttpError(400, 'the request target is not a valid URL');
    }
    const method = req.method;
    if (method !== 'GET' && method !== 'POST') throw new HttpError(405, 'method not allowed');
    const asset = method === 'GET' ? STATIC.get(path) : undefined;
    if (asset) {
      const body = await readFile(join(HERE, 'public', asset[0])).catch(() => null);
      if (body === null) throw new HttpError(404, `public/${asset[0]} is missing`);
      res.writeHead(200, { 'Content-Type': asset[1] });
      return res.end(body);
    }
    // Everything except the page and its files needs the token, reads included.
    if (!tokenOk(req)) throw new HttpError(401, 'X-SDC-Token is missing or wrong. Open the link that the server printed.');
    if (method === 'POST') {
      const refused = postGuard(req);
      if (refused) throw new HttpError(refused.startsWith('Content-Type') ? 415 : 403, refused);
    }
    if (method === 'GET' && path === '/api/state') return json(res, 200, state());
    if (method === 'GET' && path === '/api/auth') return json(res, 200, await authStatus());
    // The page holds this stream open. When it ends, the server stopped, and the page locks until the new link is opened.
    if (method === 'GET' && path === '/api/live') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
      res.write(': live\n\n');
      const beat = setInterval(() => res.write(': live\n\n'), 20_000);
      res.on('close', () => clearInterval(beat));
      return;
    }
    if (method === 'POST' && path === '/api/profile') {
      const { target } = await readBody(req);
      // An own property, so that "constructor" or "__proto__" does not pass.
      if (typeof target !== 'string' || !Object.hasOwn(ROLE, target)) throw new HttpError(404, 'no such role');
      await store.setTarget(target);
      return json(res, 200, { ok: true });
    }
    if (method === 'POST' && path === '/api/sessions') {
      const b = await readBody(req);
      // find, not QUESTION[id]: an id such as "constructor" or "__proto__" must not pass.
      const q = QUESTIONS.find((x) => x.id === b.questionId);
      if (!q) throw new HttpError(404, 'no such question');
      const role = ROLES.find((r) => r.id === b.roleId);
      if (!role) throw new HttpError(404, 'no such role');
      if (!PROBE_OPTIONS.includes(Number(b.probes))) throw new HttpError(400, `probes must be one of ${PROBE_OPTIONS.join(', ')}`);
      const background = optText(b.background, 'background', BACKGROUND_LIMIT)?.trim();
      if (background !== undefined && background !== store.background()) await store.setBackground(background);
      const now = iso();
      const s = {
        id: randomUUID(), questionId: q.id, roleId: role.id, probes: Number(b.probes), background, status: 'live',
        createdAt: now, startedAt: now, endedAt: null, notes: '', grade: null, gradeError: null, gradedAt: null,
        transcript: [{ role: 'interviewer', text: opener(q, Number(b.probes)), at: 0, tag: { kind: 'answer' } }],
      };
      await store.put(s);
      return json(res, 201, detail(s));
    }
    const m = /^\/api\/sessions\/([^/]+)(?:\/([a-z]+))?$/.exec(path);
    if (m) {
      const s = session(m[1]);
      const sub = m[2];
      /** The body, once the session is still there: a delete may land while the body arrives, and a late write must never undo it. */
      const body = async () => {
        const b = await readBody(req);
        if (store.get(s.id) !== s) throw new HttpError(404, 'no such interview');
        return b;
      };
      if (method === 'GET' && !sub) return json(res, 200, detail(s));
      if (method === 'POST' && sub === 'turn') return turn(res, s, await body());
      if (method === 'POST' && sub === 'notes') {
        const notes = optText((await body()).notes, 'notes', NOTES_LIMIT);
        if (s.status !== 'live') throw new HttpError(409, 'this interview is over');
        if (notes !== undefined) await store.put(Object.assign(s, { notes }));
        return json(res, 200, { ok: true });
      }
      if (method === 'POST' && sub === 'end') {
        await body();
        if (s.status !== 'live') throw new HttpError(409, 'this interview is over');
        if (busy.has(s.id)) throw new HttpError(409, 'the interviewer is still answering');
        s.endedAt = iso();
        void grade(s);
        return json(res, 202, detail(s));
      }
      if (method === 'POST' && sub === 'grade') {
        await body();
        if (s.status !== 'grade_failed') throw new HttpError(409, 'only a failed grade can be retried');
        void grade(s);
        return json(res, 202, detail(s));
      }
      if (method === 'POST' && sub === 'delete') {
        await body();
        if (busy.has(s.id) || grading.has(s.id)) throw new HttpError(409, 'wait until Claude finishes');
        await store.remove(s.id);
        return json(res, 200, { ok: true });
      }
    }
    throw new HttpError(404, 'not found');
  }

  const server = createServer(async (req, res) => {
    for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
    if (req.headers.host !== host()) return json(res, 403, { error: 'Host must be 127.0.0.1 on this port' });
    try {
      await route(req, res);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      // The message only: a stack or an error object can carry what the request sent.
      if (status === 500) console.error(e instanceof Error ? e.message : String(e));
      if (!res.headersSent) json(res, status, { error: e instanceof Error ? e.message : String(e) });
      else res.end();
    }
  });
  server.on('error', (e) => {
    console.error(e.message);
    process.exit(1);
  });
  await new Promise((resolve) => server.listen(config.port, '127.0.0.1', () => resolve(null)));
  port = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
  console.log(`System Design Coach on http://127.0.0.1:${port}/?token=${token}  state ${config.home}  interviewer ${MODELS.interviewer.model}  grader ${MODELS.grader.model}`);
  const shutdown = () => process.exit(0);
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // The Mac app holds a pipe on stdin. When the app quits or crashes, the pipe closes and the server stops with it.
  if (env.SDC_STOP_WITH_STDIN) process.stdin.on('end', shutdown).resume();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
