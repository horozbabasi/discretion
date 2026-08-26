/**
 * Valid-value generators for EU VAT — one synthesizer per member state,
 * each closing its national checksum with the shared primitives, plus a
 * country-random wrapper. Reused by M3's corpus generator.
 */

import {
  toDigits,
  weightedSum,
  weightedMod,
  weightedModBy,
  cyclicWeightedMod,
  luhnCheckDigit,
  mod11_10CheckDigit,
} from '../checksums/index.js';
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

type Synth = (rng: () => number) => string;

const SYNTHS: Readonly<Record<string, Synth>> = {
  AT: (rng) => {
    const seven = digits(rng, 7);
    const d = toDigits(seven)!;
    let s = 0;
    for (let i = 0; i < 7; i++) {
      const product = d[i]! * (i % 2 === 0 ? 1 : 2);
      s += product > 9 ? product - 9 : product;
    }
    return `U${seven}${(10 - ((s + 4) % 10)) % 10}`;
  },
  BE: (rng) => {
    const eight = `0${digits(rng, 7)}`;
    return `${eight}${String(97 - (Number(eight) % 97)).padStart(2, '0')}`;
  },
  BG: (rng) => {
    for (;;) {
      const eight = digits(rng, 8);
      const d = toDigits(eight)!;
      let r = weightedModBy(d, (i) => i + 1, 11)!;
      if (r === 10) {
        r = weightedModBy(d, (i) => i + 3, 11)!;
        if (r === 10) r = 0;
      }
      return `${eight}${r}`;
    }
  },
  CY: (rng) => {
    const TRANSFORM = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21];
    const eight = digits(rng, 8);
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      const d = Number(eight[i]);
      sum += i % 2 === 0 ? TRANSFORM[d]! : d;
    }
    return `${eight}${String.fromCharCode(65 + (sum % 26))}`;
  },
  CZ: (rng) => {
    const seven = digits(rng, 7);
    const r = weightedModBy(toDigits(seven)!, (i) => 8 - i, 11)!;
    const c = r === 0 ? 1 : r === 1 ? 0 : 11 - r;
    return `${seven}${c}`;
  },
  DE: (rng) => {
    const eight = String(int(rng, 1, 9)) + digits(rng, 7);
    return `${eight}${mod11_10CheckDigit(eight)!}`;
  },
  DK: (rng) => {
    for (;;) {
      const seven = String(int(rng, 1, 9)) + digits(rng, 6);
      const partial = weightedSum(toDigits(seven)!, [2, 7, 6, 5, 4, 3, 2])!;
      for (let d = 0; d <= 9; d++) {
        if ((partial + d) % 11 === 0) return `${seven}${d}`;
      }
    }
  },
  EE: (rng) => {
    const eight = digits(rng, 8);
    const sum = cyclicWeightedMod(toDigits(eight)!, [3, 7, 1], 10)!;
    return `${eight}${(10 - sum) % 10}`;
  },
  EL: (rng) => {
    const eight = String(int(rng, 1, 9)) + digits(rng, 7);
    const sum = weightedModBy(toDigits(eight)!, (i) => 2 ** (8 - i), 11)!;
    return `${eight}${sum % 10}`;
  },
  ES: (rng) => {
    const eight = digits(rng, 8);
    return `${eight}${'TRWAGMYFPDXBNJZSQVHLCKE'[Number(eight) % 23]}`;
  },
  FI: (rng) => {
    for (;;) {
      const seven = digits(rng, 7);
      const r = weightedMod(toDigits(seven)!, [7, 9, 10, 5, 8, 4, 2], 11)!;
      if (r === 1) continue;
      return `${seven}${r === 0 ? 0 : 11 - r}`;
    }
  },
  FR: (rng) => {
    const siren = String(int(rng, 1, 9)) + digits(rng, 7);
    const full = `${siren}${luhnCheckDigit(siren)!}`;
    const key = (12 + 3 * (Number(full) % 97)) % 97;
    return `${String(key).padStart(2, '0')}${full}`;
  },
  HR: (rng) => {
    const ten = digits(rng, 10);
    return `${ten}${mod11_10CheckDigit(ten)!}`;
  },
  HU: (rng) => {
    const seven = String(int(rng, 1, 9)) + digits(rng, 6);
    const sum = weightedMod(toDigits(seven)!, [9, 7, 3, 1, 9, 7, 3], 10)!;
    return `${seven}${(10 - sum) % 10}`;
  },
  IE: (rng) => {
    const seven = digits(rng, 7);
    const second = rng() < 0.4 ? pick(rng, ['A', 'H']) : undefined;
    let sum = weightedSum(toDigits(seven)!, [8, 7, 6, 5, 4, 3, 2])!;
    if (second !== undefined) sum += 9 * (second.charCodeAt(0) - 64);
    return `${seven}${'WABCDEFGHIJKLMNOPQRSTUV'[sum % 23]}${second ?? ''}`;
  },
  IT: (rng) => {
    const ten = String(int(rng, 1, 9)) + digits(rng, 6) + '0' + digits(rng, 2);
    return `${ten}${luhnCheckDigit(ten)!}`;
  },
  LT: (rng) => {
    for (;;) {
      const eight = digits(rng, 8);
      const d = toDigits(eight)!;
      let r = weightedModBy(d, (i) => (i % 9) + 1, 11)!;
      if (r === 10) {
        r = weightedModBy(d, (i) => ((i + 2) % 9) + 1, 11)!;
        if (r === 10) r = 0;
      }
      return `${eight}${r}`;
    }
  },
  LU: (rng) => {
    const six = digits(rng, 6);
    return `${six}${String(Number(six) % 89).padStart(2, '0')}`;
  },
  LV: (rng) => {
    for (;;) {
      const ten = String(int(rng, 4, 9)) + digits(rng, 9);
      const d = toDigits(ten)!;
      let sum = 0;
      const weights = [9, 1, 4, 8, 3, 10, 2, 5, 7, 6];
      for (let i = 0; i < 10; i++) sum += d[i]! * weights[i]!;
      const c = (((3 - sum) % 11) + 11) % 11;
      if (c === 10) continue;
      return `${ten}${c}`;
    }
  },
  MT: (rng) => {
    for (;;) {
      const six = String(int(rng, 1, 9)) + digits(rng, 5);
      const r = weightedMod(toDigits(six)!, [3, 4, 6, 7, 8, 9], 37)!;
      const check = 37 - r === 0 ? 37 : 37 - r;
      return `${six}${String(check).padStart(2, '0')}`;
    }
  },
  NL: (rng) => {
    for (;;) {
      const eight = digits(rng, 8);
      const r = weightedModBy(toDigits(eight)!, (i) => 9 - i, 11)!;
      if (r === 10) continue;
      return `${eight}${r}B${String(int(rng, 1, 99)).padStart(2, '0')}`;
    }
  },
  PL: (rng) => {
    for (;;) {
      const nine = digits(rng, 9);
      const r = weightedMod(toDigits(nine)!, [6, 5, 7, 2, 3, 4, 5, 6, 7], 11)!;
      if (r === 10) continue;
      return `${nine}${r}`;
    }
  },
  PT: (rng) => {
    const eight = String(int(rng, 1, 9)) + digits(rng, 7);
    const r = weightedModBy(toDigits(eight)!, (i) => 9 - i, 11)!;
    return `${eight}${r < 2 ? 0 : 11 - r}`;
  },
  RO: (rng) => {
    const body = String(int(rng, 1, 9)) + digits(rng, int(rng, 1, 8));
    const padded = body.padStart(9, '0');
    const sum = weightedMod(toDigits(padded)!, [7, 5, 3, 2, 1, 7, 5, 3, 2], 11)!;
    return `${body}${((sum * 10) % 11) % 10}`;
  },
  SE: (rng) => {
    const nine = String(int(rng, 1, 9)) + digits(rng, 8);
    return `${nine}${luhnCheckDigit(nine)!}01`;
  },
  SI: (rng) => {
    for (;;) {
      const seven = String(int(rng, 1, 9)) + digits(rng, 6);
      const r = weightedModBy(toDigits(seven)!, (i) => 8 - i, 11)!;
      const c = 11 - r;
      if (c === 10) continue;
      return `${seven}${c === 11 ? 0 : c}`;
    }
  },
  SK: (rng) => {
    for (;;) {
      const body =
        String(int(rng, 1, 9)) + String(int(rng, 0, 9)) + pick(rng, ['2', '3', '4', '7', '8', '9']) + digits(rng, 6);
      const base = Number(`${body}0`);
      for (let d = 0; d <= 9; d++) {
        if ((base + d) % 11 === 0) return `${body}${d}`;
      }
    }
  },
};

export const VAT_COUNTRIES: readonly string[] = Object.keys(SYNTHS);

/** A checksum-valid VAT number for one member state (with prefix). */
export function generateValidVatFor(country: string, seed: number): string {
  const rng = mulberry32(seed);
  return `${country}${SYNTHS[country]!(rng)}`;
}

/** A checksum-valid VAT number for a random member state. */
export function generateValidEuVat(seed: number): string {
  const rng = mulberry32(seed);
  const country = pick(rng, VAT_COUNTRIES);
  return `${country}${SYNTHS[country]!(rng)}`;
}
