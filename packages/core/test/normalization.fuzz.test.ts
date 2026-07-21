/**
 * Fuzz suite: 10,000 iterations of random strings (up to 2,000 characters)
 * drawn from the full Unicode range, including lone surrogates.
 *
 * Asserts: no throw, termination, and every offset-map invariant on every
 * iteration; idempotency is spot-checked on every 10th iteration to keep the
 * runtime sane. On failure the exact input is printed in escaped form
 * (U+XXXX per code unit) together with the seed and iteration number, so it
 * can be pasted straight into normalization.test.ts as a regression test.
 */
import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalization.js';
import { assertNormalizationInvariants, escapeText, mulberry32, chr } from './helpers.js';

const SEED = 0xc0ffee;
const ITERATIONS = 10_000;
const MAX_LENGTH = 2_000;

/** Character pools for the biased generator. */
const POOLS: readonly string[] = [
  'abcdefghij KLMNOP 0123456789.,!?-',
  'абвгдежзий клмноп',
  'αβγδεζηθικ λμνξοπ',
  'مرحبا بالعالم يا صديقي',
  'שלום עולם ברוכים הבאים',
  '中文日月火水木金土人大小',
  'あいうえおかきくけこカタカナ',
  '가나다라마바사아자차',
  'कखगघङचछजझञ',
  'กขคงจฉชซฌญ',
  // invisibles & bidi controls
  chr(0x200b) +
    chr(0x200c) +
    chr(0x200d) +
    chr(0x200e) +
    chr(0x200f) +
    chr(0x202a) +
    chr(0x202e) +
    chr(0x2060) +
    chr(0xfeff) +
    chr(0x00ad),
  // confusables
  chr(0x0430) + chr(0x043e) + chr(0x0455) + chr(0x03bf) + chr(0x13a2) + 'ﬁ½①Ａｱ',
  // combining marks
  chr(0x0301) + chr(0x0327) + chr(0x0308) + chr(0x064b) + chr(0x20e3),
  // exotic spaces / dashes / quotes
  chr(0x00a0) + chr(0x2003) + chr(0x3000) + '—–“”‘’«»',
  // emoji (multi-code-point sequences get built by concatenation with ZWJ above)
  '👍👎👨👩👧👦🏽🇹🇷♀' + chr(0xfe0f),
];

describe('normalization fuzz', () => {
  it(`${ITERATIONS} random strings up to ${MAX_LENGTH} chars: no throw, all invariants hold`, () => {
    const rng = mulberry32(SEED);

    const randomString = (iteration: number): string => {
      const mode = iteration % 3;
      const length = Math.floor(rng() * rng() * MAX_LENGTH); // bias to shorter
      const parts: string[] = [];
      if (mode === 0) {
        // Raw UTF-16 code units — includes lone surrogates.
        for (let i = 0; i < length; i++) {
          parts.push(String.fromCharCode(Math.floor(rng() * 0x10000)));
        }
      } else if (mode === 1) {
        // Random code points across the full Unicode range.
        for (let i = 0; i < length; i++) {
          parts.push(String.fromCodePoint(Math.floor(rng() * 0x110000)));
        }
      } else {
        // Biased soup from the pools above.
        while (parts.reduce((n, p) => n + p.length, 0) < length) {
          const pool = POOLS[Math.floor(rng() * POOLS.length)]!;
          const chars = [...pool];
          const count = 1 + Math.floor(rng() * 8);
          for (let i = 0; i < count; i++) {
            parts.push(chars[Math.floor(rng() * chars.length)]!);
          }
          if (rng() < 0.3) parts.push(' ');
        }
      }
      return parts.join('');
    };

    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      const input = randomString(iteration);
      try {
        const result = normalize(input);
        assertNormalizationInvariants(input, result);
        if (iteration % 10 === 0) {
          const second = normalize(result.normalizedText);
          expect(second.normalizedText).toBe(result.normalizedText);
        }
      } catch (error) {
        throw new Error(
          `Fuzz failure at iteration ${iteration} (seed 0x${SEED.toString(16)}).\n` +
            `Input (${input.length} code units): ${escapeText(input)}\n` +
            `Underlying error: ${error instanceof Error ? error.stack : String(error)}`,
        );
      }
    }
  }, 600_000);
});
