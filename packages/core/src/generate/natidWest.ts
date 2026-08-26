/**
 * Valid-value generators for W2a national identifiers (North America and
 * Western Europe), each synthesizing with the same shared checksum
 * primitives the validators verify with.
 */

import {
  luhnCheckDigit,
  toDigits,
  weightedSum,
  weightedMod,
  mod11_10CheckDigit,
  mrzCheckDigit,
  modString,
} from '../checksums/index.js';
import { codiceFiscaleCin } from '../detect/detectors/natid/it.js';
import { mulberry32 } from './prng.js';

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

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** A rule-valid delimited SSN (not from the advertising/test ranges). */
export function generateValidSsn(seed: number): string {
  const rng = mulberry32(seed);
  let area = int(rng, 1, 899);
  if (area === 666) area = 667;
  return `${String(area).padStart(3, '0')}-${pad2(int(rng, 1, 99))}-${String(int(rng, 1, 9999)).padStart(4, '0')}`;
}

/** A Luhn-valid Canadian SIN. */
export function generateValidSin(seed: number): string {
  const rng = mulberry32(seed);
  const payload = String(pick(rng, [1, 2, 3, 4, 5, 6, 7, 9])) + digits(rng, 7);
  return `${payload}${luhnCheckDigit(payload)!}`;
}

const NINO_FIRST = 'ABCEGHJKLMNOPRSTWXYZ'; // minus D F I Q U V
const NINO_SECOND = 'ABCEGHJKLMNPRSTWXYZ'; // additionally minus O
const NINO_BANNED = new Set(['BG', 'GB', 'NK', 'KN', 'TN', 'NT', 'ZZ']);

/** A prefix-valid NINO. */
export function generateValidNino(seed: number): string {
  const rng = mulberry32(seed);
  let prefix = '';
  do {
    prefix = pick(rng, [...NINO_FIRST]) + pick(rng, [...NINO_SECOND]);
  } while (NINO_BANNED.has(prefix));
  return `${prefix}${digits(rng, 6)}${pick(rng, ['A', 'B', 'C', 'D'])}`;
}

const NHS_WEIGHTS = [10, 9, 8, 7, 6, 5, 4, 3, 2];

/** A mod-11-valid NHS number (outside the 999 test range). */
export function generateValidNhs(seed: number): string {
  const rng = mulberry32(seed);
  for (let attempt = 0; ; attempt++) {
    const payload = String(int(rng, 1, 8)) + digits(rng, 8);
    const remainder = weightedMod(toDigits(payload)!, NHS_WEIGHTS, 11)!;
    let check = 11 - remainder;
    if (check === 11) check = 0;
    if (check === 10) continue; // never issued; draw again
    return `${payload}${check}`;
  }
}

const PPS_WEIGHTS = [8, 7, 6, 5, 4, 3, 2];
const MOD23 = 'WABCDEFGHIJKLMNOPQRSTUV';

/** A mod-23-valid Irish PPS number (old and new formats). */
export function generateValidPps(seed: number): string {
  const rng = mulberry32(seed);
  const body = digits(rng, 7);
  const second = rng() < 0.4 ? pick(rng, ['A', 'H']) : undefined;
  let sum = weightedSum(toDigits(body)!, PPS_WEIGHTS)!;
  if (second !== undefined) sum += 9 * (second.charCodeAt(0) - 64);
  return `${body}${MOD23[sum % 23]!}${second ?? ''}`;
}

/** A Steuer-ID satisfying the frequency rule and MOD 11,10. */
export function generateValidSteuerId(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    // Ten digits: nine distinct + one repeat of an earlier digit.
    const pool = [...'0123456789'];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const nine = pool.slice(0, 9);
    const repeat = nine[int(rng, 0, 8)]!;
    const position = int(rng, 1, 9);
    const ten = [...nine.slice(0, position), repeat, ...nine.slice(position)].slice(0, 10);
    const body = ten.join('');
    if (body[0] === '0') continue;
    const check = mod11_10CheckDigit(body)!;
    return `${body}${check}`;
  }
}

const AUSWEIS_CHARS = 'CFGHJKLMNPRTVWXYZ';

