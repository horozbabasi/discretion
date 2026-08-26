/**
 * Bech32 (BIP-173) and bech32m (BIP-350).
 *
 * The two differ ONLY in the final checksum constant — 1 for bech32,
 * 0x2bc830a3 for bech32m — and mixing them up validates nothing: segwit v0
 * addresses use bech32, v1+ (taproot) use bech32m, and Cardano Shelley
 * addresses use bech32 far beyond BIP-173's 90-character limit, which is why
 * decode() takes an explicit maxLength.
 */

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const CHAR_VALUES: ReadonlyMap<string, number> = new Map(
  [...CHARSET].map((ch, i) => [ch, i]),
);

const GENERATORS: readonly number[] = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

const BECH32_CONST = 1;
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: readonly number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GENERATORS[i]!;
    }
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const ch of hrp) out.push(ch.charCodeAt(0) >> 5);
  out.push(0);
  for (const ch of hrp) out.push(ch.charCodeAt(0) & 0x1f);
  return out;
}

export interface Bech32Decoded {
  readonly hrp: string;
  /** 5-bit data values, checksum stripped. */
  readonly data: readonly number[];
  readonly encoding: 'bech32' | 'bech32m';
}

/**
 * Decode a bech32/bech32m string, detecting which checksum closed it.
 * Null on mixed case, malformed structure, or checksum failure.
 */
export function bech32Decode(input: string, maxLength = 90): Bech32Decoded | null {
  if (input.length < 8 || input.length > maxLength) return null;
  const hasLower = /[a-z]/.test(input);
  const hasUpper = /[A-Z]/.test(input);
  if (hasLower && hasUpper) return null; // BIP-173: mixed case is invalid
  const s = input.toLowerCase();

  const sep = s.lastIndexOf('1');
  if (sep < 1 || sep + 7 > s.length) return null;
  const hrp = s.slice(0, sep);
  for (const ch of hrp) {
    const code = ch.charCodeAt(0);
    if (code < 33 || code > 126) return null;
  }

  const values: number[] = [];
  for (const ch of s.slice(sep + 1)) {
    const v = CHAR_VALUES.get(ch);
    if (v === undefined) return null;
    values.push(v);
  }

  const check = polymod([...hrpExpand(hrp), ...values]);
  const encoding = check === BECH32_CONST ? 'bech32' : check === BECH32M_CONST ? 'bech32m' : null;
  if (encoding === null) return null;

  return { hrp, data: values.slice(0, -6), encoding };
}

/** Encode 5-bit data under an hrp with the requested checksum variant. */
export function bech32Encode(
  hrp: string,
  data: readonly number[],
  encoding: 'bech32' | 'bech32m',
): string {
  const constant = encoding === 'bech32' ? BECH32_CONST : BECH32M_CONST;
  const values = [...hrpExpand(hrp), ...data];
  const target = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ constant;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((target >>> (5 * (5 - i))) & 0x1f);
  return `${hrp}1${[...data, ...checksum].map((v) => CHARSET[v]!).join('')}`;
}

/**
 * Regroup bits (5→8 for witness programs). Strict: rejects padding misuse.
 * Null on overflow or illegal residue.
 */
export function convertBits(
  data: readonly number[],
  from: number,
  to: number,
  pad: boolean,
): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    if (v < 0 || v >> from !== 0) return null;
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    return null;
  }
  return out;
}
