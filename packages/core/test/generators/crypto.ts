/**
 * Valid-value generators for the crypto wallet family.
 *
 * Built from the SAME primitives the validators verify with — the
 * primitives are pinned to published vectors in crypto-primitives.test.ts,
 * so this is synthesis, not circularity. Chains with real checksums (BTC,
 * ETH mixed-case, LTC, TRX, XMR) get the mutation half of the property
 * standard; SOL and DOT are structural formats and skip it (stated in the
 * tests).
 */

import { keccak256 } from '../../src/crypto/keccak256.js';
import { base58CheckEncode, base58Encode } from '../../src/encoding/base58.js';
import { bech32Encode, convertBits } from '../../src/encoding/bech32.js';
import { moneroBase58Encode } from '../../src/encoding/base58monero.js';
import { toEip55 } from '../../src/detect/detectors/crypto/eth.js';
import { mulberry32 } from '../helpers.js';

function randomBytes(rng: () => number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = Math.floor(rng() * 256);
  return out;
}

/** A checksummed Bitcoin address: P2PKH, P2SH, segwit v0, or taproot. */
export function generateValidBtc(seed: number): string {
  const rng = mulberry32(seed);
  const kind = Math.floor(rng() * 4);
  if (kind === 0) return base58CheckEncode(0x00, randomBytes(rng, 20));
  if (kind === 1) return base58CheckEncode(0x05, randomBytes(rng, 20));
  if (kind === 2) {
    const program = randomBytes(rng, rng() < 0.5 ? 20 : 32);
    return bech32Encode('bc', [0, ...convertBits([...program], 8, 5, true)!], 'bech32');
  }
  const program = randomBytes(rng, 32);
  return bech32Encode('bc', [1, ...convertBits([...program], 8, 5, true)!], 'bech32m');
}

/** An EIP-55 checksummed Ethereum address. */
export function generateValidEth(seed: number): string {
  const rng = mulberry32(seed);
  const hexLower = [...randomBytes(rng, 20)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${toEip55(hexLower)}`;
}

/** A checksummed Litecoin address (L/M base58check or ltc1 segwit v0). */
export function generateValidLtc(seed: number): string {
  const rng = mulberry32(seed);
  const kind = Math.floor(rng() * 3);
  if (kind === 0) return base58CheckEncode(0x30, randomBytes(rng, 20));
  if (kind === 1) return base58CheckEncode(0x32, randomBytes(rng, 20));
  const program = randomBytes(rng, rng() < 0.5 ? 20 : 32);
  return bech32Encode('ltc', [0, ...convertBits([...program], 8, 5, true)!], 'bech32');
}

/** A checksummed Tron address. */
export function generateValidTrx(seed: number): string {
  const rng = mulberry32(seed);
  return base58CheckEncode(0x41, randomBytes(rng, 20));
}

/** A checksummed Monero address (standard or subaddress). */
export function generateValidXmr(seed: number): string {
  const rng = mulberry32(seed);
  const network = rng() < 0.5 ? 0x12 : 0x2a;
  const body = Uint8Array.from([network, ...randomBytes(rng, 64)]);
  const checksum = keccak256(body).slice(0, 4);
  return moneroBase58Encode(Uint8Array.from([...body, ...checksum]));
}

/** A structurally valid Solana address (32-byte key; no checksum exists). */
export function generateValidSol(seed: number): string {
  const rng = mulberry32(seed);
  const bytes = randomBytes(rng, 32);
  if (bytes.every((b) => b === 0)) bytes[0] = 1; // avoid the system program
  return base58Encode(bytes);
}

/** A checksummed Cardano Shelley address. */
export function generateValidAda(seed: number): string {
  const rng = mulberry32(seed);
  // 57 payload bytes ≈ a real Shelley base address envelope.
  const data = convertBits([...randomBytes(rng, 57)], 8, 5, true)!;
  return bech32Encode('addr', data, 'bech32');
}

/** A structurally valid Polkadot SS58 envelope (checksum bytes arbitrary). */
export function generateValidDot(seed: number): string {
  const rng = mulberry32(seed);
  return base58Encode(Uint8Array.from([0x00, ...randomBytes(rng, 34)]));
}
