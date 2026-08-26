/**
 * Valid-value generators for W2b national identifiers (Central, Eastern and
 * Northern Europe). Each synthesizes with the shared checksum primitives.
 */

import {
  luhnCheckDigit,
  toDigits,
  weightedMod,
  weightedModBy,
  cyclicWeightedMod,
  mod11_10CheckDigit,
} from '../../src/checksums/index.js';
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
const pad3 = (n: number): string => String(n).padStart(3, '0');

export function generateValidPesel(seed: number): string {
  const rng = mulberry32(seed);
  const yy = pad2(int(rng, 0, 99));
  const mm = pad2(int(rng, 1, 12) + pick(rng, [0, 20, 40, 60, 80]));
  const dd = pad2(int(rng, 1, 28));
  const serial = pad2(int(rng, 0, 99)) + pad2(int(rng, 0, 99)).slice(0, 2);
  const ten = `${yy}${mm}${dd}${serial}`.slice(0, 10);
  const sum = cyclicWeightedMod(toDigits(ten)!, [1, 3, 7, 9], 10)!;
  return `${ten}${(10 - sum) % 10}`;
}

export function generateValidNip(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const nine = digits(rng, 9);
    const remainder = weightedMod(toDigits(nine)!, [6, 5, 7, 2, 3, 4, 5, 6, 7], 11)!;
    if (remainder === 10) continue;
    return `${nine}${remainder}`;
  }
}

export function generateValidRegon(seed: number): string {
  const rng = mulberry32(seed);
  const eight = digits(rng, 8);
  let check = weightedMod(toDigits(eight)!, [8, 9, 2, 3, 4, 5, 6, 7], 11)!;
  if (check === 10) check = 0;
  return `${eight}${check}`;
}

export function generateValidPersonnummer(seed: number): string {
  const rng = mulberry32(seed);
  const yy = pad2(int(rng, 0, 99));
  const mm = pad2(int(rng, 1, 12));
  const dd = pad2(int(rng, 1, 28));
  const nnn = pad3(int(rng, 0, 999));
  const payload = `${yy}${mm}${dd}${nnn}`;
  return `${yy}${mm}${dd}-${nnn}${luhnCheckDigit(payload)!}`;
}

export function generateValidFodselsnummer(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const dd = pad2(int(rng, 1, 28) + (rng() < 0.15 ? 40 : 0)); // sometimes D-number
    const mm = pad2(int(rng, 1, 12));
    const yy = pad2(int(rng, 0, 99));
    const nnn = pad3(int(rng, 0, 499));
    const nine = toDigits(`${dd}${mm}${yy}${nnn}`)!;
    let k1 = 11 - weightedMod(nine, [3, 7, 6, 1, 8, 9, 4, 5, 2], 11)!;
    if (k1 === 11) k1 = 0;
    if (k1 === 10) continue;
    const ten = [...nine, k1];
    let k2 = 11 - weightedMod(ten, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], 11)!;
    if (k2 === 11) k2 = 0;
    if (k2 === 10) continue;
    return `${dd}${mm}${yy}${nnn}${k1}${k2}`;
  }
}

export function generateValidCpr(seed: number): string {
  const rng = mulberry32(seed);
  return `${pad2(int(rng, 1, 28))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 0, 99))}-${digits(rng, 4)}`;
}

const HETU_ALPHABET = '0123456789ABCDEFHJKLMNPRSTUVWXY';

export function generateValidHetu(seed: number): string {
  const rng = mulberry32(seed);
  const dd = pad2(int(rng, 1, 28));
  const mm = pad2(int(rng, 1, 12));
  const yy = pad2(int(rng, 0, 99));
  const sign = pick(rng, ['-', '+', 'A', 'B', 'F', 'U', 'Y']);
  const nnn = pad3(int(rng, 2, 899));
  const check = HETU_ALPHABET[Number(`${dd}${mm}${yy}${nnn}`) % 31]!;
  return `${dd}${mm}${yy}${sign}${nnn}${check}`;
}

