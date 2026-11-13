import { chmod, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The longest background the candidate may save. */
export const BACKGROUND_LIMIT = 2000;

/**
 * Sessions as one JSON file each, outside the repository. Writes go to a temp file first, so a crash never leaves
 * half a file. Delete moves the file to trash/ instead of removing it. Only the owner can read any of it:
 * the folders are 0700 and the files 0600, also when an older version made them.
 * @param {string} home
 */
export async function createStore(home) {
  const dir = join(home, 'sessions');
  const trash = join(home, 'trash');
  const profile = join(home, 'profile.json');
  for (const d of [home, dir, trash]) {
    await mkdir(d, { recursive: true, mode: 0o700 });
    await chmod(d, 0o700);
  }
  /** @type {Map<string, any>} */
  const sessions = new Map();
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      await chmod(join(dir, f), 0o600);
      const s = JSON.parse(await readFile(join(dir, f), 'utf8'));
      sessions.set(s.id, s);
    } catch (e) {
      console.error(`skipped ${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  /** The candidate's own description of themselves. A missing or unreadable profile means none. */
  let background = '';
  try {
    await chmod(profile, 0o600);
    const p = JSON.parse(await readFile(profile, 'utf8'));
    if (typeof p?.background === 'string') background = p.background.trim().slice(0, BACKGROUND_LIMIT);
  } catch {}
  /** @type {Map<string, Promise<unknown>>} */
  const chains = new Map();
  /** One write at a time per session, so an older snapshot never lands last. */
  const queue = (/** @type {string} */ id, /** @type {() => Promise<unknown>} */ job) => {
    const next = (chains.get(id) ?? Promise.resolve()).then(job, job);
    chains.set(id, next);
    return next;
  };
  const save = async (/** @type {string} */ tmp, /** @type {string} */ file, /** @type {string} */ body) => {
    await writeFile(tmp, body, { mode: 0o600 });
    await rename(tmp, file);
  };
  return {
    list: () => [...sessions.values()],
    get: (/** @type {string} */ id) => sessions.get(id),
    put(/** @type {any} */ s) {
      sessions.set(s.id, s);
      const body = JSON.stringify(s, null, 1);
      return queue(s.id, () => save(join(dir, `.${s.id}.tmp`), join(dir, `${s.id}.json`), body));
    },
    remove(/** @type {string} */ id) {
      sessions.delete(id);
      return queue(id, () => rename(join(dir, `${id}.json`), join(trash, `${id}.json`)).catch(() => {}));
    },
    background: () => background,
    /** @param {string} text already trimmed and at most BACKGROUND_LIMIT characters */
    setBackground(text) {
      background = text;
      const body = JSON.stringify({ background: text });
      return queue('profile', () => save(join(home, '.profile.tmp'), profile, body));
    },
  };
}
