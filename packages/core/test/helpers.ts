/**
 * Shared test utilities.
 *
 * Invisible and combining characters are constructed from code points instead
 * of written literally, so no test file contains characters you cannot see
 * (and combining sequences cannot be confused with their precomposed forms).
 */
import { expect } from 'vitest';
import type { NormalizationResult } from '../src/types.js';

export const chr = (cp: number): string => String.fromCodePoint(cp);

// Invisibles / controls.
export const SHY = chr(0x00ad); // soft hyphen
export const ZWSP = chr(0x200b);
export const ZWNJ = chr(0x200c);
export const ZWJ = chr(0x200d);
export const LRM = chr(0x200e);
export const RLM = chr(0x200f);
export const LRE = chr(0x202a);
export const PDF_CTRL = chr(0x202c); // POP DIRECTIONAL FORMATTING
export const RLO = chr(0x202e);
export const WJ = chr(0x2060); // word joiner
export const BOM = chr(0xfeff);

// Combining marks.
export const ACUTE = chr(0x0301);
export const CEDILLA = chr(0x0327);

// Confusables and exotic whitespace.
export const CYR_A = chr(0x0430); // Cyrillic а
export const NBSP = chr(0x00a0);
export const OGHAM_SPACE = chr(0x1680);

/** Render a string unambiguously for failure messages: U+XXXX per code unit. */
export function escapeText(s: string): string {
  const units: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    if (u >= 0x20 && u <= 0x7e) units.push(s[i]!);
    else units.push('U+' + u.toString(16).toUpperCase().padStart(4, '0'));
  }
  return units.join(' ');
}

/**
 * Assert every stated offset-map invariant. This is the single source of
 * truth used by the unit, property, and fuzz suites.
 */
export function assertNormalizationInvariants(original: string, result: NormalizationResult): void {
  const { offsetMap, reverseMap, normalizedText } = result;
  const origLen = original.length;
  const normLen = normalizedText.length;

  expect(result.originalLength).toBe(origLen);
  expect(result.normalizedLength).toBe(normLen);
  expect(offsetMap.length).toBe(normLen + 1);
  expect(reverseMap.length).toBe(origLen + 1);

  // Sentinels.
  expect(offsetMap[normLen]).toBe(origLen);
  expect(reverseMap[origLen]).toBe(normLen);

  // offsetMap[0] === 0 whenever any output exists (the one exception is a
  // fully-deleted input, where index 0 IS the sentinel).
  if (normLen > 0) expect(offsetMap[0]).toBe(0);
  if (origLen > 0) expect(reverseMap[0]).toBe(0);

  // Monotone, in-bounds.
  for (let i = 0; i <= normLen; i++) {
    const v = offsetMap[i]!;
    if (v < 0 || v > origLen) {
      throw new Error(`offsetMap[${i}] = ${v} out of range for input ${escapeText(original)}`);
    }
    if (i > 0 && v < offsetMap[i - 1]!) {
      throw new Error(`offsetMap not monotone at ${i} for input ${escapeText(original)}`);
    }
  }
  for (let j = 0; j <= origLen; j++) {
    const v = reverseMap[j]!;
    if (v < 0 || v > normLen) {
      throw new Error(`reverseMap[${j}] = ${v} out of range for input ${escapeText(original)}`);
    }
    if (j > 0 && v < reverseMap[j - 1]!) {
      throw new Error(`reverseMap not monotone at ${j} for input ${escapeText(original)}`);
    }
  }

  // Mapping the full normalized span back covers exactly the original string.
  if (normLen > 0) {
    expect(original.slice(offsetMap[0]!, offsetMap[normLen]!)).toBe(original);
  }
}

/** Deterministic PRNG for the fuzz suite (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
