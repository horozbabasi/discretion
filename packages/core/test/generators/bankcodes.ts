/**
 * Valid-value generators for the national bank-code family.
 *
 * US routing numbers carry the ABA checksum, so their property test runs the
 * full mutation half. The rest are structure-only formats (stated in each
 * detector); their properties assert validation without mutation.
 */

import { abaCheckDigit } from '../../src/checksums/index.js';
import { mulberry32 } from '../helpers.js';

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function digits(rng: () => number, count: number): string {
  let out = '';
  for (let i = 0; i < count; i++) out += String(int(rng, 0, 9));
  return out;
}

/** Valid Federal Reserve prefixes (mirrors the detector's rule). */
const FRB_PREFIXES = [
  ...Array.from({ length: 12 }, (_, i) => i + 1),
  ...Array.from({ length: 12 }, (_, i) => i + 21),
  ...Array.from({ length: 12 }, (_, i) => i + 61),
  80,
];

/** An ABA-checksummed routing number with a valid FRB prefix. */
export function generateValidRouting(seed: number): string {
  const rng = mulberry32(seed);
  const prefix = String(pick(rng, FRB_PREFIXES)).padStart(2, '0');
  const payload = prefix + digits(rng, 6);
  return `${payload}${abaCheckDigit(payload)!}`;
}

/** A UK sort code in 00-00-00 notation (no checksum exists). */
export function generateValidSortCode(seed: number): string {
  const rng = mulberry32(seed);
  return `${digits(rng, 2)}-${digits(rng, 2)}-${digits(rng, 2)}`;
}

/** Institution numbers mirrored from the detector's Payments Canada table. */
const CA_INSTITUTIONS = ['001', '002', '003', '004', '006', '010', '016', '030', '219', '614', '623', '809', '815', '837'];

/** A Canadian transit number with a known institution. */
export function generateValidTransit(seed: number): string {
  const rng = mulberry32(seed);
  return `${digits(rng, 5)}-${pick(rng, CA_INSTITUTIONS)}`;
}

/** An Australian BSB in XXX-XXX notation (no checksum exists). */
export function generateValidBsb(seed: number): string {
  const rng = mulberry32(seed);
  return `${digits(rng, 3)}-${digits(rng, 3)}`;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** An IFSC with the mandatory zero and at least one digit in the branch. */
export function generateValidIfsc(seed: number): string {
  const rng = mulberry32(seed);
  let bank = '';
  for (let i = 0; i < 4; i++) bank += LETTERS[int(rng, 0, 25)]!;
  // Branch: mostly numeric, as issued in practice; always ≥1 digit.
  return `${bank}0${digits(rng, 6)}`;
}

const AGENCIA_LABELS = ['ag.', 'Ag.', 'agência', 'Agência', 'agencia', 'ag'];

/** A labeled Brazilian agência, sometimes with its display check digit. */
export function generateValidAgencia(seed: number): string {
  const rng = mulberry32(seed);
  const label = pick(rng, AGENCIA_LABELS);
  const check = rng() < 0.4 ? `-${int(rng, 0, 9)}` : '';
  return `${label} ${digits(rng, 4)}${check}`;
}
