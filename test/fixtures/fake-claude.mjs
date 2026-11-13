#!/usr/bin/env node
// Stands in for `claude -p` in tests. With --json-schema it grades; without, it interviews.
// It obeys "FAKE: <verb>" lines in the stdin prompt: fail (an API error result), hang (wait for SIGTERM),
// system (the reply, or the grade's summary, is the system prompt, so a test can read what the server sent),
// echo (the reply is the stdin prompt), tools (the init line lists a tool that the coach never asks for, then it hangs),
// stubborn (it ignores SIGTERM, streams one delta to say so, then hangs until SIGKILL).
import { readFileSync } from 'node:fs';

const out = (/** @type {unknown} */ j) => process.stdout.write(`${JSON.stringify(j)}\n`);
// `claude auth status --json`: a Max login that does not end soon.
if (process.argv[2] === 'auth') {
  out({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max', loginExpiresAt: '2099-01-01T00:00:00.000Z' });
  process.exit(0);
}
// A bare `node --test` matches this file. Without the coach's argv it must do nothing.
if (!process.argv.includes('-p')) process.exit(0);
const prompt = readFileSync(0, 'utf8');
// The first line of a real stream: what this call may use. Only a call with a schema gets StructuredOutput.
const tools = [...(process.argv.includes('--json-schema') ? ['StructuredOutput'] : []), ...(/FAKE: tools/.test(prompt) ? ['Bash'] : [])];
out({ type: 'system', subtype: 'init', tools, mcp_servers: [], slash_commands: [] });
const result = (/** @type {Record<string, unknown>} */ extra) => out({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.0001, duration_ms: 5, ...extra });

if (/FAKE: fail/.test(prompt)) {
  result({ subtype: 'error_during_execution', is_error: true, result: 'API Error: 500 boom' });
  process.exit(1);
}
if (/FAKE: stubborn/.test(prompt)) {
  process.on('SIGTERM', () => {});
  out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'ignoring SIGTERM' } } });
}
if (/FAKE: (hang|tools|stubborn)/.test(prompt)) await new Promise(() => setInterval(() => {}, 1000));
const system = /FAKE: system/.test(prompt) ? readFileSync(process.argv[process.argv.indexOf('--system-prompt-file') + 1], 'utf8') : '';

if (process.argv.includes('--json-schema')) {
  // Quote the candidate's first answer, so verification passes; fabricate the estimation quote, so it fails.
  const first = /\[C1\] Candidate: ([^\n]+)/.exec(prompt)?.[1] ?? '';
  const quote = first.split(/\s+/).slice(0, 8).join(' ');
  const ids = ['requirements', 'estimation', 'api_data', 'architecture', 'deep_dive', 'reliability', 'tradeoffs', 'communication'];
  const dimensions = Object.fromEntries(ids.map((id) => [id, {
    score: 3, prompted: id === 'tradeoffs', justification: `Fake justification for ${id} [C1].`, missed: 'More numbers.',
    evidence: [id === 'estimation' ? 'I estimated ten million requests per second at peak' : quote],
  }]));
  const structured = {
    dimensions, strengths: ['Clear structure'], summary: system || 'A fake but well-formed scorecard.', level_readout: 'Reads as L4.',
    gaps: [{ dimension: 'estimation', gap: 'No numbers', l5_answer: 'Estimate peak QPS first.', drill: 'Do three estimates a day.' }],
  };
  result({ result: JSON.stringify(structured), structured_output: structured });
  process.exit(0);
}

const text = system ? `[[answer]]\n\n${system}`
  : /FAKE: echo/.test(prompt) ? `[[answer]]\n\n${prompt}`
  : /probe budget is used up/.test(prompt)
    ? '[[wrap]]\n\nThanks, that is time. Your scorecard is being prepared.'
    : '[[probe:estimation]]\n\nHow many requests per second do you expect at peak?';
const parts = [text.slice(0, 5), text.slice(5, 20), text.slice(20, 40), text.slice(40)];
out({ type: 'stream_event', event: { type: 'message_start', message: { role: 'assistant', content: [] } } });
out({ type: 'stream_event', event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } });
for (const p of parts) out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } } });
out({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
result({ result: text });
