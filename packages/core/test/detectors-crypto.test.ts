/**
 * Crypto wallet family: BTC, ETH, LTC, XMR, SOL, TRX, ADA, DOT.
 *
 * Chains with real checksums (BTC, mixed-case ETH, LTC, TRX, XMR, ADA
 * Shelley) run the full property standard including single-character
 * mutation. SOL and DOT are structural formats — no checksum exists (SOL)
 * or it is deliberately unverified (DOT, ARCHITECTURE.md D9) — so their
 * properties assert validation only, and their confidence is MEDIUM, which
 * is itself asserted.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/crypto/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, Stage1Candidate } from '../src/detect/types.js';
import {
  generateValidBtc,
  generateValidEth,
  generateValidLtc,
  generateValidTrx,
  generateValidXmr,
  generateValidSol,
  generateValidAda,
  generateValidDot,
} from './generators/crypto.js';

const btc = getDetector('crypto-btc')!;
const eth = getDetector('crypto-eth')!;
const ltc = getDetector('crypto-ltc')!;
const xmr = getDetector('crypto-xmr')!;
const sol = getDetector('crypto-sol')!;
const trx = getDetector('crypto-trx')!;
const ada = getDetector('crypto-ada')!;
const dot = getDetector('crypto-dot')!;

function scan(text: string, detector: Detector): Stage1Candidate[] {
  return runStage1(normalize(text), { detectors: [detector] });
}

function only(text: string, detector: Detector): Stage1Candidate {
  const found = scan(text, detector);
  expect(found, `expected exactly one candidate in: ${text}`).toHaveLength(1);
  return found[0]!;
}

function none(text: string, detector: Detector): void {
  expect(scan(text, detector), `expected no candidate in: ${text}`).toHaveLength(0);
}

const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BECH32_CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** Replace char i with a different char from the given alphabet. */
function mutateIn(value: string, i: number, alphabet: string, salt: number): string {
  const current = value[i]!;
  let replacement = alphabet[(alphabet.indexOf(current) + 1 + (salt % (alphabet.length - 1))) % alphabet.length]!;
  if (replacement === current) replacement = alphabet[(alphabet.indexOf(current) + 1) % alphabet.length]!;
  return value.slice(0, i) + replacement + value.slice(i + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// BTC
// ─────────────────────────────────────────────────────────────────────────────

describe('crypto-btc', () => {
  it('accepts all four address families', () => {
    const genesis = only('sent to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa early', btc);
    expect(genesis.metadata?.['kind']).toBe('p2pkh');
    expect(genesis.sensitive).toBe(false); // tutorial-ubiquitous constant

    expect(only('to 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy now', btc).metadata?.['kind']).toBe('p2sh');
    const segwit = only('bc bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 addr', btc);
    expect(segwit.metadata?.['kind']).toBe('segwit-v0');
    const taproot = only('tr bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297 out', btc);
    expect(taproot.metadata?.['kind']).toBe('segwit-v1');
  });

  it('rejects checksum and encoding-rule violations (more invalid than valid)', () => {
    none('to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb typo', btc);
    none('to 1A1zP1eP5QGefj2DMPTfTL5SLmv7DivfNa typo', btc);
    none('to 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLz typo', btc);
    none('bc bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5 bad', btc);
    // Taproot written with bech32 instead of bech32m must be rejected —
    // BIP-350's central rule.
    none('tr bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 wrongenc', btc);
    none('tb tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx testnet-hrp', btc);
  });

  it('PROPERTY: generated addresses validate; single-character mutation fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const addr = generateValidBtc(seed);
        expect(scan(`pay ${addr} ok`, btc), addr).toHaveLength(1);
        const isBech = addr.startsWith('bc1');
        // Mutate past the fixed prefix (version char / hrp+separator).
        const from = isBech ? 4 : 1;
        const idx = from + (idxSeed % (addr.length - from));
        const mutated = mutateIn(addr, idx, isBech ? BECH32_CHARS : BASE58_CHARS, idxSeed);
        expect(scan(`pay ${mutated} ok`, btc), mutated).toHaveLength(0);
      }),
      { numRuns: 400 },
    );
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'paid​ to 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa in 2009';
    const found = runStage1(normalize(original), { detectors: [btc] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ETH
// ─────────────────────────────────────────────────────────────────────────────

describe('crypto-eth', () => {
  it('verifies the published EIP-55 vectors at HIGH', () => {
    for (const addr of [
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
      '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
      '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
    ]) {
      const c = only(`send ${addr} eth`, eth);
      expect(c.rawConfidence).toBe(CONFIDENCE.HIGH);
      expect(c.metadata?.['checksum']).toBe('eip55');
    }
  });

  it('accepts uncased writings at MEDIUM (no checksum exists to verify)', () => {
    const c = only('send 0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed eth', eth);
    expect(c.rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(c.metadata?.['checksum']).toBe('none');
    only('send 0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED eth', eth);
  });

  it('classifies the zero address non-sensitive', () => {
    expect(only('burn 0x0000000000000000000000000000000000000000 target', eth).sensitive).toBe(false);
  });

  it('rejects EIP-55 violations and malformed hex (more invalid than valid)', () => {
    none('bad 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD case', eth); // last d→D
    none('bad 0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed case', eth); // first a→A
    none('short 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe run', eth);
    none('long 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed7 run', eth);
    none('hash 0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658 tx', eth); // 64 hex = tx hash
    none('word 0xThisIsNotHexButFortyCharsLong0000000000 x', eth);
  });

  it('PROPERTY: generated EIP-55 addresses validate; one case-flip fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const addr = generateValidEth(seed);
        expect(scan(`to ${addr} ok`, eth), addr).toHaveLength(1);
        // Flip the case of one hex LETTER: the lowercase form is unchanged,
        // so the expected case pattern is unchanged, and the flipped letter
        // now violates it — guaranteed rejection.
        const letters = [...addr.slice(2)].flatMap((ch, i) => (/[a-fA-F]/.test(ch) ? [i + 2] : []));
        if (letters.length === 0) return; // astronomically rare all-digit address
        const i = letters[idxSeed % letters.length]!;
        const ch = addr[i]!;
        const flipped = addr.slice(0, i) + (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()) + addr.slice(i + 1);
        // The flip may produce an all-one-case string only if exactly one
        // letter existed; that degenerates to MEDIUM acceptance, so require
        // ≥2 letters for the guaranteed-rejection half.
        if (letters.length >= 2) {
          expect(scan(`to ${flipped} ok`, eth), flipped).toHaveLength(0);
        }
      }),
      { numRuns: 400 },
    );
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'refund​ to 0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed asap';
    const found = runStage1(normalize(original), { detectors: [eth] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LTC / TRX / XMR — checksummed chains
// ─────────────────────────────────────────────────────────────────────────────

describe('crypto-ltc', () => {
  it('accepts generated L/M/ltc1 addresses and rejects mutations', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const addr = generateValidLtc(seed);
        expect(scan(`pay ${addr} ok`, ltc), addr).toHaveLength(1);
        const isBech = addr.startsWith('ltc1');
        const from = isBech ? 5 : 1;
        const idx = from + (idxSeed % (addr.length - from));
        const mutated = mutateIn(addr, idx, isBech ? BECH32_CHARS : BASE58_CHARS, idxSeed);
        expect(scan(`pay ${mutated} ok`, ltc), mutated).toHaveLength(0);
      }),
      { numRuns: 300 },
    );
  });

  it('does not claim Bitcoin addresses (more invalid than valid)', () => {
    none('btc 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa addr', ltc);
    none('btc 3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy addr', ltc);
    none('bc bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 hrp', ltc);
  });
});

describe('crypto-trx', () => {
  it('accepts a published Tron address and generated ones; rejects mutations', () => {
    only('hot TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 wallet', trx);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const addr = generateValidTrx(seed);
        expect(scan(`trx ${addr} ok`, trx), addr).toHaveLength(1);
        const idx = 1 + (idxSeed % (addr.length - 1));
        const mutated = mutateIn(addr, idx, BASE58_CHARS, idxSeed);
        expect(scan(`trx ${mutated} ok`, trx), mutated).toHaveLength(0);
      }),
      { numRuns: 300 },
    );
  });

  it('rejects near-misses', () => {
    none('typo TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU8 char', trx);
    none('short TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU run', trx);
  });
});

