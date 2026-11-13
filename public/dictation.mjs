// Dictation helpers for the answer box. The Mac app transcribes speech on the device. These rules fix the words
// that the transcriber gets wrong in system design talk, for example "cash" for cache and "page 99" for p99.
// Each rule matches only a technical phrase, so ordinary speech, and words like "right" and "cash" in their
// own sense, stay as they are. test/dictation.test.mjs holds sentences that must not change.
// Measured on spoken answers that the rules never saw, term recall went from 65% to 70%: docs/dictation-engine.md.

const CACHE_NEXT = String.raw`hits?|miss(?:es)?|layers?|keys?|entr(?:y|ies)|invalidation|aside|clusters?|nodes?|servers?|tiers?|warming|stampede|evictions?|ratio|size|lookups?|lines?|polic(?:y|ies)|TTLs?|reads?|writes?|rights|coherence|locality|hierarchy|fill`;
const CACHE_PREV = String.raw`the|a|our|local|edge|feed|Redis|distributed|in-memory|LRU|CDN|browser|client|write-through|write-back|read-through|L1|L2|hot|warm|cold|shared|timeline|session|query|object|result|near`;
const MONEY = String.raw`outs?|flows?|balances?|payments?|register|back|value|withdrawals?|deposits?|on|prizes?|reserves?|equivalents?|transactions?|refunds?|payouts?|amounts?`;
const WRITE_NEXT = String.raw`heavy|amplification|conflicts?`;

/** Keeps a leading capital, so "Cash hits" becomes "Cache hits". */
const keep = (/** @type {string} */ from, /** @type {string} */ to) => (/^[A-Z]/.test(from) ? to[0].toUpperCase() + to.slice(1) : to);

/** @type {[RegExp, string | ((m: string, ...g: string[]) => string)][]} */
const RULES = [
  // cache, heard as cash
  [new RegExp(String.raw`\bcash(?=[ -](?:${CACHE_NEXT})\b)`, 'gi'), (m) => keep(m, 'cache')],
  [new RegExp(String.raw`\b(${CACHE_PREV}) cash\b(?![ -](?:${MONEY})\b)`, 'gi'), (m, p) => `${p} cache`],
  [/\b(we|they|browsers?|clients?|CDNs?|it|you|I|we'd|I'd|you'd) cash\b(?! (?:out|in|back)\b)/gi, (m, p) => `${p} cache`],
  [/\bcash(ing|ed)\b(?! (?:out|in)\b)/gi, (m, s) => keep(m, `cach${s}`)],
  // write, heard as right or ride, in fixed technical phrases
  [/\b(?:right|ride|rite)[ -]ahead\b/gi, (m) => keep(m, 'write-ahead')],
  [/\b(fan[ -]?out) on (?:right|ride)\b/gi, '$1 on write'],
  [/\blast (?:right|ride) wins\b/gi, (m) => keep(m, 'last write wins')],
  [/\b(?:right|ride)[ -](through|back|around)(?= (?:cach|cash))/gi, (m, w) => keep(m, `write-${w}`)],
  [new RegExp(String.raw`\b(?:right|ride)([ -])(?=(?:${WRITE_NEXT})\b)`, 'gi'), (m, sep) => keep(m, 'write') + sep],
  [/\b(reads?) (and|or|versus|vs\.?|to|over) (?:right|ride)(s?)\b/gi, '$1 $2 write$3'],
  [/\b(?:rights|rides) per second\b/gi, (m) => keep(m, 'writes per second')],
  [/\b(concurrent|conflicting|buffered|batched|duplicate|accept|accepts|accepting|cache|cached|pending|queued) (?:rights|rides)\b/gi, '$1 writes'],
  // p50, p95, p99 and p999, heard as "page 99" or "P 99". "page 50" stays, because it can be a real page.
  [/\b(?:[Pp]age|[Pp]ea|[Pp]ee|P)[ -]?(9[059]|999)\b/g, 'p$1'],
  [/\b[Pp][ -](50)\b/g, 'p$1'],
  // names and terms that come out misspelled or in pieces
  [/\bR(?:h?[aeiy])dd?i(?:ss?|z|st)\b/gi, 'Redis'],
  [/\b(Dynamo|Mongo|Cockroach|Rocks|Level|Influx|Couch) ?DB\b/gi, (m, n) => `${n[0].toUpperCase()}${n.slice(1).toLowerCase()}DB`],
  [/\bmy (?:SQL|sequel)\b/gi, 'MySQL'],
  [/\bpost ?gres?s\b/gi, 'Postgres'],
  [/\bweb ?socket(s?)\b/gi, 'WebSocket$1'],
  [/\bSS ?tables?\b/gi, (m) => (/s$/i.test(m) ? 'SSTables' : 'SSTable')],
  [/\b(?:mem|mean|meme|memi|mema|meant)[ -]?table(s?)\b/gi, 'memtable$1'],
  [/\bH ?base\b/g, 'HBase'],
  [/\bbase ?(32|58|62|64)\b/gi, 'base$1'],
  [/\bMD ?5\b/g, 'MD5'],
  [/\bSHA ?-? ?(1|256|512)\b/g, 'SHA-$1'],
  [/\bcloud ?front\b/gi, 'CloudFront'],
  [/\bpub[ -]?sub(channels?)?\b/gi, (m, c) => `pub/sub${c ? ` ${c}` : ''}`],
  [/\bG ?RPC\b/gi, 'gRPC'],
  [/\bgraph ?QL\b/gi, 'GraphQL'],
  [/\belastic ?search\b/gi, 'Elasticsearch'],
  [/\bzoo ?keeper\b/gi, 'ZooKeeper'],
  [/\bMerkel(?= trees?\b)/gi, 'Merkle'],
  [/\bcap theorem\b/gi, 'CAP theorem'],
  [/\bkafka\b/g, 'Kafka'],
];

/** Returns dictated text with the system design terms fixed. */
export function fixTerms(/** @type {string} */ text) {
  return RULES.reduce((t, [re, to]) => t.replace(re, /** @type {any} */ (to)), text);
}

/** Puts the spoken words between the text before and after the caret, with one space on each side. */
export function joinSpoken(/** @type {string} */ before, /** @type {string} */ spoken, /** @type {string} */ after) {
  const words = spoken.trim();
  if (!words) return before + after;
  return `${before}${before && !/\s$/.test(before) ? ' ' : ''}${words}${after && !/^[\s.,;:!?)]/.test(after) ? ' ' : ''}${after}`;
}
