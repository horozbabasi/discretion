/**
 * Regenerate packages/data/src/gazetteers.ts — the Stage 2b gazetteers.
 *
 * Run from the repository root:  node packages/data/scripts/build-gazetteers.mjs
 *
 * NEEDS NETWORK. This is BUILD-TIME tooling; the generated module is committed
 * so consumers never fetch anything, which is SPEC.md's zero-runtime-network
 * non-negotiable. Same arrangement as build-confusables.ts.
 *
 * SOURCES, both verified permissive before use:
 *   - Wikidata via the QLever endpoint. CC0 1.0, no attribution required. The
 *     public WDQS endpoint times out on unconstrained P31/P279* queries;
 *     QLever answers them in seconds.
 *   - GeoNames dump files. CC BY 4.0 — the attribution lives in
 *     THIRD_PARTY_NOTICES.md and must stay there.
 *
 * Deliberately NOT used: ParaNames, whose data licence is stated
 * inconsistently across its repo, paper and README, and every source the
 * licensing review rejected. cities500 is excluded as well: small-town names
 * collide massively with common words and surnames.
 *
 * The output is BLOOM FILTERS, not name lists. Size is one reason — about
 * 1.4 M entries in under 2 MB — but the other is that a gazetteer of people's
 * names is personal data about identifiable living people, and CC0 does not
 * change that. Membership testing is all Stage 2b needs, and a filter provides
 * it without shipping a list of who those people are.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const WORK = '.gazetteer-build';
const FP_RATE = 0.001;

/** Languages the trigger lexicons cover; label queries are bound to these. */
const LANGS = [
  'en', 'zh', 'hi', 'es', 'fr', 'ar', 'bn', 'pt', 'ru', 'ur', 'id', 'de', 'ja', 'tr', 'ko', 'vi',
  'it', 'nl', 'pl', 'th', 'he', 'fa', 'uk', 'cs', 'el', 'da', 'sv', 'ro', 'fi', 'mr', 'te', 'ta',
];

/** A gazetteer entry must look like a name, not punctuation soup. */
const NAME_SHAPE = /^[\p{L}\p{M}][\p{L}\p{M} .‘’‐-―'-]*$/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

mkdirSync(WORK, { recursive: true });

function curl(args) {
  execFileSync('curl', ['-sS', '--fail', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
}

function sparql(name, where) {
  const out = `${WORK}/${name}.tsv`;
  if (existsSync(out)) return out;
  const langs = LANGS.map((l) => `"${l}"`).join(',');
  const query =
    'PREFIX wdt: <http://www.wikidata.org/prop/direct/> ' +
    'PREFIX wd: <http://www.wikidata.org/entity/> ' +
    'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> ' +
    `SELECT DISTINCT ?l WHERE { ${where} . ?s rdfs:label ?l . FILTER(LANG(?l) IN (${langs})) }`;
  curl([
    '-X', 'POST', 'https://qlever.dev/api/wikidata',
    '-H', 'Content-Type: application/sparql-query',
    '-H', 'Accept: text/tab-separated-values',
    '--data-binary', query, '-o', out,
  ]);
  return out;
}

function geonames(file) {
  const out = `${WORK}/${file}`;
  if (!existsSync(out)) curl([`https://download.geonames.org/export/dump/${file}`, '-o', out]);
  return out;
}

function fold(value) {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC').trim();
}

/** Read a QLever TSV of quoted labels into a set of folded, name-shaped values. */
async function readLabels(path, into) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let first = true;
  for await (const line of rl) {
    if (first) {
      first = false;
      continue;
    }
    const end = line.lastIndexOf('"');
    if (!line.startsWith('"') || end <= 0) continue;
    const value = line.slice(1, end).replace(/\\"/g, '"').trim();
    if (value.length < 2 || value.length > 40 || !NAME_SHAPE.test(value)) continue;
    const folded = fold(value);
    if (folded.length >= 2) into.add(folded);
  }
}

function addPlace(value, into) {
  const v = (value ?? '').trim();
  // Two characters is a whole word in CJK; three elsewhere, because shorter
  // Latin place names collide with ordinary words and abbreviations.
  const min = CJK.test(v) ? 2 : 3;
  if (v.length < min || v.length > 60 || !NAME_SHAPE.test(v)) return;
  const folded = fold(v);
  if (folded.length >= 2) into.add(folded);
}

/** FNV-1a with two seeds, then double hashing. Mirrored in core's gazetteer. */
function hashPair(s) {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + 0x9e3779b9), 0x85ebca6b) >>> 0;
  }
  return [a >>> 0, (b || 1) >>> 0];
}

