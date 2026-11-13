// Red-team check for the grader: runs the real grader on transcripts that must score low
// (weak answers, buzzwords, prompt injection) and fails if any comes back lenient.
// It makes one grader call per case, so it uses your Claude quota. Run: node calibrate.mjs --yes
import { readFileSync } from 'node:fs';
import { MODELS, ask } from './lib/claude.mjs';
import { GRADE_SCHEMA, candidateText, graderSystem, graderTurn } from './lib/prompts.mjs';
import { QUESTION } from './lib/questions.mjs';
import { DIM_IDS, ROLE } from './lib/rubric.mjs';
import { scoresOf, strictGrade, verdict } from './lib/scoring.mjs';

/** @type {{ name: string, questionId: string, roleId: string, notes: string, transcript: [string, string][], expect: { maxAny?: number, max?: Record<string, number>, verdict: string[] } }[]} */
const cases = JSON.parse(readFileSync(new URL('./test/fixtures/calibration.json', import.meta.url), 'utf8'));
if (!process.argv.includes('--yes')) {
  console.log(`This grades ${cases.length} transcripts with the ${MODELS.grader.model} model and uses your Claude quota. Run it again with --yes.`);
  process.exit(0);
}

const results = await Promise.all(cases.map(async (c) => {
  const transcript = c.transcript.map(([role, text], i) => ({ role: /** @type {'interviewer' | 'candidate'} */ (role), text, at: i * 60 }));
  const role = ROLE[c.roleId];
  const { structured } = await ask({
    // No background, so the grader calibrates to the role alone.
    ...MODELS.grader, system: graderSystem(role, ''), schema: GRADE_SCHEMA, timeoutMs: 600_000,
    prompt: graderTurn({ role, question: QUESTION[c.questionId], transcript, notes: c.notes, minutes: 30, planned: 45 }),
  });
  const grade = strictGrade(structured, candidateText(transcript, c.notes));
  const scores = scoresOf(grade);
  const v = verdict(scores, role);
  const problems = [
    ...DIM_IDS.filter((id) => c.expect.maxAny !== undefined && scores[id] > c.expect.maxAny).map((id) => `${id} ${scores[id]} > ${c.expect.maxAny}`),
    ...Object.entries(c.expect.max ?? {}).filter(([id, m]) => scores[/** @type {import('./lib/rubric.mjs').DimId} */ (id)] > m).map(([id, m]) => `${id} ${scores[/** @type {any} */ (id)]} > ${m}`),
    ...(c.expect.verdict.includes(v) ? [] : [`verdict ${v}, expected ${c.expect.verdict.join(' or ')}`]),
  ];
  const raw = DIM_IDS.map((id) => `${grade.dims[id].graderScore}${grade.dims[id].capped ? '>' + scores[id] : ''}`).join(' ');
  return { name: c.name, scores: DIM_IDS.map((id) => scores[id]).join(' '), raw, verdict: v, problems };
}));

for (const r of results) {
  console.log(`${r.problems.length ? 'FAIL' : 'pass'}  ${r.name}\n      scores ${r.scores}  (grader ${r.raw})  verdict ${r.verdict}${r.problems.length ? `\n      ${r.problems.join('; ')}` : ''}`);
}
console.log(`Dimensions in order: ${DIM_IDS.join(', ')}`);
process.exit(results.some((r) => r.problems.length) ? 1 : 0);
