/**
 * Valid-value generators for the documents & health family.
 *
 * The MRZ generator is the important one: it assembles a TD3 (or TD1) zone
 * and computes every ICAO check digit with the shared library, exactly the
 * way M3's corpus generator will synthesize labeled passports. MRZ, VIN,
 * NPI and SNOMED carry real checksums → full mutation properties. UK DVLA
 * and lab results are structural.
 */

import { mrzCheckDigit } from '../../src/checksums/index.js';
import { luhnCheckDigit, verhoeffCheckDigit } from '../../src/checksums/index.js';
import { vinCheckChar } from '../../src/detect/detectors/documents/vin.js';
import { mulberry32 } from '../helpers.js';

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

function chars(rng: () => number, alphabet: string, n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[Math.floor(rng() * alphabet.length)]!;
  return out;
}

const STATES = ['UTO', 'DEU', 'FRA', 'TUR', 'JPN', 'BRA', 'IND', 'USA', 'GBR', 'NLD'];
const SURNAMES = ['ERIKSSON', 'YILMAZ', 'TANAKA', 'SILVA', 'MUELLER', 'GARCIA', 'KOWALSKI'];
const GIVEN = ['ANNA', 'MEHMET', 'YUKI', 'LUCIA', 'HANS', 'PRIYA', 'JAN'];

function mrzDate(rng: () => number, startYear: number, endYear: number): string {
  const y = int(rng, startYear, endYear) % 100;
  const m = int(rng, 1, 12);
  const d = int(rng, 1, 28);
  return `${String(y).padStart(2, '0')}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

const pad = (s: string, n: number): string => (s + '<'.repeat(n)).slice(0, n);

/** A TD3 passport MRZ (two 44-char lines) with every check digit correct. */
export function generateValidTd3(seed: number): string {
  const rng = mulberry32(seed);
  const state = pick(rng, STATES);
  const name = pad(`${pick(rng, SURNAMES)}<<${pick(rng, GIVEN)}`, 39);
  const line1 = `P<${state}${name}`;

  const docNumber = pad(chars(rng, AZ, 2) + chars(rng, DIGITS, 7), 9);
  const docCheck = mrzCheckDigit(docNumber)!;
  const nationality = state;
  const birth = mrzDate(rng, 1950, 2005);
  const birthCheck = mrzCheckDigit(birth)!;
  const sex = pick(rng, ['M', 'F', '<']);
  const expiry = mrzDate(rng, 2025, 2035);
  const expiryCheck = mrzCheckDigit(expiry)!;
  const optional = pad('', 14);
  const optionalCheck = mrzCheckDigit(optional)!;
  const composite = `${docNumber}${docCheck}${birth}${birthCheck}${expiry}${expiryCheck}${optional}${optionalCheck}`;
  const compositeCheck = mrzCheckDigit(composite)!;

  const line2 = `${docNumber}${docCheck}${nationality}${birth}${birthCheck}${sex}${expiry}${expiryCheck}${optional}${optionalCheck}${compositeCheck}`;
  return `${line1}\n${line2}`;
}

/** A TD1 identity-card MRZ (three 30-char lines), all check digits correct. */
export function generateValidTd1(seed: number): string {
  const rng = mulberry32(seed);
  const state = pick(rng, STATES);

  const docNumber = pad(chars(rng, AZ, 1) + chars(rng, DIGITS, 8), 9);
  const docCheck = mrzCheckDigit(docNumber)!;
  const optional1 = pad('', 15);
  const line1 = `I<${state}${docNumber}${docCheck}${optional1}`;

  const birth = mrzDate(rng, 1950, 2005);
  const birthCheck = mrzCheckDigit(birth)!;
  const sex = pick(rng, ['M', 'F']);
  const expiry = mrzDate(rng, 2025, 2035);
  const expiryCheck = mrzCheckDigit(expiry)!;
  const nationality = state;
  const optional2 = pad('', 11);
  const composite = `${docNumber}${docCheck}${optional1}${birth}${birthCheck}${expiry}${expiryCheck}${optional2}`;
  const compositeCheck = mrzCheckDigit(composite)!;
  const line2 = `${birth}${birthCheck}${sex}${expiry}${expiryCheck}${nationality}${optional2}${compositeCheck}`;

  const name = pad(`${pick(rng, SURNAMES)}<<${pick(rng, GIVEN)}`, 30);
  return `${line1}\n${line2}\n${name}`;
}

/** A VIN whose ISO 3779 check digit is correct. */
export function generateValidVin(seed: number): string {
  const rng = mulberry32(seed);
  const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let vin = chars(rng, alphabet, 8) + '0' + chars(rng, alphabet, 8);
  const check = vinCheckChar(vin)!;
  vin = vin.slice(0, 8) + check + vin.slice(9);
  return vin;
}

/** An NPI with the 80840-prefixed Luhn check digit correct. */
export function generateValidNpi(seed: number): string {
  const rng = mulberry32(seed);
  const payload = pick(rng, ['1', '2']) + chars(rng, DIGITS, 8);
  const check = luhnCheckDigit(`80840${payload}`)!;
  return `${payload}${check}`;
}

/** A UK DVLA licence number obeying the date rules. */
export function generateValidDvla(seed: number): string {
  const rng = mulberry32(seed);
  const surname = pad(pick(rng, SURNAMES).slice(0, 5), 5).replace(/</g, '9');
  const decade = String(int(rng, 5, 9));
  const month = int(rng, 1, 12) + (rng() < 0.5 ? 50 : 0);
  const day = int(rng, 1, 28);
  const year = String(int(rng, 0, 9));
  const initials = chars(rng, AZ, 2);
  return `${surname}${decade}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${year}${initials}${int(rng, 0, 9)}${chars(rng, AZ, 2)}`;
}

/** A SNOMED SCTID: defined partition pair, closed with Verhoeff. */
export function generateValidSctid(seed: number): string {
  const rng = mulberry32(seed);
  const body = chars(rng, DIGITS, int(rng, 5, 12));
  const partition = pick(rng, ['00', '01', '10']);
  const payload = `${body}${partition}`;
  return `${payload}${verhoeffCheckDigit(payload)!}`;
}

/** A lab-result phrase: value, unit, bracketed reference range. */
export function generateValidLabResult(seed: number): string {
  const rng = mulberry32(seed);
  const units = ['mg/dL', 'mmol/L', 'g/dL', 'IU/L', 'ng/mL', '%'];
  const value = (int(rng, 40, 400) / (rng() < 0.5 ? 1 : 10)).toFixed(1);
  const lo = int(rng, 1, 80);
  const hi = lo + int(rng, 5, 120);
  return `${value} ${pick(rng, units)} [${lo}-${hi}]`;
}