function buildFilter(values) {
  const n = Math.max(1, values.size);
  const m = Math.ceil((-n * Math.log(FP_RATE)) / (Math.LN2 * Math.LN2));
  const bits = Math.ceil(m / 8) * 8;
  const k = Math.max(1, Math.round((bits / n) * Math.LN2));
  const bytes = new Uint8Array(bits / 8);
  for (const v of values) {
    const [h1, h2] = hashPair(v);
    for (let i = 0; i < k; i += 1) {
      const bit = ((h1 + Math.imul(i, h2)) >>> 0) % bits;
      bytes[bit >>> 3] |= 1 << (bit & 7);
    }
  }
  return { bits, k, entries: n, base64: Buffer.from(bytes).toString('base64') };
}

const person = new Set();
await readLabels(sparql('givenNames', '?s wdt:P31 wd:Q202444'), person);
await readLabels(sparql('familyNames', '?s wdt:P31 wd:Q101352'), person);

const org = new Set();
await readLabels(sparql('brands', '?s wdt:P31 wd:Q431289'), org);
await readLabels(sparql('businesses', '?s wdt:P31 wd:Q4830453'), org);

const place = new Set();
execFileSync('unzip', ['-o', '-q', geonames('cities15000.zip'), '-d', WORK], { stdio: 'inherit' });
for (const line of readFileSync(`${WORK}/cities15000.txt`, 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 4) continue;
  addPlace(f[1], place);
  addPlace(f[2], place);
  for (const alt of (f[3] ?? '').split(',')) addPlace(alt, place);
}
for (const line of readFileSync(geonames('countryInfo.txt'), 'utf8').split('\n')) {
  if (line.startsWith('#')) continue;
  const f = line.split('\t');
  if (f.length > 4) addPlace(f[4], place);
}
for (const line of readFileSync(geonames('admin1CodesASCII.txt'), 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length > 1) {
    addPlace(f[1], place);
    addPlace(f[2], place);
  }
}

const sets = { PERSON: buildFilter(person), LOCATION: buildFilter(place), ORG: buildFilter(org) };
for (const [name, s] of Object.entries(sets)) {
  console.log(`${name}: ${s.entries} entries, ${(s.bits / 8 / 1048576).toFixed(2)} MB, k=${s.k}`);
}

const total = person.size + place.size + org.size;
const header = `/**
 * Stage 2b GAZETTEERS, as succinct membership filters.
 *
 * SPEC.md: "Bundled compressed lookup sets, checked in parallel with the
 * model … Store as compressed sets or a succinct data structure."
 *
 * These are BLOOM FILTERS over case- and diacritic-folded names, not name
 * lists, for two reasons. Size is the obvious one: ${total.toLocaleString()} entries would be
 * roughly 12 MB of plaintext and are under 2 MB here. The other is that a
 * gazetteer of people's names IS personal data about identifiable living
 * people — CC0 and CC BY waive copyright, they do not make that untrue — and
 * membership testing is the only capability this stage needs. A filter answers
 * "is this a known name?" without shipping a list of who those people are.
 *
 * The trade is a bounded false-positive rate (${FP_RATE * 100}% by construction; a filter
 * never returns a false NEGATIVE). That is acceptable precisely because
 * SPEC.md rates a gazetteer hit alone as MEDIUM confidence — it is
 * corroborating evidence, never a sole basis for reporting.
 *
 * PROVENANCE:
 *   - PERSON   — Wikidata given names (Q202444) and family names (Q101352),
 *                CC0 1.0.
 *   - LOCATION — GeoNames cities15000, countryInfo and admin1 codes, with
 *                native-script alternate names. CC BY 4.0: the attribution is
 *                in THIRD_PARTY_NOTICES.md and must stay there.
 *   - ORG      — Wikidata brands (Q431289) and businesses (Q4830453), CC0 1.0.
 *
 * GENERATED by packages/data/scripts/build-gazetteers.mjs, then committed.
 */

export interface GazetteerFilter {
  /** Bit length of the filter. */
  readonly bits: number;
  /** Number of hash probes per lookup. */
  readonly k: number;
  /** Entries inserted, for reporting. */
  readonly entries: number;
  /** The bit array, base64-encoded. */
  readonly base64: string;
}

export type GazetteerName = 'PERSON' | 'ORG' | 'LOCATION';

// Explicitly annotated rather than inferred: the literal is large enough that
// TypeScript refuses to serialize an inferred type for it (TS7056).
export const GAZETTEERS: Readonly<Record<GazetteerName, GazetteerFilter>> = {
`;

const body = Object.entries(sets)
  .map(
    ([name, s]) =>
      `  ${name}: {\n    bits: ${s.bits},\n    k: ${s.k},\n    entries: ${s.entries},\n    base64:\n      '${s.base64}',\n  },`,
  )
  .join('\n');

writeFileSync('packages/data/src/gazetteers.ts', `${header}${body}\n};\n`, 'utf8');
console.log(`wrote packages/data/src/gazetteers.ts (${(statSync('packages/data/src/gazetteers.ts').size / 1048576).toFixed(2)} MB)`);
