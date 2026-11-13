import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = process.env.SDC_CLAUDE || 'claude';
const ENV_KEYS = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'TMPDIR', 'SHELL'];
/** Only what `claude` needs to find its login. Keys and tokens in the server's environment stay out. */
const cleanEnv = () => Object.fromEntries(ENV_KEYS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
/** `claude` loads .claude/ settings, hooks included, from its working folder. In a shared /tmp anyone could put them there. */
const CWD = mkdtempSync(join(tmpdir(), 'sdc-'));
process.on('exit', () => rmSync(CWD, { recursive: true, force: true }));

/** Aliases track the newest model of each tier. The interviewer must be quick; the grader must be careful. */
export const MODELS = {
  interviewer: { model: process.env.SDC_INTERVIEWER_MODEL || 'sonnet', effort: 'low' },
  grader: { model: process.env.SDC_GRADER_MODEL || 'opus', effort: 'high' },
};

/**
 * The argv for one isolated call: no tools, no MCP servers, no user settings, hooks, plugins or CLAUDE.md,
 * and nothing saved to the session history. No prompt text goes here, because other local users can read argv
 * with ps: the system prompt (it holds the user's background) is a 0600 file in the private folder, and the turn goes on stdin.
 * @param {{ systemFile: string, model: string, effort: string, schema?: object }} o
 */
export function callArgs(o) {
  return [
    '-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', o.model, '--effort', o.effort,
    '--setting-sources', 'local', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands',
    '--system-prompt-file', o.systemFile,
    ...(o.schema ? ['--json-schema', JSON.stringify(o.schema)] : []),
  ];
}

/**
 * Reads stream-json lines: text deltas go to onText, the result line ends the call.
 * @param {(t: string) => void} [onText]
 */
export function reader(onText) {
  /** @type {any} */
  let result = null;
  let text = '';
  return {
    line(/** @type {string} */ raw) {
      let j;
      try {
        j = JSON.parse(raw);
      } catch {
        return;
      }
      if (j?.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.type === 'text_delta') {
        text += j.event.delta.text;
        onText?.(j.event.delta.text);
      } else if (j?.type === 'result') result = j;
    },
    get result() {
      return result;
    },
    get text() {
      return text;
    },
  };
}

/** A message a person can act on. */
function failure(/** @type {any} */ result, /** @type {string} */ stderr, /** @type {number | null} */ code) {
  const msg = (typeof result?.result === 'string' && result.result.trim()) || stderr.trim().split('\n').at(-1) || `claude exited with code ${code}`;
  return /log ?in|auth|credential|api key/i.test(msg) ? `Claude is not logged in (${msg}). Run "claude" once in a terminal to log in.` : msg;
}

/**
 * One call to Claude through the local `claude` CLI, on the user's own login.
 * @param {{ system: string, prompt: string, model: string, effort: string, schema?: object, onText?: (t: string) => void, signal?: AbortSignal, timeoutMs?: number }} o
 * @returns {Promise<{ text: string, structured: any, costUsd: number | null }>}
 */
export function ask(o) {
  return new Promise((resolve, reject) => {
    const systemFile = join(CWD, `system-${randomUUID()}.txt`);
    writeFileSync(systemFile, o.system, { mode: 0o600 });
    const cleanup = () => rmSync(systemFile, { force: true });
    const child = spawn(BIN, callArgs({ ...o, systemFile }), { cwd: CWD, env: cleanEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    const r = reader(o.onText);
    let buf = '';
    let err = '';
    let timedOut = false;
    const kill = () => child.kill('SIGTERM');
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, o.timeoutMs ?? 180_000);
    o.signal?.addEventListener('abort', kill, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        r.line(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => {
      err = (err + c).slice(-8000);
    });
    child.stdin.on('error', () => {}); // the child exited before reading stdin; 'close' reports why
    child.on('error', (e) => {
      clearTimeout(timer);
      cleanup();
      reject(new Error(/** @type {any} */ (e).code === 'ENOENT' ? `${BIN} is not installed or not on PATH` : e.message));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      cleanup();
      o.signal?.removeEventListener('abort', kill);
      if (buf.trim()) r.line(buf);
      const res = r.result;
      if (o.signal?.aborted) return reject(new Error('cancelled'));
      if (timedOut) return reject(new Error('Claude took too long to answer'));
      if (!res || res.is_error || res.subtype !== 'success') return reject(new Error(failure(res, err, code)));
      resolve({
        text: typeof res.result === 'string' && res.result ? res.result : r.text,
        structured: res.structured_output ?? null,
        costUsd: typeof res.total_cost_usd === 'number' ? res.total_cost_usd : null,
      });
    });
    child.stdin.end(o.prompt);
  });
}

/**
 * The login of the local `claude` CLI, as `claude auth status` reports it. It never throws; a problem comes back in `error`.
 * @returns {Promise<{ loggedIn: boolean, plan: string | null, expiresAt: string | null, error?: string }>}
 */
export function authStatus() {
  return new Promise((resolve) => {
    const child = execFile(BIN, ['auth', 'status', '--json'], { cwd: CWD, env: cleanEnv(), timeout: 15_000 }, (err, stdout) => {
      try {
        // A signed-out CLI exits non-zero but still prints the status.
        const s = JSON.parse(stdout);
        resolve({ loggedIn: s.loggedIn === true, plan: s.subscriptionType ?? null, expiresAt: s.loginExpiresAt ?? null });
      } catch {
        const missing = /** @type {any} */ (err)?.code === 'ENOENT';
        resolve({ loggedIn: false, plan: null, expiresAt: null, error: missing ? `${BIN} is not installed or not on PATH` : err?.message ?? 'claude auth status printed no status' });
      }
    });
    child.stdin?.end();
  });
}
