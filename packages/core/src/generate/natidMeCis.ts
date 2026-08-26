/**
 * Valid-value generators for W2c national identifiers (Turkey, CIS, Middle
 * East), synthesized with the shared checksum primitives.
 */

import { luhnCheckDigit, toDigits, weightedMod, weightedModBy } from '../checksums/index.js';
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

export function generateValidTckn(seed: number): string {
  const rng = mulberry32(seed);
  const first9 = String(int(rng, 1, 9)) + digits(rng, 8);
  const d = toDigits(first9)!;
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return `${first9}${d10}${d11}`;
}

export function generateValidVkn(seed: number): string {
  const rng = mulberry32(seed);
  const nine = digits(rng, 9);
  const d = toDigits(nine)!;
  let sum = 0;
  for (let p = 1; p <= 9; p++) {
    const tmp = (d[p - 1]! + 10 - p) % 10;
    sum += tmp === 9 ? 9 : (tmp * 2 ** (10 - p)) % 9;
  }
  return `${nine}${(10 - (sum % 10)) % 10}`;
}

export function generateValidInn10(seed: number): string {
  const rng = mulberry32(seed);
  const nine = digits(rng, 9);
  const check = weightedMod(toDigits(nine)!, [2, 4, 10, 3, 5, 9, 4, 6, 8], 11)! % 10;
  return `${nine}${check}`;
}

export function generateValidInn12(seed: number): string {
  const rng = mulberry32(seed);
  const ten = digits(rng, 10);
  const c11 = weightedMod(toDigits(ten)!, [7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 11)! % 10;
  const c12 = weightedMod(toDigits(`${ten}${c11}`)!, [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8], 11)! % 10;
  return `${ten}${c11}${c12}`;
}

export function generateValidSnils(seed: number): string {
  const rng = mulberry32(seed);
  const nine = digits(rng, 9);
  const d = toDigits(nine)!;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i]! * (9 - i);
  let check = sum % 101;
  if (check === 100) check = 0;
  return `${nine.slice(0, 3)}-${nine.slice(3, 6)}-${nine.slice(6)} ${pad2(check)}`;
}

export function generateValidRnokpp(seed: number): string {
  const rng = mulberry32(seed);
  const nine = digits(rng, 9);
  const d = toDigits(nine)!;
  const weights = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i]! * weights[i]!;
  const check = ((sum % 11) + 11) % 11 % 10;
  return `${nine}${check}`;
}

export function generateValidIin(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const eleven = `${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 1, 28))}${int(rng, 1, 6)}${digits(rng, 4)}`;
    const d = toDigits(eleven)!;
    let check = weightedModBy(d, (i) => i + 1, 11)!;
    if (check === 10) {
      check = weightedModBy(d, (i) => ((i + 2) % 11) + 1, 11)!;
      if (check === 10) continue;
    }
    return `${eleven}${check}`;
  }
}

export function generateValidTeudatZehut(seed: number): string {
  const rng = mulberry32(seed);
  const eight = digits(rng, 8);
  return `${eight}${luhnCheckDigit(eight)!}`;
}

export function generateValidSaudiId(seed: number): string {
  const rng = mulberry32(seed);
  const payload = pick(rng, ['1', '2']) + digits(rng, 8);
  return `${payload}${luhnCheckDigit(payload)!}`;
}

export function generateValidEmiratesId(seed: number): string {
  const rng = mulberry32(seed);
  const payload = `784${int(rng, 1940, 2020)}${digits(rng, 7)}`;
  return `${payload}${luhnCheckDigit(payload)!}`;
}

export function generateValidQid(seed: number): string {
  const rng = mulberry32(seed);
  return `${pick(rng, ['2', '3'])}${pad2(int(rng, 40, 99))}${digits(rng, 8)}`;
}

export function generateValidKwCivilId(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const eleven = `${pick(rng, ['1', '2', '3'])}${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 1, 28))}${digits(rng, 4)}`;
    const remainder = weightedMod(toDigits(eleven)!, [2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 3], 11)!;
    const check = 11 - remainder;
    if (check >= 10) continue;
    return `${eleven}${check}`;
  }
}
