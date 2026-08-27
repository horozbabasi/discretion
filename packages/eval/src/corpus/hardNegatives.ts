/**
 * Hard negatives: documents containing NOTHING sensitive, only content that
 * resembles it. Every sensitive detection inside one is a false positive by
 * construction — this half of the corpus is what determines measured
 * precision.
 *
 * Eight categories, per the milestone brief:
 *   1. documentation whose example values are the KNOWN test constants
 *      (test PANs, doc IBANs, example.com) — detectors must mark them
 *      non-sensitive, so any sensitive hit is a classification failure;
 *   2. code with placeholder credentials;
 *   3. UUIDs, git SHAs, base64 blobs;
 *   4. version/part/build numbers;
 *   5. phone-shaped numbers that are not phones (orders, tracking, invoices);
 *   6. ordinary dates in many writings;
 *   7. German prose (capitalized common nouns);
 *   8. near-valid checksum failures — a valid value with one digit changed,
 *      drawn ONLY from schemes whose checksum provably catches every single
 *      digit substitution (the D10 bijective list). Folded schemes are
 *      excluded on purpose: a mutated CPF has a ~1/11 chance of remaining
 *      genuinely valid, and planting one as a "negative" would be a labeling
 *      error, not a detector test.
 */

import { generate } from '@privacyshield/core';
import type { LabeledDocument, DocType } from './types.js';

const g = generate;

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function digits(rng: () => number, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += String(int(rng, 0, 9));
  return out;
}

const HEX = '0123456789abcdef';
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function chars(rng: () => number, alphabet: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(rng() * alphabet.length)]!;
  return out;
}

/** Change one digit of `value` to a different digit. */
function mutateDigit(rng: () => number, value: string): string {
  const positions = [...value].flatMap((ch, i) => (/\d/.test(ch) ? [i] : []));
  if (positions.length === 0) return value;
  const i = pick(rng, positions);
  const replacement = String((Number(value[i]) + int(rng, 1, 9)) % 10);
  return value.slice(0, i) + replacement + value.slice(i + 1);
}

/**
 * Schemes where a single digit→digit substitution is GUARANTEED invalid
 * (D10's bijective list) — safe to plant as checksum-failure negatives with
 * no oracle. Each entry pairs the generator with a short carrier.
 */
const MUTATION_SAFE: readonly (readonly [string, (seed: number) => string])[] = [
  ['card', g.generateValidCard],
  ['iban', g.generateValidIban],
  ['aadhaar', g.generateValidAadhaar],
  ['tckn', g.generateValidTckn],
  ['sin', g.generateValidSin],
  ['nhs', g.generateValidNhs],
  ['bsn', g.generateValidBsn],
  ['dni-es', g.generateValidDni],
  ['personnummer', g.generateValidPersonnummer],
  ['cuit', g.generateValidCuit],
  ['rut', g.generateValidRut],
  ['za-id', g.generateValidZaId],
  ['ric', g.generateValidRic],
  ['oib', g.generateValidOib],
  ['steuer-id', g.generateValidSteuerId],
  ['pesel', g.generateValidPesel],
  ['nip', g.generateValidNip],
  ['nric', g.generateValidNric],
  ['hkid', g.generateValidHkid],
  ['npi', g.generateValidNpi],
  ['us-routing', g.generateValidRouting],
  ['tfn', g.generateValidTfn],
  ['vin', g.generateValidVin],
  ['teudat-zehut', g.generateValidTeudatZehut],
];

type NegativeBuilder = (rng: () => number) => { text: string; docType: DocType };

const labeledExamples: NegativeBuilder = (rng) => ({
  docType: 'prose',
  text: pick(rng, [
    'For sandbox payments use the test card 4111 1111 1111 1111 with any future expiry. ' +
      'The documentation IBAN GB82 WEST 1234 5698 7654 32 works in the demo environment. ' +
      'Questions go to support@example.com.',
    'Example: the specimen number 078-05-1120 appears on the sample card in every manual. ' +
      'Try the flow with 5555 5555 5555 4444 before going live. See admin@example.org for access.',
    'Docs note: DE89 3704 0044 0532 0130 00 is the tutorial account. ' +
      'The sandbox token endpoint accepts the shared example key printed in the guide.',
  ]),
});

const placeholderCode: NegativeBuilder = (rng) => ({
  docType: 'code',
  text: pick(rng, [
    '// TODO: replace before deploy\nconst apiKey = "your-api-key-here";\nconst secret = "xxxxxxxxxxxxxxxxxxxxxxxx";\n',
    '# put real creds in the vault\nAPI_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxx"\nPASSWORD = "changeme"\n',
    'const config = { token: "<YOUR_TOKEN>", key: "${API_KEY}", password: "REDACTED" };\n',
    '# example only\nAWS_ACCESS_KEY_ID = "AKIAXXXXXXXXXXXXXXXX"\nAWS_SECRET = "placeholder"\n',
  ]),
});

const hexArtifacts: NegativeBuilder = (rng) => {
  const uuid = `${chars(rng, HEX, 8)}-${chars(rng, HEX, 4)}-4${chars(rng, HEX, 3)}-a${chars(rng, HEX, 3)}-${chars(rng, HEX, 12)}`;
  const sha1 = chars(rng, HEX, 40);
  const sha256 = chars(rng, HEX, 64);
  return {
    docType: 'log',
    text:
      `2026-08-2${int(rng, 0, 6)}T1${int(rng, 0, 9)}:4${int(rng, 0, 9)}:02Z INFO request ${uuid} completed\n` +
      `commit ${sha1} deployed to staging\n` +
      `artifact digest sha256:${sha256}\n`,
  };
};

