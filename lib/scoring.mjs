import { DIM_IDS } from './rubric.mjs';

/** @typedef {import('./rubric.mjs').DimId} DimId */
/** @typedef {import('./rubric.mjs').Role} Role */
/** @typedef {import('./questions.mjs').Question} Question */
/** @typedef {Record<DimId, number>} Scores */
/** @typedef {{ score: number, graderScore: number, prompted: boolean, capped: 'evidence' | 'prompted' | null, evidence: { quote: string, verified: boolean }[], justification: string, missed: string }} DimGrade */
/** @typedef {{ dims: Record<DimId, DimGrade>, strengths: string[], gaps: { dimension: DimId, gap: string, l5Answer: string, drill: string }[], summary: string, levelReadout: string }} Grade */

export const VERDICTS = ['Strong hire', 'Hire', 'Lean hire', 'Lean no hire', 'No hire'];
const MIN_QUOTE_WORDS = 4;
const RECENT = 5;
const DECAY = 0.8;

const str = (/** @type {unknown} */ v, max = 1200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Lower case, letters and digits only, single spaces. Quotes are compared in this form. */
export const normalize = (/** @type {string} */ s) =>
  ` ${s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * True when the quote is the candidate's own words. Ellipses split a quote into parts; each part must match.
 * A short part must match exactly. A long part may differ by a word or two: 80% of its words must sit in
 * 6-word runs that appear in the candidate's text, so a fabricated sentence never passes.
 * @param {string} quote @param {string} corpus normalized candidate text
 */
export function quoteFound(quote, corpus) {
  const parts = quote.split(/\.{3}|…/).map((p) => normalize(p).trim()).filter(Boolean);
  if (!parts.length || parts.join(' ').split(' ').length < MIN_QUOTE_WORDS) return false;
  return parts.every((part) => {
    if (corpus.includes(` ${part} `)) return true;
    const words = part.split(' ');
    if (words.length < 8) return false;
    const covered = new Array(words.length).fill(false);
    for (let i = 0; i + 6 <= words.length; i++) {
      if (corpus.includes(` ${words.slice(i, i + 6).join(' ')} `)) covered.fill(true, i, i + 6);
    }
    return covered.filter(Boolean).length / words.length >= 0.8;
  });
}

/**
 * Turns the grader's raw JSON into a strict grade. The rules the code enforces:
 * no verified quote means 0, and prompted credit stops at the L4 bar (2).
 * @param {any} raw the grader's structured output @param {string} candidateText everything the candidate said or wrote
 * @returns {Grade}
 */
export function strictGrade(raw, candidateText) {
  const corpus = normalize(candidateText);
  const dims = /** @type {Record<DimId, DimGrade>} */ ({});
  for (const id of DIM_IDS) {
    const d = raw?.dimensions?.[id] ?? {};
    const graderScore = Math.min(4, Math.max(0, Math.round(Number(d.score)) || 0));
    const evidence = (Array.isArray(d.evidence) ? d.evidence : []).slice(0, 3).map((q) => str(q, 400)).filter(Boolean)
      .map((quote) => ({ quote, verified: quoteFound(quote, corpus) }));
    const prompted = d.prompted === true;
    let score = graderScore;
    /** @type {DimGrade['capped']} */
    let capped = null;
    if (score > 0 && !evidence.some((e) => e.verified)) [score, capped] = [0, 'evidence'];
    if (prompted && score > 2) [score, capped] = [2, 'prompted'];
    dims[id] = { score, graderScore, prompted, capped, evidence, justification: str(d.justification), missed: str(d.missed) };
  }
  const gaps = (Array.isArray(raw?.gaps) ? raw.gaps : [])
    .filter((g) => DIM_IDS.includes(g?.dimension))
    .slice(0, 4)
    .map((g) => ({ dimension: g.dimension, gap: str(g.gap), l5Answer: str(g.l5_answer), drill: str(g.drill) }));
  return {
    dims,
    strengths: (Array.isArray(raw?.strengths) ? raw.strengths : []).slice(0, 4).map((s) => str(s)).filter(Boolean),
    gaps,
    summary: str(raw?.summary),
    levelReadout: str(raw?.level_readout),
  };
}

/** @param {Grade} grade @returns {Scores} */
export const scoresOf = (grade) => /** @type {Scores} */ (Object.fromEntries(DIM_IDS.map((id) => [id, grade.dims[id].score])));

/** Weighted mean on the 0-4 scale, two decimals. @param {Scores} s @param {Role} role */
export function weighted(s, role) {
  let num = 0;
  let den = 0;
  for (const id of DIM_IDS) {
    num += role.weights[id] * s[id];
    den += role.weights[id];
  }
  return Math.round((num / den) * 100) / 100;
}

/**
 * A hiring-committee style verdict against one role's bars.
 * Hire needs every bar met. Lean hire allows one point short, but not on a weight-3 dimension.
 * Lean no hire allows up to three points short in total, none more than one point.
 * @param {Scores} s @param {Role} role
 */
export function verdict(s, role) {
  const short = DIM_IDS.map((id) => ({ id, by: Math.max(0, role.bars[id] - s[id]) }));
  const total = short.reduce((a, x) => a + x.by, 0);
  const worst = Math.max(...short.map((x) => x.by));
  const above = DIM_IDS.filter((id) => s[id] > role.bars[id]).length;
  if (total === 0) return above >= DIM_IDS.length / 2 ? 'Strong hire' : 'Hire';
  if (total === 1 && short.every((x) => x.by === 0 || role.weights[x.id] < 3)) return 'Lean hire';
  if (total <= 3 && worst === 1) return 'Lean no hire';
  return 'No hire';
}

/**
 * Recency-weighted proficiency from the last five counted interviews (newest first, weights 1, 0.8, 0.64...).
 * @param {Scores[]} newestFirst
 * @returns {{ n: number, dims: Record<DimId, { value: number | null, trend: number }> }}
 */
export function proficiency(newestFirst) {
  const recent = newestFirst.slice(0, RECENT);
  const dims = /** @type {Record<DimId, { value: number | null, trend: number }>} */ ({});
  for (const id of DIM_IDS) {
    let num = 0;
    let den = 0;
    recent.forEach((s, i) => {
      num += DECAY ** i * s[id];
      den += DECAY ** i;
    });
    const value = den ? Math.round((num / den) * 100) / 100 : null;
    dims[id] = { value, trend: recent.length > 1 ? recent[0][id] - recent[1][id] : 0 };
  }
  return { n: newestFirst.length, dims };
}

/**
 * How close the proficiency is to one role's bars. 100% means every bar is met.
 * Half the gauge is the weighted share of the bars met, half is the weakest dimension,
 * because a loop fails on its worst signal, not on the average. Ready also needs three counted interviews.
 * @param {ReturnType<typeof proficiency>} prof @param {Role} role
 */
export function readiness(prof, role) {
  if (!prof.n) return { pct: null, status: 'No data', confidence: 'none', gaps: [] };
  let num = 0;
  let den = 0;
  let worst = 1;
  const gaps = [];
  for (const id of DIM_IDS) {
    const value = /** @type {number} */ (prof.dims[id].value);
    const bar = role.bars[id];
    const met = Math.min(1, value / bar);
    num += role.weights[id] * met;
    den += role.weights[id];
    worst = Math.min(worst, met);
    if (value < bar) gaps.push({ dim: id, value, bar, deficit: Math.round((bar - value) * 100) / 100, weight: role.weights[id] });
  }
  gaps.sort((a, b) => b.deficit * b.weight - a.deficit * a.weight);
  const pct = Math.floor(((num / den + worst) / 2) * 100);
  const status = !gaps.length && prof.n >= 3 ? 'Ready' : pct >= 80 ? 'Close' : 'Building';
  return { pct, status, confidence: prof.n < 3 ? 'low' : prof.n < 6 ? 'medium' : 'high', gaps };
}

/**
 * The next question: one that stresses the biggest weighted gap for the target role, fewest attempts first.
 * With no history, the first question in the bank, which touches every dimension.
 * @param {ReturnType<typeof proficiency>} prof @param {Role} role @param {Record<string, number>} attempts
 * @param {Question[]} questions
 * @returns {{ question: Question, dim: DimId | null, reason: 'starter' | 'gap' | 'stretch' }}
 */
export function recommend(prof, role, attempts, questions) {
  if (!prof.n) return { question: questions[0], dim: null, reason: 'starter' };
  const { gaps } = readiness(prof, role);
  const dim = gaps.length ? gaps[0].dim
    : DIM_IDS.reduce((lo, id) => (/** @type {number} */ (prof.dims[id].value) - role.bars[id] < /** @type {number} */ (prof.dims[lo].value) - role.bars[lo] ? id : lo));
  const rank = (/** @type {Question} */ q) => (q.stress.indexOf(dim) + 1 || 9) + 10 * (attempts[q.id] ?? 0);
  const question = questions.filter((q) => q.stress.includes(dim)).sort((a, b) => rank(a) - rank(b))[0] ?? questions[0];
  return { question, dim, reason: gaps.length ? 'gap' : 'stretch' };
}
