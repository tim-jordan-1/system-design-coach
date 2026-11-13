import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QUESTIONS, CATEGORY } from '../lib/questions.mjs';
import { DIM_IDS, ROLE, ROLES } from '../lib/rubric.mjs';
import { normalize, proficiency, quoteFound, readiness, recommend, strictGrade, verdict, weighted } from '../lib/scoring.mjs';

/** @param {number} v @returns {import('../lib/scoring.mjs').Scores} */
const all = (v) => /** @type {any} */ (Object.fromEntries(DIM_IDS.map((id) => [id, v])));
const said = 'I would put a token bucket per API key in Redis and update it with a Lua script so the read and the decrement are atomic. At 50k checks per second one Redis shard is enough.';

test('every role covers every dimension with sane bars and weights', () => {
  for (const r of ROLES) {
    for (const id of DIM_IDS) {
      assert.ok([1, 2, 3, 4].includes(r.bars[id]), `${r.id} bar for ${id}`);
      assert.ok([1, 2, 3].includes(r.weights[id]), `${r.id} weight for ${id}`);
    }
  }
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length, 'question ids are unique');
  for (const q of QUESTIONS) {
    assert.ok(CATEGORY[q.category], `${q.id} category`);
    assert.ok(q.stress.length && q.stress.every((d) => DIM_IDS.includes(d)), `${q.id} stress`);
  }
});

test('quotes must be the candidate\'s own words', () => {
  const corpus = normalize(said);
  assert.ok(quoteFound('a token bucket per API key in Redis', corpus), 'exact, case and punctuation free');
  assert.ok(quoteFound('token bucket per API key … so the read and the decrement are atomic', corpus), 'ellipsis joins two real parts');
  assert.ok(quoteFound('update it with a Lua script so that the read and the decrement are atomic', corpus), 'one word changed in a long quote');
  assert.ok(!quoteFound('I would shard Redis by tenant and fail open when it is down', corpus), 'fabricated');
  assert.ok(!quoteFound('Redis', corpus), 'one word is not evidence');
  assert.ok(!quoteFound('a token bucket per API key in Redis with consistent hashing', corpus), 'a real start with an invented end');
});

test('the code caps what the grader cannot prove', () => {
  const g = strictGrade({
    dimensions: {
      deep_dive: { score: 4, prompted: false, evidence: ['update it with a Lua script so the read and the decrement are atomic'], justification: 'Atomic updates.' },
      estimation: { score: 3, prompted: false, evidence: ['They estimated load well'] },
      tradeoffs: { score: 3, prompted: true, evidence: ['a token bucket per API key in Redis'] },
      reliability: { score: 7, evidence: [] },
    },
    gaps: [{ dimension: 'reliability', gap: 'No failure plan', l5_answer: 'Fail open with a local bucket', drill: 'List failure modes' }, { dimension: 'nope', gap: 'x' }],
  }, said);
  assert.equal(g.dims.deep_dive.score, 4, 'verified evidence keeps the score');
  assert.deepEqual([g.dims.estimation.score, g.dims.estimation.capped], [0, 'evidence'], 'a paraphrase is not a quote');
  assert.deepEqual([g.dims.tradeoffs.score, g.dims.tradeoffs.capped, g.dims.tradeoffs.graderScore], [2, 'prompted', 3]);
  assert.equal(g.dims.reliability.score, 0, 'out of range and unproven');
  assert.equal(g.dims.communication.score, 0, 'a missing dimension scores 0');
  assert.deepEqual(g.gaps.map((x) => x.dimension), ['reliability'], 'unknown dimensions are dropped');
});

test('a quote of text that the prompt neutralized still matches, and shows without the zero-width space', () => {
  const g = strictGrade({ dimensions: { api_data: { score: 3, evidence: ['the client sends @\u200Bmention tokens to the API'] } } }, 'Then the client sends @mention tokens to the API.');
  assert.deepEqual(g.dims.api_data.evidence, [{ quote: 'the client sends @mention tokens to the API', verified: true }]);
  assert.equal(g.dims.api_data.score, 3);
});

test('verdicts follow the bars, strictly', () => {
  const g5 = ROLE['google-l5'];
  assert.equal(verdict(all(3), g5), 'Hire');
  assert.equal(verdict({ ...all(4), communication: 3, estimation: 3, reliability: 3 }, g5), 'Strong hire');
  assert.equal(verdict({ ...all(3), estimation: 2 }, g5), 'Lean hire', 'one point short on a weight-2 dimension');
  assert.equal(verdict({ ...all(3), deep_dive: 2 }, g5), 'Lean no hire', 'one point short on a weight-3 dimension');
  assert.equal(verdict({ ...all(3), deep_dive: 1 }, g5), 'No hire', 'two points short anywhere');
  assert.equal(verdict(all(2), g5), 'No hire', 'L4 everywhere is not L5');
  assert.equal(verdict(all(2), ROLE['google-l4']), 'Hire', 'L4 everywhere meets the Google L4 bar');
  assert.equal(weighted(all(3), g5), 3);
});

test('proficiency weights recent interviews more', () => {
  const p = proficiency([all(3), all(1)]);
  assert.equal(p.dims.architecture.value, Math.round(((3 + 0.8) / 1.8) * 100) / 100);
  assert.equal(p.dims.architecture.trend, 2);
  assert.equal(proficiency([]).dims.requirements.value, null);
  assert.equal(proficiency(Array(9).fill(all(2))).n, 9, 'n counts every interview, the mean uses the last five');
});

test('readiness needs evidence before it says Ready', () => {
  const g4 = ROLE['google-l4'];
  assert.equal(readiness(proficiency([]), g4).status, 'No data');
  assert.equal(readiness(proficiency([all(3), all(3)]), g4).status, 'Close', 'bars met but only two interviews');
  assert.equal(readiness(proficiency([all(3), all(3), all(3)]), g4).status, 'Ready');
  const r = readiness(proficiency([{ ...all(3), estimation: 0, deep_dive: 1 }]), ROLE['google-l5']);
  assert.equal(r.status, 'Building');
  assert.deepEqual(r.gaps.map((x) => x.dim), ['estimation', 'deep_dive'], 'biggest weighted gap first');
  assert.equal(r.pct, 40, 'a zero drags the gauge down, not just its weight share');
  assert.equal(readiness(proficiency([{ ...all(3), tradeoffs: 2 }]), ROLE['google-l5']).pct, 80, 'one dimension a point short');
});

test('the next question aims at the biggest gap and avoids repeats', () => {
  const g5 = ROLE['google-l5'];
  assert.equal(recommend(proficiency([]), g5, {}, QUESTIONS).reason, 'starter');
  const weakDepth = proficiency([{ ...all(3), deep_dive: 1 }]);
  const first = recommend(weakDepth, g5, {}, QUESTIONS);
  assert.equal(first.dim, 'deep_dive');
  assert.equal(first.question.stress[0], 'deep_dive');
  const next = recommend(weakDepth, g5, { [first.question.id]: 1 }, QUESTIONS);
  assert.notEqual(next.question.id, first.question.id);
  assert.equal(recommend(proficiency([all(4)]), g5, {}, QUESTIONS).reason, 'stretch');
});
