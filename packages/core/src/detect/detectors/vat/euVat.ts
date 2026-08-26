/**
 * VAT_NUMBER — EU VAT identification numbers, all 27 member states.
 *
 * SPEC.md: "EU VAT numbers — per-country structure and checksum for all
 * member states." A VAT number is quoted WITH its country prefix (Greece
 * uses EL, not GR), which is what makes a single detector precise: the
 * prefix selects the national rule, and every country that publishes a
 * checksum has it verified here — many reusing the shared library (DE and
 * HR are ISO 7064 MOD 11,10; EL is the AFM power-of-two rule; IT and SE
 * close with Luhn; PL is the NIP weights; PT the NIF weights; IE the
 * PPS-style mod-23 letter). Countries whose personal-number fallbacks are
 * weaker (CZ 9-digit) accept those structurally, marked in metadata.
 *
 * Adding a member state (or successor scheme) is one entry in RULES.
 */

import {
  toDigits,
  isAllDigits,
  weightedSum,
  weightedMod,
  weightedModBy,
  cyclicWeightedMod,
  luhnValid,
  mod11_10Valid,
  modString,
} from '../../../checksums/index.js';
import { registerDetector } from '../../registry.js';
import { CONFIDENCE, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';

type VatCheck = (body: string) => boolean | 'structural';

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const MOD23 = 'WABCDEFGHIJKLMNOPQRSTUV';

/** Spanish NIF/NIE/CIF check, shared by the ES entry. */
function esVatValid(body: string): boolean {
  if (/^\d{8}[A-Z]$/.test(body)) {
    return body[8] === DNI_LETTERS[Number(body.slice(0, 8)) % 23];
  }
  if (/^[XYZ]\d{7}[A-Z]$/.test(body)) {
    const prefix = { X: '0', Y: '1', Z: '2' }[body[0] as 'X' | 'Y' | 'Z'];
    return body[8] === DNI_LETTERS[Number(`${prefix}${body.slice(1, 8)}`) % 23];
  }
  if (/^[A-HJ-NP-SUVW]\d{7}[0-9A-J]$/.test(body)) {
    let sum = 0;
    for (let i = 1; i <= 7; i++) {
      let v = Number(body[i]);
      if (i % 2 === 1) {
        v *= 2;
        if (v > 9) v -= 9;
      }
      sum += v;
    }
    const value = (10 - (sum % 10)) % 10;
    return body[8] === String(value) || body[8] === 'JABCDEFGHI'[value];
  }
  return false;
}

const RULES: Readonly<Record<string, VatCheck>> = {
  AT: (b) => {
    // 'U' + 8 digits; c = (10 − (s + 4) mod 10) mod 10 with alternating
    // 1,2 weights and digit-sum folding. Verified against ATU13585627.
    if (!/^U\d{8}$/.test(b)) return false;
    const d = toDigits(b.slice(1))!;
    let s = 0;
    for (let i = 0; i < 7; i++) {
      const product = d[i]! * (i % 2 === 0 ? 1 : 2);
      s += product > 9 ? product - 9 : product;
    }
    return (10 - ((s + 4) % 10)) % 10 === d[7];
  },
  BE: (b) => {
    if (!/^[01]\d{9}$/.test(b)) return false;
    return Number(b.slice(8)) === 97 - (Number(b.slice(0, 8)) % 97);
  },
  BG: (b) => {
    if (/^\d{9}$/.test(b)) {
      const d = toDigits(b)!;
      let r = weightedModBy(d.slice(0, 8), (i) => i + 1, 11)!;
      if (r === 10) {
        r = weightedModBy(d.slice(0, 8), (i) => i + 3, 11)!;
        if (r === 10) r = 0;
      }
      return r === d[8];
    }
    if (/^\d{10}$/.test(b)) {
      const d = toDigits(b)!;
      // Personal numbers: the PNF weight vector closes most; EGN-style
      // numbers are also legal — accept either closing rule.
      const pnf = weightedMod(d.slice(0, 9), [21, 19, 17, 13, 11, 9, 7, 3, 1], 10)!;
      if (pnf === d[9]) return true;
      let egn = weightedMod(d.slice(0, 9), [2, 4, 8, 5, 10, 9, 7, 3, 6], 11)!;
      if (egn === 10) egn = 0;
      return egn === d[9];
    }
    return false;
  },
  CY: (b) => {
    if (!/^\d{8}[A-Z]$/.test(b)) return false;
    const TRANSFORM = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      const d = Number(b[i]);
      sum += i % 2 === 0 ? TRANSFORM[d]! : d;
    }
    return b[8] === String.fromCharCode(65 + (sum % 26));
  },
  CZ: (b) => {
    if (/^\d{8}$/.test(b)) {
      const d = toDigits(b)!;
      const r = weightedModBy(d.slice(0, 7), (i) => 8 - i, 11)!;
      const c = r === 0 ? 1 : r === 1 ? 0 : 11 - r;
      return c === d[7];
    }
    if (/^\d{10}$/.test(b)) return Number(b) % 11 === 0; // rodné číslo form
    if (/^\d{9}$/.test(b)) return 'structural'; // pre-1954 personal, no check
    return false;
  },
  DE: (b) => /^\d{9}$/.test(b) && mod11_10Valid(b.slice(0, 8), b[8]!),
  DK: (b) => {
    if (!/^\d{8}$/.test(b)) return false;
    return weightedMod(toDigits(b)!, [2, 7, 6, 5, 4, 3, 2, 1], 11) === 0;
  },
  EE: (b) => {
    if (!/^\d{9}$/.test(b)) return false;
    const d = toDigits(b)!;
    const sum = cyclicWeightedMod(d.slice(0, 8), [3, 7, 1], 10)!;
    return (10 - sum) % 10 === d[8];
  },
  EL: (b) => {
    if (!/^\d{9}$/.test(b) || /^0+$/.test(b)) return false;
    const d = toDigits(b)!;
    return weightedModBy(d.slice(0, 8), (i) => 2 ** (8 - i), 11)! % 10 === d[8];
  },
  ES: esVatValid,
  FI: (b) => {
    if (!/^\d{8}$/.test(b)) return false;
    const d = toDigits(b)!;
    const r = weightedMod(d.slice(0, 7), [7, 9, 10, 5, 8, 4, 2], 11)!;
    if (r === 1) return false;
    return (r === 0 ? 0 : 11 - r) === d[7];
  },
  FR: (b) => {
    if (!/^[0-9A-Z]{2}\d{9}$/.test(b)) return false;
    const siren = b.slice(2);
    if (!luhnValid(siren)) return false;
    if (isAllDigits(b.slice(0, 2))) {
      return Number(b.slice(0, 2)) === (12 + 3 * (Number(siren) % 97)) % 97;
    }
    return 'structural'; // letter keys: no published arithmetic
  },
  HR: (b) => /^\d{11}$/.test(b) && mod11_10Valid(b.slice(0, 10), b[10]!),
  HU: (b) => {
    if (!/^\d{8}$/.test(b)) return false;
    const d = toDigits(b)!;
    const sum = weightedMod(d.slice(0, 7), [9, 7, 3, 1, 9, 7, 3], 10)!;
    return (10 - sum) % 10 === d[7];
  },
  IE: (b) => {
    const m = /^(\d{7})([A-W])([AH])?$/.exec(b);
    if (m === null) return false;
    let sum = weightedSum(toDigits(m[1]!)!, [8, 7, 6, 5, 4, 3, 2])!;
    if (m[3] !== undefined) sum += 9 * (m[3].charCodeAt(0) - 64);
    return m[2] === MOD23[sum % 23];
  },
  IT: (b) => /^\d{11}$/.test(b) && !/^0{7}/.test(b) && luhnValid(b),
  LT: (b) => {
    const twoPhase = (d: readonly number[], n: number): number => {
      let r = weightedModBy(d.slice(0, n), (i) => (i % 9) + 1, 11)!;
      if (r === 10) {
        r = weightedModBy(d.slice(0, n), (i) => ((i + 2) % 9) + 1, 11)!;
        if (r === 10) r = 0;
      }
      return r;
    };
    if (/^\d{9}$/.test(b)) {
      const d = toDigits(b)!;
      return twoPhase(d, 8) === d[8];
    }
    if (/^\d{12}$/.test(b)) {
      const d = toDigits(b)!;
      return twoPhase(d, 11) === d[11];
    }
    return false;
  },
  LU: (b) => /^\d{8}$/.test(b) && Number(b.slice(0, 6)) % 89 === Number(b.slice(6)),
  LV: (b) => {
    if (!/^\d{11}$/.test(b)) return false;
    const d = toDigits(b)!;
    let sum = 0;
    const weights = [9, 1, 4, 8, 3, 10, 2, 5, 7, 6];
    for (let i = 0; i < 10; i++) sum += d[i]! * weights[i]!;
    const c = (((3 - sum) % 11) + 11) % 11;
    if (c === 10) return false;
    return c === d[10];
  },
  MT: (b) => {
    if (!/^\d{8}$/.test(b)) return false;
    const d = toDigits(b)!;
    const r = weightedMod(d.slice(0, 6), [3, 4, 6, 7, 8, 9], 37)!;
    const expected = 37 - r === 0 ? 37 : 37 - r;
    return expected === Number(b.slice(6));
  },
  NL: (b) => {
    if (!/^\d{9}B\d{2}$/.test(b)) return false;
    const d = toDigits(b.slice(0, 9))!;
    const r = weightedModBy(d.slice(0, 8), (i) => 9 - i, 11)!;
    if (r !== 10 && r === d[8]) return true;
    // Post-2020 sole traders: base-36 mod-97 over "NL" + the full body.
    const numeric = [...`NL${b}`]
      .map((ch) => (/\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)))
      .join('');
    return modString(numeric, 97) === 1;
  },
  PL: (b) => {
    if (!/^\d{10}$/.test(b)) return false;
    const d = toDigits(b)!;
    const r = weightedMod(d.slice(0, 9), [6, 5, 7, 2, 3, 4, 5, 6, 7], 11)!;
    return r !== 10 && r === d[9];
  },
  PT: (b) => {
    if (!/^\d{9}$/.test(b)) return false;
    const d = toDigits(b)!;
    const r = weightedModBy(d.slice(0, 8), (i) => 9 - i, 11)!;
    return (r < 2 ? 0 : 11 - r) === d[8];
  },
  RO: (b) => {
    if (!/^\d{2,10}$/.test(b) || b[0] === '0') return false;
    const padded = b.padStart(10, '0');
    const d = toDigits(padded)!;
    const sum = weightedMod(d.slice(0, 9), [7, 5, 3, 2, 1, 7, 5, 3, 2], 11)!;
    return ((sum * 10) % 11) % 10 === d[9];
  },
  SE: (b) => /^\d{10}01$/.test(b) && luhnValid(b.slice(0, 10)),
  SI: (b) => {
    if (!/^[1-9]\d{7}$/.test(b)) return false;
    const d = toDigits(b)!;
    const r = weightedModBy(d.slice(0, 7), (i) => 8 - i, 11)!;
    const c = 11 - r;
    if (c === 10) return false;
    return (c === 11 ? 0 : c) === d[7];
  },
  SK: (b) => /^[1-9]\d[234789]\d{7}$/.test(b) && Number(b) % 11 === 0,
};

const PREFIXES = Object.keys(RULES).join('|');

registerDetector({
  id: 'eu-vat',
  entityType: 'VAT_NUMBER',
  regions: [
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'GR', 'ES', 'FI', 'FR', 'HR',
    'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
  ],
  pattern: new RegExp(`\\b(${PREFIXES})[ ]?([0-9A-Z]{2,13})\\b`, 'g'),
  baseConfidence: CONFIDENCE.HIGH,
  description: 'EU VAT numbers: per-country structure and checksum for all 27 member states.',
  validate(ctx: ValidationContext): ValidationResult {
    const country = ctx.match[1]!;
    const body = ctx.match[2]!;
    const rule = RULES[country];
    if (rule === undefined) return invalid('not a member-state prefix');

    const result = rule(body);
    if (result === false) return invalid('national VAT rule failed');

    return valid({
      canonical: `${country}${body}`,
      ...(result === 'structural' ? { confidence: CONFIDENCE.MEDIUM } : {}),
      metadata: {
        country: country === 'EL' ? 'GR' : country,
        ...(result === 'structural' ? { checksum: 'structural-only' } : {}),
      },
      validator: result === 'structural' ? 'vat-structure' : 'vat-checksum',
    });
  },
});
