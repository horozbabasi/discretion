/**
 * Hash and encoding primitives, pinned to PUBLISHED vectors.
 *
 * These functions are validation-only (they verify wallet-address
 * checksums), so the entire correctness argument is these vectors: NIST
 * FIPS 180-4 for SHA-256, the original Keccak submission vectors for
 * Keccak-256 (which also prove the padding is 0x01, not SHA-3's 0x06),
 * Bitcoin mainnet values for base58check, BIP-173/BIP-350 for bech32 and
 * bech32m including their published INVALID vectors, and the Monero
 * mainnet address format for the block-wise base58.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { utf8ToBytes, bytesToHex, hexToBytes } from '../src/encoding/bytes.js';
import { sha256, sha256d } from '../src/crypto/sha256.js';
import { keccak256 } from '../src/crypto/keccak256.js';
import {
  base58Decode,
  base58Encode,
  base58CheckDecode,
  base58CheckEncode,
} from '../src/encoding/base58.js';
import { bech32Decode, bech32Encode, convertBits } from '../src/encoding/bech32.js';
import { moneroBase58Decode } from '../src/encoding/base58monero.js';

const hex = (s: string): string => bytesToHex(sha256(utf8ToBytes(s)));

describe('bytes helpers', () => {
  it('utf8ToBytes matches known encodings', () => {
    expect([...utf8ToBytes('abc')]).toEqual([0x61, 0x62, 0x63]);
    expect([...utf8ToBytes('é')]).toEqual([0xc3, 0xa9]);
    expect([...utf8ToBytes('€')]).toEqual([0xe2, 0x82, 0xac]);
    expect([...utf8ToBytes('𐍈')]).toEqual([0xf0, 0x90, 0x8d, 0x88]);
  });

  it('hexToBytes round-trips and rejects malformed input', () => {
    expect(bytesToHex(hexToBytes('00ff10')!)).toBe('00ff10');
    expect(hexToBytes('0f0')).toBeNull(); // odd length
    expect(hexToBytes('zz')).toBeNull();
  });
});

describe('SHA-256 (NIST FIPS 180-4 vectors)', () => {
  it('empty message', () => {
    expect(hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('"abc"', () => {
    expect(hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('two-block message', () => {
    expect(hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
  it('exactly one padding boundary (55/56/64 bytes)', () => {
    // 55 bytes fits length in one block; 56 forces a second block.
    expect(hex('a'.repeat(55))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
    );
    expect(hex('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );
    expect(hex('a'.repeat(64))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });
  it('sha256d is sha256 twice', () => {
    expect(bytesToHex(sha256d(utf8ToBytes('abc')))).toBe(
      bytesToHex(sha256(sha256(utf8ToBytes('abc')))),
    );
  });
});

describe('Keccak-256 (original padding, NOT SHA3-256)', () => {
  const khex = (s: string): string => bytesToHex(keccak256(utf8ToBytes(s)));

  it('empty message — the padding discriminator', () => {
    // SHA3-256('') would be a7ffc6f8…; Keccak-256('') is c5d24601…. Getting
    // this vector right proves the 0x01 domain byte.
    expect(khex('')).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  });
  it('"abc"', () => {
    expect(khex('abc')).toBe('4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
  });
  it('quick brown fox', () => {
    expect(khex('The quick brown fox jumps over the lazy dog')).toBe(
      '4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15',
    );
  });
  it('multi-block absorption is deterministic and block-sensitive', () => {
    // No published Keccak-256 vector for >136-byte inputs is widely
    // available to pin here, and no detector hashes an input that long
    // (wallet payloads are ≤69 bytes, EIP-55 hashes 40 bytes) — the
    // published vectors above cover every exercised path, including the
    // padding byte. This test pins the multi-block loop's behaviour:
    // crossing the 136-byte rate boundary changes the digest, repeated
    // calls agree, and lengths 135/136/137 are pairwise distinct.
    const digests = [135, 136, 137].map((n) => khex('a'.repeat(n)));
    expect(new Set(digests).size).toBe(3);
    expect(khex('a'.repeat(137))).toBe(khex('a'.repeat(137)));
  });
});

describe('base58 / base58check', () => {
  it('round-trips arbitrary bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 64 }), (bytes) => {
        expect([...base58Decode(base58Encode(bytes))!]).toEqual([...bytes]);
      }),
      { numRuns: 300 },
    );
  });

  it('decodes the Bitcoin genesis address with a valid checksum', () => {
    const r = base58CheckDecode('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    expect(r).not.toBeNull();
    expect(r!.version).toBe(0x00);
    expect(r!.payload.length).toBe(20);
    expect(bytesToHex(r!.payload)).toBe('62e907b15cbf27d5425399ebf6f0fb50ebb88f18');
  });

  it('rejects a corrupted character', () => {
    expect(base58CheckDecode('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb')).toBeNull();
    expect(base58CheckDecode('1A1zP1eP5QGeff2DMPTfTL5SLmv7DivfNa')).toBeNull();
  });

  it('rejects the forbidden characters 0, O, I, l', () => {
    expect(base58Decode('0OIl')).toBeNull();
  });

  it('base58CheckEncode round-trips through decode', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 255 }),
        fc.uint8Array({ minLength: 1, maxLength: 40 }),
        (version, payload) => {
          const encoded = base58CheckEncode(version, payload);
          const decoded = base58CheckDecode(encoded);
          expect(decoded).not.toBeNull();
          expect(decoded!.version).toBe(version);
          expect([...decoded!.payload]).toEqual([...payload]);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('bech32 / bech32m (BIP-173 and BIP-350 vectors)', () => {
  it('accepts BIP-173 valid bech32 strings', () => {
    for (const s of [
      'A12UEL5L',
      'a12uel5l',
      'an83characterlonghumanreadablepartthatcontainsthenumber1andtheexcludedcharactersbio1tt5tgs',
      'abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw',
      'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4',
    ]) {
      const d = bech32Decode(s);
      expect(d, s).not.toBeNull();
      expect(d!.encoding).toBe('bech32');
    }
  });

  it('accepts BIP-350 valid bech32m strings', () => {
    for (const s of [
      'A1LQFN3A',
      'a1lqfn3a',
      'abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx',
      'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
    ]) {
      const d = bech32Decode(s);
      expect(d, s).not.toBeNull();
      expect(d!.encoding).toBe('bech32m');
    }
  });

  it('rejects BIP-173/350 invalid strings', () => {
    for (const s of [
      'A12Uel5l', // mixed case
      'pzry9x0s0muk', // no separator
      '1pzry9x0s0muk', // empty hrp
      'x1b4n0q5v', // invalid data char
      'li1dgmt3', // checksum too short
      'A1G7SGD8', // invalid checksum
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5', // BIP-173 bad checksum
      'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj1', // bech32m corrupted
    ]) {
      expect(bech32Decode(s), s).toBeNull();
    }
  });

  it('honours the maxLength extension for Cardano-length strings', () => {
    const data = new Array<number>(80).fill(5);
    const long = bech32Encode('addr', data, 'bech32');
    expect(long.length).toBeGreaterThan(90);
    expect(bech32Decode(long)).toBeNull(); // default BIP-173 limit
    const d = bech32Decode(long, 120);
    expect(d).not.toBeNull();
    expect(d!.hrp).toBe('addr');
  });

  it('encode/decode round-trips both variants', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 31 }), { minLength: 6, maxLength: 60 }),
        fc.constantFrom('bech32' as const, 'bech32m' as const),
        (data, encoding) => {
          const s = bech32Encode('tst', data, encoding);
          const d = bech32Decode(s, 200);
          expect(d).not.toBeNull();
          expect(d!.encoding).toBe(encoding);
          expect([...d!.data]).toEqual(data);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('convertBits rejects illegal padding, accepts witness programs', () => {
    // 32 bytes → 5-bit → back, as a P2WSH program would.
    const bytes = Array.from({ length: 32 }, (_, i) => i * 7 % 256);
    const five = convertBits(bytes, 8, 5, true)!;
    expect(convertBits(five, 5, 8, false)).toEqual(bytes);
    expect(convertBits([31], 5, 8, false)).toBeNull(); // dangling bits
  });
});

describe('Monero base58', () => {
  it('decodes a standard 95-character mainnet address to 69 bytes, network 0x12', () => {
    // The Monero project's published donation address.
    const addr =
      '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A';
    const bytes = moneroBase58Decode(addr);
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBe(69);
    expect(bytes![0]).toBe(0x12); // mainnet standard-address network byte
    // Checksum: last 4 bytes equal the first 4 of keccak256 of the rest.
    const body = bytes!.slice(0, 65);
    const expected = keccak256(body).slice(0, 4);
    expect([...bytes!.slice(65)]).toEqual([...expected]);
  });

  it('rejects corrupted blocks and malformed lengths', () => {
    const addr =
      '44AFFq5kSiGBoZ4NMDwYtN18obc8AemS33DBLWs3H7otXft3XjrpDtQGv7SqSsaBYBb98uNbr2VBBEt7f2wfn3RVGQBEP3A';
    // Corrupt one character: block decode may survive, but the keccak
    // checksum comparison in the detector must fail; here we at least
    // assert the decode-level guarantees.
    expect(moneroBase58Decode('')).toBeNull();
    expect(moneroBase58Decode('O'.repeat(11))).toBeNull(); // illegal alphabet char
    // Tail length ≡ 1 (mod 11) has no decoded size — can never occur.
    expect(moneroBase58Decode('4'.repeat(12))).toBeNull();
    // An 11-char block of all-'z' encodes a value above 2^64 — overflows
    // the fixed 8-byte block and must be rejected.
    expect(moneroBase58Decode('z'.repeat(11))).toBeNull();
    // A corrupted character may still block-decode; the CHECKSUM (keccak,
    // verified by the detector) is what rejects it. Assert the checksum
    // comparison fails for a one-character corruption of the real address.
    const corrupted = addr.slice(0, 94) + (addr[94] === 'A' ? 'B' : 'A');
    const cb = moneroBase58Decode(corrupted);
    if (cb !== null && cb.length === 69) {
      const expectedCk = keccak256(cb.slice(0, 65)).slice(0, 4);
      expect([...cb.slice(65)]).not.toEqual([...expectedCk]);
    }
  });
});
