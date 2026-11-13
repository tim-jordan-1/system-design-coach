import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fixTerms, joinSpoken } from '../public/dictation.mjs';

test('fixTerms fixes the system design terms that the transcriber mishears', () => {
  const cases = [
    ['We put a cash in front of the database, so cash hits skip it.', 'We put a cache in front of the database, so cache hits skip it.'],
    ['Browsers cash 301s, and the feed cash keeps 500 IDs.', 'Browsers cache 301s, and the feed cache keeps 500 IDs.'],
    ['The page 99 latency target is 50 ms, and P 50 is 10.', 'The p99 latency target is 50 ms, and p50 is 10.'],
    ['Each node keeps a right ahead log and a mematable.', 'Each node keeps a write-ahead log and a memtable.'],
    ['Fan out on right for most users, or last right wins.', 'Fan out on write for most users, or last write wins.'],
    ['A read to right ratio of 100, so reads and rights split.', 'A read to write ratio of 100, so reads and writes split.'],
    ['It is right heavy, with right amplification.', 'It is write heavy, with write amplification.'],
    ['If Riddiss is down, Rydis or Radiz fail open.', 'If Redis is down, Redis or Redis fail open.'],
    ['Store it in dynamo DB or my SQL.', 'Store it in DynamoDB or MySQL.'],
    ['A web socket per client, then SS tables and H base.', 'A WebSocket per client, then SSTables and HBase.'],
    ['Repair with Merkel trees, hash with MD 5, encode in base 62.', 'Repair with Merkle trees, hash with MD5, encode in base62.'],
    ['Push through a pub subchannel and cloud front.', 'Push through a pub/sub channel and CloudFront.'],
  ];
  for (const [heard, fixed] of cases) assert.equal(fixTerms(heard), fixed);
});

test('fixTerms leaves ordinary speech and correct answers alone', () => {
  const keep = [
    'Right, so the right shard key is the user ID. That is the right trade-off.',
    'Pick the right load balancer, the right quorum size and the right path forward.',
    'Customers pay by card or cash, and drivers cash out weekly.',
    'The wallet shows a cash balance, and pending cash payments settle at night.',
    'With offset pagination, page 50 gets slow.',
    'We read the logs from left to right.',
    'The radius is 5 km, so we redistribute the load.',
  ];
  for (const s of keep) assert.equal(fixTerms(s), s);
  // Ten answers written for the benchmark in docs/dictation-engine.md, spelled correctly.
  const answers = readFileSync(new URL('./fixtures/spoken-answers.txt', import.meta.url), 'utf8').trim().split('\n\n');
  assert.equal(answers.length, 10);
  for (const answer of answers) assert.equal(fixTerms(answer), answer);
});

test('joinSpoken puts one space between the spoken words and the text around them', () => {
  assert.equal(joinSpoken('', ' Hello. ', ''), 'Hello.');
  assert.equal(joinSpoken('I would shard', 'by user ID.', ''), 'I would shard by user ID.');
  assert.equal(joinSpoken('First. ', 'Second.', ' Third.'), 'First. Second. Third.');
  assert.equal(joinSpoken('Use', 'Redis', ', then Kafka.'), 'Use Redis, then Kafka.');
  assert.equal(joinSpoken('Typed.', '  ', ' More.'), 'Typed. More.');
});