/** A Personalausweis number with its ICAO check digit. */
export function generateValidAusweis(seed: number): string {
  const rng = mulberry32(seed);
  // At least one letter (validator requires it); mix letters and digits.
  let payload = pick(rng, [...AUSWEIS_CHARS]);
  for (let i = 0; i < 8; i++) {
    payload += rng() < 0.5 ? pick(rng, [...AUSWEIS_CHARS]) : String(int(rng, 0, 9));
  }
  return `${payload}${mrzCheckDigit(payload)!}`;
}

/** A NIR with its mod-97 key (occasionally Corsican). */
export function generateValidNir(seed: number): string {
  const rng = mulberry32(seed);
  const sex = pick(rng, ['1', '2']);
  const yy = pad2(int(rng, 0, 99));
  const mm = pad2(int(rng, 1, 12));
  const corsica = rng() < 0.1;
  const dept = corsica ? pick(rng, ['2A', '2B']) : pad2(int(rng, 1, 95));
  const commune = String(int(rng, 1, 999)).padStart(3, '0');
  const order = String(int(rng, 1, 999)).padStart(3, '0');
  let thirteen = `${sex}${yy}${mm}${dept}${commune}${order}`;
  let offset = 0n;
  if (dept === '2A') {
    thirteen = thirteen.replace('A', '0');
    offset = 1_000_000n;
  } else if (dept === '2B') {
    thirteen = thirteen.replace('B', '0');
    offset = 2_000_000n;
  }
  const key = 97n - ((BigInt(thirteen) - offset) % 97n);
  return `${sex} ${yy} ${mm} ${dept} ${commune} ${order} ${String(key).padStart(2, '0')}`;
}

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/** A DNI with its mod-23 letter. */
export function generateValidDni(seed: number): string {
  const rng = mulberry32(seed);
  const body = digits(rng, 8);
  return `${body}${DNI_LETTERS[Number(body) % 23]!}`;
}

/** A NIE with its mod-23 letter. */
export function generateValidNie(seed: number): string {
  const rng = mulberry32(seed);
  const prefix = pick(rng, ['X', 'Y', 'Z']);
  const body = digits(rng, 7);
  const numeric = Number(`${{ X: '0', Y: '1', Z: '2' }[prefix as 'X' | 'Y' | 'Z']}${body}`);
  return `${prefix}${body}${DNI_LETTERS[numeric % 23]!}`;
}

const CF_MONTHS = 'ABCDEHLMPRST';
const CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';

/** A Codice Fiscale with a valid month/day and correct CIN. */
export function generateValidCodiceFiscale(seed: number): string {
  const rng = mulberry32(seed);
  let s = '';
  for (let i = 0; i < 6; i++) s += pick(rng, [...CONSONANTS]);
  s += pad2(int(rng, 0, 99));
  s += pick(rng, [...CF_MONTHS]);
  s += pad2(rng() < 0.5 ? int(rng, 1, 28) : int(rng, 41, 68));
  s += pick(rng, [...'ABDEFGHILMZ']) + String(int(rng, 0, 9)) + String(int(rng, 0, 9)) + String(int(rng, 0, 9));
  return `${s}${codiceFiscaleCin(s)!}`;
}

/** A BSN passing the 11-proef. */
export function generateValidBsn(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const eight = digits(rng, 8);
    const d = toDigits(eight)!;
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += d[i]! * (9 - i);
    const d9 = sum % 11;
    if (d9 === 10) continue;
    return `${eight}${d9}`;
  }
}

/** A Belgian RRN, either century. */
export function generateValidBeRrn(seed: number): string {
  const rng = mulberry32(seed);
  const born2000 = rng() < 0.4;
  const yy = pad2(int(rng, 0, 99));
  const mm = pad2(int(rng, 1, 12));
  const dd = pad2(int(rng, 1, 28));
  const serial = String(int(rng, 1, 998)).padStart(3, '0');
  const nine = `${yy}${mm}${dd}${serial}`;
  const base = born2000 ? `2${nine}` : nine;
  const check = 97 - modString(base, 97)!;
  return `${yy}.${mm}.${dd}-${serial}.${pad2(check)}`;
}