describe('crypto-xmr', () => {
  it('accepts the Monero project donation address (95 chars, standard)', () => {
    const c = only(
      'donate 44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A xmr',
      xmr,
    );
    expect(c.metadata?.['kind']).toBe('standard');
  });

  it('accepts generated standard/subaddresses; rejects mutations', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const addr = generateValidXmr(seed);
        expect(scan(`xmr ${addr} ok`, xmr), addr).toHaveLength(1);
        const idx = 1 + (idxSeed % (addr.length - 1));
        const mutated = mutateIn(addr, idx, BASE58_CHARS, idxSeed);
        expect(scan(`xmr ${mutated} ok`, xmr), mutated).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects a corrupted donation address', () => {
    none(
      'typo 44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3B x',
      xmr,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOL / ADA / DOT
// ─────────────────────────────────────────────────────────────────────────────

describe('crypto-sol', () => {
  it('accepts 32-byte keys at MEDIUM; the system program is non-sensitive', () => {
    const sys = only('program 11111111111111111111111111111111 invoked', sol);
    expect(sys.sensitive).toBe(false);
    expect(sys.rawConfidence).toBe(CONFIDENCE.MEDIUM);
  });

  it('rejects non-32-byte decodes (more invalid than valid)', () => {
    none('btc 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa addr', sol); // 25 bytes
    none('trx TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7 addr', sol); // 25 bytes
    none('word Accessibility metadata', sol); // plain word, wrong decode size
    none('hex 9c22ff5f21f0b81b113e63f7db6da94fedef11b2 sha', sol); // has 0/l? decodes wrong size anyway
  });

  it('PROPERTY: generated keys always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`key ${generateValidSol(seed)} ok`, sol)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // No checksum exists in a Solana address; mutation half omitted (a
    // mutated key usually still decodes to 32 bytes).
  });
});

describe('crypto-ada', () => {
  it('accepts the CIP-19 Shelley vector at HIGH and generated ones', () => {
    const c = only(
      'to addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x ada',
      ada,
    );
    expect(c.metadata?.['era']).toBe('shelley');
    expect(c.rawConfidence).toBe(CONFIDENCE.HIGH);
  });

  it('PROPERTY: generated Shelley addresses validate; single-char mutation fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const addr = generateValidAda(seed);
        expect(scan(`ada ${addr} ok`, ada), addr).toHaveLength(1);
        const idx = 5 + (idxSeed % (addr.length - 5));
        const mutated = mutateIn(addr, idx, BECH32_CHARS, idxSeed);
        expect(scan(`ada ${mutated} ok`, ada), mutated).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it('rejects corrupted Shelley addresses', () => {
    none(
      'typo addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3y x',
      ada,
    );
  });
});

describe('crypto-dot', () => {
  it('accepts SS58 envelopes at MEDIUM with checksum marked unverified (D9)', () => {
    const addr = generateValidDot(7);
    const c = only(`dot ${addr} stake`, dot);
    expect(c.rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(c.metadata?.['checksum']).toBe('unverified');
  });

  it('rejects wrong sizes and prefixes', () => {
    none('btc 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa addr', dot); // 25 bytes, wrong length range
    none(`x 1${'2'.repeat(60)} overlong`, dot);
  });

  it('PROPERTY: generated envelopes always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`dot ${generateValidDot(seed)} ok`, dot)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // Checksum deliberately unverified (ARCHITECTURE.md D9); mutation half
    // omitted — a mutated envelope still decodes to 35 bytes.
  });
});
