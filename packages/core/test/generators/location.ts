/**
 * Valid-value generators for the location family. All three formats are
 * structural (no checksums), so the properties assert validation without
 * the mutation half — stated in the tests.
 */

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

/** A postal code satisfying at least one country's format. */
export function generateValidPostal(seed: number): string {
  const rng = mulberry32(seed);
  const CA_FIRST = 'ABCEGHJKLMNPRSTVXY';
  const CA_REST = 'ABCEGHJKLMNPRSTVWXYZ';
  const shapes: readonly (() => string)[] = [
    () => `${digits(rng, 5)}`, // DE/FR/US/TR…
    () => `${digits(rng, 5)}-${digits(rng, 4)}`, // US ZIP+4
    () => `${digits(rng, 2)}-${digits(rng, 3)}`, // PL
    () => `${digits(rng, 4)}-${digits(rng, 3)}`, // PT
    () => `${digits(rng, 5)}-${digits(rng, 3)}`, // BR
    () => `${digits(rng, 3)}-${digits(rng, 4)}`, // JP
    () => `${digits(rng, 4)} ${pick(rng, ['AB', 'CD', 'XZ', 'JK'])}`, // NL
    () => `SW1A 1AA`, // GB, fixed shape
    () => `${pick(rng, [...CA_FIRST])}${int(rng, 0, 9)}${pick(rng, [...CA_REST])} ${int(rng, 0, 9)}${pick(rng, [...CA_REST])}${int(rng, 0, 9)}`, // CA
    () => `${digits(rng, 6)}`, // CN/IN/SG/RU
  ];
  const value = pick(rng, shapes)();
  // The 4-digit shape can collide with the year guard; regenerate as 5-digit.
  if (/^\d{4}$/.test(value)) return `${value}0`;
  return value;
}

const WESTERN = ['Baker Street', 'Pennsylvania Avenue', 'Abbey Road', 'Elm Drive'];
const GERMANIC = ['Hauptstraße', 'Bahnhofstraße', 'Prinsengracht', 'Ringallee'];
const ROMANCE_T = ['rue', 'avenida', 'via', 'calle'];
const ROMANCE_N = ['de la Paix', 'Mayor', 'Roma', 'del Sol'];
const TURKISH_N = ['Atatürk', 'Cumhuriyet', 'İstiklal'];
const TURKISH_T = ['Caddesi', 'Sokak', 'Bulvarı'];

/** A street address in one of the six conventions. */
export function generateValidStreet(seed: number): string {
  const rng = mulberry32(seed);
  const shapes: readonly (() => string)[] = [
    () => `${int(rng, 1, 9999)} ${pick(rng, WESTERN)}`,
    () => `${int(rng, 1, 999)} ${pick(rng, ROMANCE_T)} ${pick(rng, ROMANCE_N)}`,
    () => `${pick(rng, GERMANIC)} ${int(rng, 1, 200)}`,
    () => `${pick(rng, TURKISH_N)} ${pick(rng, TURKISH_T)} No: ${int(rng, 1, 200)}`,
    () => `中山路${int(rng, 1, 999)}号`,
    () => `銀座${int(rng, 1, 9)}丁目${int(rng, 1, 20)}番${int(rng, 1, 20)}号`,
    () => `세종대로 ${int(rng, 1, 500)}`,
    () => `شارع الملك فهد ${int(rng, 1, 200)}`,
  ];
  return pick(rng, shapes)();
}

/** An in-range coordinate pair, decimal or DMS. */
export function generateValidCoordinates(seed: number): string {
  const rng = mulberry32(seed);
  const lat = (rng() * 178 - 89).toFixed(int(rng, 3, 6));
  const lon = (rng() * 358 - 179).toFixed(int(rng, 3, 6));
  if (rng() < 0.6) {
    return `${lat}, ${lon}`;
  }
  const latD = int(rng, 0, 89);
  const lonD = int(rng, 0, 179);
  return `${latD}°${int(rng, 0, 59)}′${int(rng, 0, 59)}″${pick(rng, ['N', 'S'])} ${lonD}°${int(rng, 0, 59)}′${int(rng, 0, 59)}″${pick(rng, ['E', 'W'])}`;
}
