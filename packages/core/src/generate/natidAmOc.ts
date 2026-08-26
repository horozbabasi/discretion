/**
 * Valid-value generators for W2e national identifiers (Oceania, Americas,
 * Africa).
 */

import { luhnCheckDigit, toDigits, weightedSum, weightedMod, weightedModBy } from '../checksums/index.js';
import { curpCheckDigit } from '../detect/detectors/natid/mx.js';
import { rutCheckChar } from '../detect/detectors/natid/cl.js';
import { nitCheckDigit } from '../detect/detectors/natid/co.js';
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

export function generateValidTfn(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    // Solve the last digit so the weighted sum is divisible by 11.
    const eight = digits(rng, 8);
    const partial = weightedSum(toDigits(eight)!, [1, 4, 3, 7, 5, 8, 6, 9])!;
    // Last weight is 10: need (partial + 10·d) ≡ 0 (mod 11) → d ≡ partial·(10⁻¹≡10)… iterate.
    for (let d = 0; d <= 9; d++) {
      if ((partial + 10 * d) % 11 === 0) return `${eight}${d}`;
    }
    // No digit closes it (happens when partial ≡ 1 mod 11 needs d=10): redraw.
  }
}

export function generateValidMedicare(seed: number): string {
  const rng = mulberry32(seed);
  const eight = String(int(rng, 2, 6)) + digits(rng, 7);
  const check = weightedMod(toDigits(eight)!, [1, 3, 7, 9, 1, 3, 7, 9], 10)!;
  return `${eight}${check}${int(rng, 1, 9)}`;
}

export function generateValidAbn(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const body = String(int(rng, 1, 9)) + digits(rng, 9);
    const adjusted = [Number(body[0]) - 1, ...toDigits(body.slice(1))!];
    const partial = weightedSum(adjusted, [10, 1, 3, 5, 7, 9, 11, 13, 15, 17])!;
    for (let d = 0; d <= 9; d++) {
      if ((partial + 19 * d) % 89 === 0) return `${body}${d}`;
    }
  }
}

export function generateValidIrd(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const value = int(rng, 10_000_000, 150_000_000);
    const padded = String(value).padStart(9, '0');
    const payload = toDigits(padded.slice(0, 8))!;
    const r = weightedMod(payload, [3, 2, 7, 6, 5, 4, 3, 2], 11)!;
    let check = r === 0 ? 0 : 11 - r;
    if (check === 10) {
      const r2 = weightedMod(payload, [7, 4, 3, 2, 5, 2, 7, 6], 11)!;
      check = r2 === 0 ? 0 : 11 - r2;
      if (check === 10) continue;
    }
    if (check !== Number(padded[8])) continue; // draw a value whose real check matches
    return String(value);
  }
}

function brCheck(ds: readonly number[], start: number): number {
  const remainder = weightedModBy(ds, (i) => start - i, 11)!;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function generateValidCpf(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const nine = digits(rng, 9);
    if (/^(.)\1+$/.test(nine)) continue;
    const d = toDigits(nine)!;
    const c1 = brCheck(d, 10);
    const c2 = brCheck([...d, c1], 11);
    return `${nine}${c1}${c2}`;
  }
}

export function generateValidCnpj(seed: number): string {
  const rng = mulberry32(seed);
  const twelve = digits(rng, 8) + '0001'; // conventional head-office suffix
  const d = toDigits(twelve)!;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum1 = d.reduce((acc, digit, i) => acc + digit * w1[i]!, 0);
  const c1 = sum1 % 11 < 2 ? 0 : 11 - (sum1 % 11);
  const with13 = [...d, c1];
  const sum2 = with13.reduce((acc, digit, i) => acc + digit * w2[i]!, 0);
  const c2 = sum2 % 11 < 2 ? 0 : 11 - (sum2 % 11);
  return `${twelve}${c1}${c2}`;
}

const CURP_CONSONANTS = 'BCDFGHJKLMNPQRSTVWXYZ';
const MX_STATE_POOL = ['DF', 'JC', 'NL', 'MC', 'VZ', 'GT', 'PL', 'SR', 'NE'];