export function generateValidKennitala(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const dd = pad2(int(rng, 1, 28) + (rng() < 0.1 ? 40 : 0));
    const mm = pad2(int(rng, 1, 12));
    const yy = pad2(int(rng, 0, 99));
    const nn = pad2(int(rng, 20, 99));
    const eight = toDigits(`${dd}${mm}${yy}${nn}`)!;
    let check = 11 - weightedMod(eight, [3, 2, 7, 6, 5, 4, 3, 2], 11)!;
    if (check === 11) check = 0;
    if (check === 10) continue;
    return `${dd}${mm}${yy}-${nn}${check}${pick(rng, ['9', '0', '8'])}`;
  }
}

export function generateValidPtNif(seed: number): string {
  const rng = mulberry32(seed);
  const eight = String(int(rng, 1, 9)) + digits(rng, 7);
  const remainder = weightedMod(toDigits(eight)!, [9, 8, 7, 6, 5, 4, 3, 2], 11)!;
  const check = remainder < 2 ? 0 : 11 - remainder;
  return `${eight}${check}`;
}

export function generateValidAfm(seed: number): string {
  const rng = mulberry32(seed);
  const eight = digits(rng, 8);
  const sum = weightedModBy(toDigits(eight)!, (i) => 2 ** (8 - i), 11)!;
  return `${eight}${sum % 10}`;
}

export function generateValidRodneCislo(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const yy = pad2(int(rng, 54, 99));
    const mm = pad2(int(rng, 1, 12) + (rng() < 0.5 ? 50 : 0));
    const dd = pad2(int(rng, 1, 28));
    // Four-digit serial slot — a three-zero slot lets the serial carry into
    // the day field, which a property run caught.
    const base = Number(`${yy}${mm}${dd}0000`);
    for (let serial = int(rng, 0, 9988); serial <= 9999; serial++) {
      const candidate = base + serial;
      if (candidate % 11 === 0) {
        return String(candidate).replace(/^(\d{6})/, '$1/');
      }
    }
  }
}

export function generateValidSzemelyi(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const ten = `${int(rng, 1, 8)}${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 1, 28))}${pad3(int(rng, 0, 999))}`;
    const remainder = weightedModBy(toDigits(ten)!, (i) => i + 1, 11)!;
    if (remainder === 10) continue;
    return `${ten}${remainder}`;
  }
}

export function generateValidCnp(seed: number): string {
  const rng = mulberry32(seed);
  const twelve = `${int(rng, 1, 8)}${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 1, 28))}${pad2(int(rng, 1, 52))}${pad3(int(rng, 1, 999))}`;
  let check = weightedMod(toDigits(twelve)!, [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9], 11)!;
  if (check === 10) check = 1;
  return `${twelve}${check}`;
}

export function generateValidEgn(seed: number): string {
  const rng = mulberry32(seed);
  const nine = `${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12) + pick(rng, [0, 20, 40]))}${pad2(int(rng, 1, 28))}${pad3(int(rng, 0, 999))}`;
  let check = weightedMod(toDigits(nine)!, [2, 4, 8, 5, 10, 9, 7, 3, 6], 11)!;
  if (check === 10) check = 0;
  return `${nine}${check}`;
}

export function generateValidOib(seed: number): string {
  const rng = mulberry32(seed);
  const ten = digits(rng, 10);
  return `${ten}${mod11_10CheckDigit(ten)!}`;
}

export function generateValidEmso(seed: number): string {
  const rng = mulberry32(seed);
  const twelve = `${pad2(int(rng, 1, 28))}${pad2(int(rng, 1, 12))}${pad3(int(rng, 900, 999))}${pad2(int(rng, 50, 59))}${pad3(int(rng, 0, 999))}`;
  const sum = cyclicWeightedMod(toDigits(twelve)!, [7, 6, 5, 4, 3, 2], 11)!;
  let k = 11 - sum;
  if (k >= 10) k = 0;
  return `${twelve}${k}`;
}
