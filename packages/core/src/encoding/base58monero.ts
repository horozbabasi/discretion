/**
 * Monero's base58 variant.
 *
 * Monero does NOT use Bitcoin's stream base58: it encodes fixed 8-byte
 * blocks as exactly 11 characters (padding with the alphabet's zero, '1'),
 * with a shorter final block whose decoded size is determined by its
 * encoded length. The alphabet itself is Bitcoin's. A standard address is
 * 95 characters = 8 full blocks + one 7-character tail, decoding to 69
 * bytes: network byte ‖ two 32-byte keys ‖ 4-byte Keccak-256 checksum.
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const VALUES: ReadonlyMap<string, bigint> = new Map(
  [...ALPHABET].map((ch, i) => [ch, BigInt(i)]),
);

const FULL_ENCODED = 11;
const FULL_DECODED = 8;

/** decoded byte count for a partial block, indexed by encoded length. */
const PARTIAL_DECODED: readonly (number | null)[] = [
  0, null, 1, 2, 3, 4, null, 5, 6, 7, null,
];

function decodeBlock(block: string, decodedSize: number): Uint8Array | null {
  let acc = 0n;
  for (const ch of block) {
    const v = VALUES.get(ch);
    if (v === undefined) return null;
    acc = acc * 58n + v;
  }
  const max = 1n << BigInt(8 * decodedSize);
  if (acc >= max) return null; // overflows the declared block size
  const out = new Uint8Array(decodedSize);
  for (let i = decodedSize - 1; i >= 0; i--) {
    out[i] = Number(acc & 0xffn);
    acc >>= 8n;
  }
  return out;
}

/** Decode a Monero base58 string to bytes; null on malformed input. */
export function moneroBase58Decode(s: string): Uint8Array | null {
  if (s.length === 0) return null;
  const fullBlocks = Math.floor(s.length / FULL_ENCODED);
  const tailLength = s.length % FULL_ENCODED;
  const tailDecoded = PARTIAL_DECODED[tailLength];
  if (tailDecoded === null || tailDecoded === undefined) return null;

  const out = new Uint8Array(fullBlocks * FULL_DECODED + tailDecoded);
  for (let i = 0; i < fullBlocks; i++) {
    const block = decodeBlock(s.slice(i * FULL_ENCODED, (i + 1) * FULL_ENCODED), FULL_DECODED);
    if (block === null) return null;
    out.set(block, i * FULL_DECODED);
  }
  if (tailLength > 0) {
    const block = decodeBlock(s.slice(fullBlocks * FULL_ENCODED), tailDecoded);
    if (block === null) return null;
    out.set(block, fullBlocks * FULL_DECODED);
  }
  return out;
}

/** Encoded char count for a partial block, indexed by decoded length. */
const PARTIAL_ENCODED: readonly number[] = [0, 2, 3, 5, 6, 7, 9, 10];

function encodeBlock(bytes: Uint8Array, encodedSize: number): string {
  let acc = 0n;
  for (const b of bytes) acc = (acc << 8n) | BigInt(b);
  let out = '';
  for (let i = 0; i < encodedSize; i++) {
    out = ALPHABET[Number(acc % 58n)]! + out;
    acc /= 58n;
  }
  return out;
}

/** Encode bytes in Monero's block-wise base58. */
export function moneroBase58Encode(bytes: Uint8Array): string {
  const fullBlocks = Math.floor(bytes.length / FULL_DECODED);
  const tail = bytes.length % FULL_DECODED;
  let out = '';
  for (let i = 0; i < fullBlocks; i++) {
    out += encodeBlock(bytes.slice(i * FULL_DECODED, (i + 1) * FULL_DECODED), FULL_ENCODED);
  }
  if (tail > 0) {
    out += encodeBlock(bytes.slice(fullBlocks * FULL_DECODED), PARTIAL_ENCODED[tail]!);
  }
  return out;
}
