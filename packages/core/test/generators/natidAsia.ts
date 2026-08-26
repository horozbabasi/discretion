/**
 * Valid-value generators for W2d national identifiers (South, Southeast and
 * East Asia).
 */

import { toDigits, verhoeffCheckDigit, weightedSum, weightedMod, weightedModBy, mod11_2CheckChar } from '../../src/checksums/index.js';
import { myNumberCheckDigit } from '../../src/detect/detectors/natid/jp.js';
import { mulberry32 } from '../helpers.js';

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

export function generateValidAadhaar(seed: number): string {
  const rng = mulberry32(seed);
  const payload = String(int(rng, 2, 9)) + digits(rng, 10);
  return `${payload}${verhoeffCheckDigit(payload)!}`;
}

const PAN_TYPES = 'PCHFATBLJG';
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function generateValidPan(seed: number): string {
  const rng = mulberry32(seed);
  let s = '';
  for (let i = 0; i < 3; i++) s += AZ[int(rng, 0, 25)];
  s += pick(rng, [...PAN_TYPES]);
  s += AZ[int(rng, 0, 25)];
  s += digits(rng, 4);
  s += AZ[int(rng, 0, 25)];
  return s;
}

const CN_PROVINCES = ['11', '31', '44', '51', '33', '37', '42', '61', '21', '35'];

export function generateValidRic(seed: number): string {
  const rng = mulberry32(seed);
  const seventeen =
    pick(rng, CN_PROVINCES) + digits(rng, 4) +
    String(int(rng, 1950, 2010)) + pad2(int(rng, 1, 12)) + pad2(int(rng, 1, 28)) +
    digits(rng, 3);
  return `${seventeen}${mod11_2CheckChar(seventeen)!}`;
}

const TW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TW_CODES: Readonly<Record<string, number>> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18,
  K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27,
  U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
};

export function generateValidTwId(seed: number): string {
  const rng = mulberry32(seed);
  const letter = TW_LETTERS[int(rng, 0, 25)]!;
  const gender = pick(rng, ['1', '2']);
  const body = digits(rng, 7);
  const code = TW_CODES[letter]!;
  let sum = Math.floor(code / 10) + (code % 10) * 9;
  const eight = `${gender}${body}`;
  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  for (let i = 0; i < 8; i++) sum += Number(eight[i]) * weights[i]!;
  const check = (10 - (sum % 10)) % 10;
  return `${letter}${eight}${check}`;
}

export function generateValidMyNumber(seed: number): string {
  const rng = mulberry32(seed);
  const payload = toDigits(digits(rng, 11))!;
  return `${payload.join('')}${myNumberCheckDigit(payload)}`;
}

export function generateValidRrn(seed: number): string {
  const rng = mulberry32(seed);
  const body = `${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 1, 28))}${int(rng, 1, 8)}${digits(rng, 5)}`;
  const remainder = weightedMod(toDigits(body)!, [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5], 11)!;
  const check = (11 - remainder) % 10;
  return `${body.slice(0, 6)}-${body.slice(6)}${check}`;
}

const NRIC_TABLES: Readonly<Record<string, string>> = {
  S: 'JZIHGFEDCBA', T: 'JZIHGFEDCBA', F: 'XWUTRQPNMLK', G: 'XWUTRQPNMLK', M: 'KLJNPQRTUWX',
};

export function generateValidNric(seed: number): string {
  const rng = mulberry32(seed);
  const series = pick(rng, ['S', 'T', 'F', 'G', 'M']);
  const body = digits(rng, 7);
  let sum = weightedSum(toDigits(body)!, [2, 7, 6, 5, 4, 3, 2])!;
  if (series === 'T' || series === 'G') sum += 4;
  if (series === 'M') sum += 3;
  return `${series}${body}${NRIC_TABLES[series]![sum % 11]!}`;
}

export function generateValidHkid(seed: number): string {
  const rng = mulberry32(seed);
  const twoLetters = rng() < 0.4;
  const prefix = twoLetters ? AZ[int(rng, 0, 25)]! + AZ[int(rng, 0, 25)]! : AZ[int(rng, 0, 25)]!;
  const body = digits(rng, 6);
  let sum = 0;
  if (prefix.length === 2) {
    sum += (prefix.charCodeAt(0) - 55) * 9 + (prefix.charCodeAt(1) - 55) * 8;
  } else {
    sum += 36 * 9 + (prefix.charCodeAt(0) - 55) * 8;
  }
  for (let i = 0; i < 6; i++) sum += Number(body[i]) * (7 - i);
  const r = sum % 11;
  const checkValue = (11 - r) % 11;
  if (checkValue === 10) return generateValidHkid(seed + 1); // 'A' case: keep simple, redraw
  return `${prefix}${body}${checkValue}`;
}

export function generateValidCnic(seed: number): string {
  const rng = mulberry32(seed);
  return `${int(rng, 1, 9)}${digits(rng, 4)}-${digits(rng, 7)}-${int(rng, 0, 9)}`;
}

export function generateValidBdNid(seed: number): string {
  const rng = mulberry32(seed);
  return `${int(rng, 1950, 2010)}${digits(rng, 13)}`;
}

export function generateValidMykad(seed: number): string {
  const rng = mulberry32(seed);
  let pb = int(rng, 1, 16);
  if (rng() < 0.5) pb = int(rng, 21, 59);
  return `${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 1, 28))}-${pad2(pb)}-${digits(rng, 4)}`;
}

export function generateValidNik(seed: number): string {
  const rng = mulberry32(seed);
  const day = int(rng, 1, 28) + (rng() < 0.5 ? 40 : 0);
  return `${int(rng, 11, 94)}${pad2(int(rng, 1, 99))}${pad2(int(rng, 1, 99))}${pad2(day)}${pad2(int(rng, 1, 12))}${pad2(int(rng, 0, 99))}${String(int(rng, 1, 9999)).padStart(4, '0')}`;
}

export function generateValidThaiId(seed: number): string {
  const rng = mulberry32(seed);
  const twelve = `${int(rng, 1, 8)}${digits(rng, 11)}`;
  const remainder = weightedModBy(toDigits(twelve)!, (i) => 13 - i, 11)!;
  return `${twelve}${(11 - remainder) % 10}`;
}

export function generateValidCccd(seed: number): string {
  const rng = mulberry32(seed);
  return `0${pad2(int(rng, 1, 96)).slice(-2)}${int(rng, 0, 9)}${pad2(int(rng, 0, 99))}${digits(rng, 6)}`;
}

export function generateValidPsn(seed: number): string {
  const rng = mulberry32(seed);
  return `${digits(rng, 4)}-${digits(rng, 4)}-${digits(rng, 4)}-${digits(rng, 4)}`;
}
