/**
 * Valid-value generators for the financial core family.
 *
 * These synthesize values with the SAME checksum library the validators
 * verify with (`luhnCheckDigit`, `ibanCheckDigits`) — which is not circular:
 * the library is tested independently against published vectors, and this is
 * exactly how M3's corpus generator and M4's surrogate substitution will
 * create valid identifiers.
 *
 * IBAN and credit cards carry real checksums, so their property tests run
 * the full standard including the single-character-mutation half. BIC has no
 * checksum; its property omits mutation (see the BIC section).
 */

import { ibanCheckDigits, luhnCheckDigit } from '../checksums/index.js';
import { IBAN_REGISTRY } from '../detect/detectors/financial/ibanRegistry.js';
import { ISO_COUNTRY_CODES } from '../detect/isoCountries.js';
import { mulberry32 } from './prng.js';

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

const DIGITS = '0123456789';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALNUM = DIGITS + LETTERS;

function chars(rng: () => number, alphabet: string, count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += alphabet[Math.floor(rng() * alphabet.length)]!;
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// IBAN
// ─────────────────────────────────────────────────────────────────────────────

const IBAN_COUNTRIES = [...IBAN_REGISTRY.keys()];

/** A structurally valid, mod-97-closed IBAN for a random registry country. */
export function generateValidIban(seed: number): string {
  const rng = mulberry32(seed);
  const country = pick(rng, IBAN_COUNTRIES);
  const spec = IBAN_REGISTRY.get(country)!;
  let bban = '';
  for (const seg of spec.segments) {
    const alphabet = seg.type === 'n' ? DIGITS : seg.type === 'a' ? LETTERS : ALNUM;
    bban += chars(rng, alphabet, seg.length);
  }
  const check = ibanCheckDigits(country, bban)!;
  return `${country}${check}${bban}`;
}

/** A valid IBAN for a SPECIFIC country (SPEC.md: substitute same-country). */
export function generateValidIbanForCountry(country: string, seed: number): string {
  const spec = IBAN_REGISTRY.get(country);
  if (spec === undefined) return generateValidIban(seed);
  const rng = mulberry32(seed);
  let bban = '';
  for (const seg of spec.segments) {
    const alphabet = seg.type === 'n' ? DIGITS : seg.type === 'a' ? LETTERS : ALNUM;
    bban += chars(rng, alphabet, seg.length);
  }
  const check = ibanCheckDigits(country, bban)!;
  return `${country}${check}${bban}`;
}

/** The same IBAN in conventional four-character display groups. */
export function groupIban(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Credit cards
// ─────────────────────────────────────────────────────────────────────────────

/** Issuer prefix + PAN length pairs; every entry resolves to that issuer. */
const CARD_SHAPES: readonly (readonly [string, number])[] = [
  ['4539', 16], // visa (avoids the 4xxxxx Elo overlaps)
  ['4716', 13], // visa short form
  ['5274', 16], // mastercard
  ['2223', 16], // mastercard 2-series
  ['371', 15], // amex
  ['6011', 16], // discover
  ['3540', 16], // jcb
  ['36', 14], // diners
  ['9792', 16], // troy
  ['2201', 16], // mir
  ['6250', 16], // unionpay
  ['6521', 16], // rupay
  ['509001', 16], // elo
  ['506110', 16], // verve
  ['6759', 12], // maestro
];

/** A Luhn-closed PAN with a recognized issuer prefix. */
export function generateValidCard(seed: number): string {
  const rng = mulberry32(seed);
  const [prefix, length] = pick(rng, CARD_SHAPES);
  const payload = prefix + chars(rng, DIGITS, length - prefix.length - 1);
  return `${payload}${luhnCheckDigit(payload)!}`;
}

/** Prefix + length per issuer, for same-issuer credit-card surrogates. */
const ISSUER_SHAPES: Readonly<Record<string, readonly [string, number]>> = {
  visa: ['4539', 16],
  mastercard: ['5274', 16],
  amex: ['371', 15],
  discover: ['6011', 16],
  jcb: ['3540', 16],
  diners: ['36', 14],
  unionpay: ['6250', 16],
  maestro: ['6759', 16],
  troy: ['9792', 16],
  mir: ['2201', 16],
  rupay: ['6521', 16],
  elo: ['509001', 16],
  verve: ['506110', 16],
};

/** A Luhn-valid PAN for a SPECIFIC issuer (SPEC.md: substitute same issuer). */
export function generateValidCardForIssuer(issuer: string, seed: number): string {
  const shape = ISSUER_SHAPES[issuer];
  if (shape === undefined) return generateValidCard(seed);
  const rng = mulberry32(seed);
  const [prefix, length] = shape;
  const payload = prefix + chars(rng, DIGITS, length - prefix.length - 1);
  return `${payload}${luhnCheckDigit(payload)!}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SWIFT BIC
// ─────────────────────────────────────────────────────────────────────────────

const BIC_COUNTRIES = [...ISO_COUNTRY_CODES].filter((c) => c !== 'EU');
/** Location alphabet obeying ISO 9362: first char never 0/1, second never 0
 *  (0 designates a test BIC, generated separately). */
const LOC_FIRST = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOC_SECOND = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';

/** A structurally valid production (non-test) BIC. */
export function generateValidBic(seed: number): string {
  const rng = mulberry32(seed);
  const bank = chars(rng, LETTERS, 4);
  const country = pick(rng, BIC_COUNTRIES);
  const location = chars(rng, LOC_FIRST, 1) + chars(rng, LOC_SECOND, 1);
  const branch = rng() < 0.5 ? chars(rng, ALNUM, 3) : '';
  return `${bank}${country}${location}${branch}`;
}
