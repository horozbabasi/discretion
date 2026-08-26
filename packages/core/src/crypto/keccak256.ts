/**
 * Keccak-256 — the ORIGINAL Keccak submission padding (0x01), NOT the
 * standardized SHA3-256 (0x06). Ethereum's EIP-55 address checksum and
 * Monero's address checksum both use original Keccak; using SHA3 here would
 * silently break every EIP-55 verification while still "looking like a
 * hash". The pinned vectors in test/crypto.test.ts are Keccak vectors
 * specifically, so a padding mix-up cannot survive the tests.
 *
 * Lanes are BigInt: this is validation-only code on short inputs, and the
 * BigInt formulation reads like the specification instead of like paired
 * 32-bit register juggling.
 */

const MASK64 = (1n << 64n) - 1n;

const ROUND_CONSTANTS: readonly bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rho rotation offsets, indexed x + 5y. */
const RHO: readonly number[] = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const rotl = (a: bigint, n: number): bigint =>
  ((a << BigInt(n)) | (a >> BigInt(64 - n))) & MASK64;

function permute(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // θ
    const c: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      c.push(state[x]! ^ state[x + 5]! ^ state[x + 10]! ^ state[x + 15]! ^ state[x + 20]!);
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5]! ^ rotl(c[(x + 1) % 5]!, 1);
      for (let y = 0; y < 25; y += 5) state[x + y] = state[x + y]! ^ d;
    }
    // ρ and π
    const b: bigint[] = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y]!, RHO[x + 5 * y]!);
      }
    }
    // χ
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 25; y += 5) {
        state[x + y] = b[x + y]! ^ (~b[((x + 1) % 5) + y]! & MASK64 & b[((x + 2) % 5) + y]!);
      }
    }
    // ι
    state[0] = state[0]! ^ ROUND_CONSTANTS[round]!;
  }
}

const RATE = 136; // 1088-bit rate for 256-bit output

/** Keccak-256 digest of `input`. */
export function keccak256(input: Uint8Array): Uint8Array {
  const state: bigint[] = new Array<bigint>(25).fill(0n);

  // Multi-rate padding with the ORIGINAL 0x01 domain byte.
  const padded = new Uint8Array(Math.ceil((input.length + 1) / RATE) * RATE);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] = padded[padded.length - 1]! | 0x80;

  for (let off = 0; off < padded.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) {
        lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]!);
      }
      state[i] = state[i]! ^ lane;
    }
    permute(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = state[i]!;
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}