const base64Blob: NegativeBuilder = (rng) => ({
  docType: 'code',
  text: `const icon = "data:image/png;base64,${chars(rng, B64, int(rng, 96, 160))}==";\n`,
});

const versionNumbers: NegativeBuilder = (rng) => ({
  docType: 'prose',
  text:
    `Upgraded the service from v${int(rng, 1, 9)}.${int(rng, 0, 20)}.${int(rng, 0, 9)} to ` +
    `${int(rng, 2, 9)}.${int(rng, 0, 20)}.${int(rng, 0, 9)}-rc.${int(rng, 1, 5)} in build ` +
    `2026081${int(rng, 0, 9)}.${int(rng, 1, 9)}. Replacement part PN-${digits(rng, 4)}-B${int(rng, 10, 99)} ordered.`,
});

const orderNumbers: NegativeBuilder = (rng) => ({
  docType: 'email',
  text:
    `Order ${digits(rng, 10)} left the warehouse this morning.\n` +
    `Tracking: 1Z999AA1${digits(rng, 8)} (carrier reference RR${digits(rng, 9)}CN).\n` +
    `Invoice INV-2026-${digits(rng, 6)} is attached; case ${digits(rng, 8)} remains open.\n`,
});

/**
 * Ordinary, non-sensitive numbers written in NATIVE DIGITS.
 *
 * The counterpart to the M8 Stage 0 digit fold. Folding made native-digit
 * identifiers detectable, which is the point — but it also made every
 * native-digit ORDER NUMBER, price and date detectable to the same patterns.
 * Without these negatives the corpus would measure only the recall the fold
 * buys and none of the precision it costs.
 */
const nativeDigitNoise: NegativeBuilder = (rng) => {
  const zeros = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0e50];
  const zero = zeros[int(rng, 0, zeros.length - 1)]!;
  const native = (n: number): string =>
    digits(rng, n).replace(/[0-9]/g, (d) => String.fromCodePoint(zero + Number(d)));
  return {
    docType: 'prose',
    text:
      `Order ${native(10)} shipped; tracking ${native(12)}.
` +
      `Invoice ${native(8)} totals ${native(4)}.${native(2)} and is due on ${native(2)}/${native(2)}/${native(4)}.
` +
      `Build ${native(3)}.${native(2)}.${native(4)} replaced part PN-${native(4)}.
`,
  };
};

const ordinaryDates: NegativeBuilder = (rng) => {
  const d = int(rng, 10, 28);
  const m = int(rng, 10, 12);
  return {
    docType: 'prose',
    text:
      `The contract runs from 2026-0${int(rng, 1, 9)}-${d} until ${d}/${m}/2027. ` +
      `The kickoff on ${d}.0${int(rng, 1, 9)}.2026 was rescheduled; the review is set for August ${d}, 2027.`,
  };
};

const germanNouns: NegativeBuilder = (rng) => ({
  docType: 'prose',
  text: pick(rng, [
    'Die Verwaltung schickte die Unterlagen über die Genehmigung des Bauvorhabens an die Abteilung für Straßenbau und Stadtentwicklung.',
    'Der Ausschuss besprach die Ergebnisse der Untersuchung zur Verbesserung der Zusammenarbeit zwischen Behörden und Unternehmen.',
    'Nach der Sitzung übergab die Leitung dem Vorstand den Bericht über die Entwicklung der Mitgliederzahlen im vergangenen Geschäftsjahr.',
  ]),
});

const checksumFailures: NegativeBuilder = (rng) => {
  const lines: string[] = [];
  const n = int(rng, 2, 4);
  for (let i = 0; i < n; i++) {
    const [, gen] = pick(rng, MUTATION_SAFE);
    const broken = mutateDigit(rng, gen(Math.floor(rng() * 2 ** 31)));
    lines.push(`The reference ${broken} was rejected by validation.`);
  }
  return { docType: 'prose', text: lines.join(' ') };
};

const CATEGORIES: readonly (readonly [string, NegativeBuilder])[] = [
  ['labeled-examples', labeledExamples],
  ['placeholder-code', placeholderCode],
  ['hex-artifacts', hexArtifacts],
  ['base64-blob', base64Blob],
  ['version-numbers', versionNumbers],
  ['order-numbers', orderNumbers],
  ['native-digit-noise', nativeDigitNoise],
  ['ordinary-dates', ordinaryDates],
  ['german-nouns', germanNouns],
  ['checksum-failures', checksumFailures],
];

export const HARD_NEGATIVE_CATEGORIES: readonly string[] = CATEGORIES.map(([name]) => name);

export interface HardNegativeOptions {
  readonly documents: number;
  readonly seed: number;
}

/** Deterministic hard-negative documents, cycling the categories evenly. */
export function generateHardNegatives(options: HardNegativeOptions): LabeledDocument[] {
  const rng = g.mulberry32(options.seed);
  const docs: LabeledDocument[] = [];
  for (let i = 0; i < options.documents; i++) {
    const [category, build] = CATEGORIES[i % CATEGORIES.length]!;
    const { text, docType } = build(rng);
    docs.push({
      id: `neg-${options.seed}-${i}-${category}`,
      language: category === 'german-nouns' ? 'de' : 'en',
      docType,
      text,
      entities: [],
      hardNegative: true,
    });
  }
  return docs;
}
