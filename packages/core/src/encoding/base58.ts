/**
 * Base58 and base58check (Bitcoin alphabet).
 *
 * Decoding goes through BigInt — short inputs, validation-only, and the
 * arithmetic formulation is obviously faithful to the definition. Leading
 * '1' characters map to leading zero bytes, which matters: the Bitcoin
 * genesis address starts with one.
 */

import { sha256d } from '../crypto/sha256.js';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const VALUES: ReadonlyMap<string, bigint> = new Map(
  [...ALPHABET].map((ch, i) => [ch, BigInt(i)]),
);

/** Decode base58 to bytes; null on any non-alphabet character. */
export function base58Decode(s: string): Uint8Array | null {
  if (s.length === 0) return null;
  let acc = 0n;
  for (const ch of s) {
    const v = VALUES.get(ch);
    if (v === undefined) return null;
    acc = acc * 58n + v;
  }
  const body: number[] = [];
  while (acc > 0n) {
    body.push(Number(acc & 0xffn));
    acc >>= 8n;
  }
  body.reverse();
  let leadingZeros = 0;
  for (const ch of s) {
    if (ch !== '1') break;
    leadingZeros++;
  }
  return Uint8Array.from([...new Array<number>(leadingZeros).fill(0), ...body]);
}

/** Encode bytes as base58. */
export function base58Encode(bytes: Uint8Array): string {
  let acc = 0n;
  for (const b of bytes) acc = (acc << 8n) | BigInt(b);
  let out = '';
  while (acc > 0n) {
    out = ALPHABET[Number(acc % 58n)]! + out;
    acc /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

export interface Base58CheckResult {
  /** The version byte. */
  readonly version: number;
  /** Payload between the version byte and the checksum. */
  readonly payload: Uint8Array;
}

/**
 * Decode and verify a base58check string: version ‖ payload ‖ first four
 * bytes of SHA-256d(version ‖ payload). Null when the checksum fails.
 */
export function base58CheckDecode(s: string): Base58CheckResult | null {
  const bytes = base58Decode(s);
  if (bytes === null || bytes.length < 5) return null;
  const body = bytes.slice(0, bytes.length - 4);
  const checksum = bytes.slice(bytes.length - 4);
  const expected = sha256d(body);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) return null;
  }
  return { version: body[0]!, payload: body.slice(1) };
}

/** Encode version ‖ payload with its base58check checksum. */
export function base58CheckEncode(version: number, payload: Uint8Array): string {
  const body = Uint8Array.from([version, ...payload]);
  const checksum = sha256d(body).slice(0, 4);
  return base58Encode(Uint8Array.from([...body, ...checksum]));
}