export function generateValidCurp(seed: number): string {
  const rng = mulberry32(seed);
  const vowels = 'AEIOU';
  const seventeen =
    pick(rng, [...CURP_CONSONANTS]) + pick(rng, [...vowels]) + pick(rng, [...CURP_CONSONANTS]) + pick(rng, [...CURP_CONSONANTS]) +
    pad2(int(rng, 0, 99)) + pad2(int(rng, 1, 12)) + pad2(int(rng, 1, 28)) +
    pick(rng, ['H', 'M']) + pick(rng, MX_STATE_POOL) +
    pick(rng, [...CURP_CONSONANTS]) + pick(rng, [...CURP_CONSONANTS]) + pick(rng, [...CURP_CONSONANTS]) +
    pick(rng, [...'0123456789A']);
  return `${seventeen}${curpCheckDigit(seventeen)!}`;
}

export function generateValidRfc(seed: number): string {
  const rng = mulberry32(seed);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 4; i++) s += letters[int(rng, 0, 25)];
  s += pad2(int(rng, 0, 99)) + pad2(int(rng, 1, 12)) + pad2(int(rng, 1, 28));
  for (let i = 0; i < 3; i++) s += pick(rng, [...'ABCDEFGHIJKLMNPQRSTUVWXYZ123456789']);
  return s;
}

const CUIT_PREFIX_POOL = ['20', '23', '24', '27', '30', '33'];

export function generateValidCuit(seed: number): string {
  const rng = mulberry32(seed);
  for (;;) {
    const ten = pick(rng, CUIT_PREFIX_POOL) + digits(rng, 8);
    const remainder = weightedMod(toDigits(ten)!, [5, 4, 3, 2, 7, 6, 5, 4, 3, 2], 11)!;
    let check = 11 - remainder;
    if (check === 11) check = 0;
    if (check === 10) continue;
    return `${ten.slice(0, 2)}-${ten.slice(2)}-${check}`;
  }
}

export function generateValidRut(seed: number): string {
  const rng = mulberry32(seed);
  const body = String(int(rng, 1_000_000, 25_999_999));
  const check = rutCheckChar(body)!;
  const dotted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${dotted}-${check}`;
}

export function generateValidNit(seed: number): string {
  const rng = mulberry32(seed);
  const body = String(int(rng, 10_000_000, 999_999_999));
  return `${body}-${nitCheckDigit(body)!}`;
}

export function generateValidPeDni(seed: number): string {
  const rng = mulberry32(seed);
  return `DNI ${digits(rng, 8)}`;
}

export function generateValidZaId(seed: number): string {
  const rng = mulberry32(seed);
  const payload =
    pad2(int(rng, 0, 99)) + pad2(int(rng, 1, 12)) + pad2(int(rng, 1, 28)) +
    String(int(rng, 0, 9999)).padStart(4, '0') + String(int(rng, 0, 2)) + String(int(rng, 0, 9));
  return `${payload}${luhnCheckDigit(payload)!}`;
}

export function generateValidNin(seed: number): string {
  const rng = mulberry32(seed);
  return `NIN: ${digits(rng, 11)}`;
}

export function generateValidKeId(seed: number): string {
  const rng = mulberry32(seed);
  return `ID No. ${digits(rng, 8)}`;
}

const EG_GOV_POOL = ['01', '02', '12', '21', '31', '88'];

export function generateValidEgId(seed: number): string {
  const rng = mulberry32(seed);
  return `${pick(rng, ['2', '3'])}${pad2(int(rng, 0, 99))}${pad2(int(rng, 1, 12))}${pad2(int(rng, 1, 28))}${pick(rng, EG_GOV_POOL)}${digits(rng, 4)}${int(rng, 0, 9)}`;
}

export function generateValidCnie(seed: number): string {
  const rng = mulberry32(seed);
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = rng() < 0.5 ? letters[int(rng, 0, 25)]! : letters[int(rng, 0, 25)]! + letters[int(rng, 0, 25)]!;
  return `CNIE: ${prefix}${digits(rng, 6)}`;
}
