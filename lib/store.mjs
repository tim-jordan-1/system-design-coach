import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The longest background the candidate may save. */
export const BACKGROUND_LIMIT = 2000;
/** A session id, as randomUUID makes it. */
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
      if (!ID_RE.test(s?.id) || f !== `${s.id}.json`) throw new Error('its id is not valid or is not its file name');
      sessions.set(s.id, s);
    } catch (e) {
      console.error(`skipped ${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  /** The candidate's own description of themselves, and the role id they aim for. A missing or unreadable profile means none. */
  let background = '';
  let target = '';
  try {
    await chmod(profile, 0o600);
    const p = JSON.parse(await readFile(profile, 'utf8'));
    if (typeof p?.background === 'string') background = p.background.trim().slice(0, BACKGROUND_LIMIT);
    if (typeof p?.target === 'string') target = p.target;
  } catch {}
  /** @type {Map<string, Promise<unknown>>} */
  const chains = new Map();
  /** One write at a time per session, so an older snapshot never lands last. */
  const queue = (/** @type {string} */ id, /** @type {() => Promise<unknown>} */ job) => {
    const next = (chains.get(id) ?? Promise.resolve()).then(job, job);
    chains.set(id, next);
    return next;
  };
  const save = async (/** @type {string} */ file, /** @type {string} */ body) => {
    // A new random name with 'wx' never writes through a file or link that is already there.
    const tmp = join(dirname(file), `.${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, body, { mode: 0o600, flag: 'wx' });
      await rename(tmp, file);
    } catch (e) {
      // With 'wx', EEXIST means that the file is not from this write, so it stays.
      if (/** @type {any} */ (e).code !== 'EEXIST') await rm(tmp, { force: true });
      throw e;
    }
  };
  const saveProfile = () => {
    const body = JSON.stringify({ background, target });
    return queue('profile', () => save(profile, body));
  };
  return {
    list: () => [...sessions.values()],
    get: (/** @type {string} */ id) => sessions.get(id),
    put(/** @type {any} */ s) {
      sessions.set(s.id, s);
      const body = JSON.stringify(s, null, 1);
      return queue(s.id, () => save(join(dir, `${s.id}.json`), body));
    },
    remove(/** @type {string} */ id) {
      sessions.delete(id);
      return queue(id, () => rename(join(dir, `${id}.json`), join(trash, `${id}.json`)).catch(() => {}));
    },
    background: () => background,
    /** @param {string} text already trimmed and at most BACKGROUND_LIMIT characters */
    setBackground(text) {
      background = text;
      return saveProfile();
    },
    target: () => target,
    /** @param {string} id a role id that the caller checked */
    setTarget(id) {
      target = id;
      return saveProfile();
    },
  };
}
