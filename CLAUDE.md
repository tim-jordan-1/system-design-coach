# CLAUDE.md

System Design Coach is a local mock system design interview app. A zero-dependency Node server (`server.mjs`, Node 26 or later) serves a dashboard on `127.0.0.1`. For each interviewer turn and each grade, it starts the user's own `claude -p` with no tools, isolated. An optional Mac app in `mac/` shows it in a window and adds on-device dictation.

## Commands

- `npm test` runs `node --test test/`. It uses a fake `claude` and does not use quota.
- `npm start` runs `node server.mjs`. The server picks a free port at each start. Open the link that it prints, with the `?token=` key.
- `npm run mac` runs `sh mac/build.sh`. It builds `System Design Coach.app` into `~/Applications`.
- `sh mac/check-dictation.sh` checks dictation without a microphone. It needs macOS.
- `npm run calibrate` shows what calibration would do. `node calibrate.mjs --yes` grades three transcripts with the real grader, so it uses the real Claude quota of the user. Do not run it without a reason.

## Working rules

- The rubric lives in `lib/rubric.mjs`. The questions live in `lib/questions.mjs`.
- Run the tests after every change.
- The Mac app bundles `server.mjs`, `lib/*.mjs` and four files of `public/`. A new file in `public/` needs a line in `mac/build.sh` and an entry in `STATIC` in `server.mjs`. After you change any of them, rebuild the app with `npm run mac`.
- Read `docs/dictation-engine.md` before you change dictation.
- Run calibration after a change to the rubric or the grader.
- Interview data lives outside the repository, in `~/.system-design-coach`. Never write it into the repository.

## Privacy

Never commit personal data, real interview transcripts or real Claude output. Scrub ids, names and account details first.
