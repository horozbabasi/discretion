/**
 * SPEC.md conformance tests for Stage 0.
 *
 * Each test pins a rule that SPEC.md states in prose, so a future refactor
 * that drifts from the specification fails here rather than silently
 * corrupting user text. The governing rule is quoted in each test's comment.
 */
import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalization.js';
import { detectScripts, scriptsCompatible } from '../src/scripts.js';
import type { ScriptName } from '../src/types.js';
import { chr, ZWNJ, ZWSP, ZWJ, BOM, RLO, ACUTE, CYR_A } from './helpers.js';

describe('SPEC.md Stage 0 — ZWNJ is preserved in scripts that use it meaningfully', () => {
  // "EXCEPT preserve U+200C ZERO WIDTH NON-JOINER when it sits between letters
  //  of a script that uses it meaningfully (Arabic, Persian, Urdu, Devanagari,
  //  Bengali, Gurmukhi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Sinhala)"
  //
  // One letter pair per script the spec names. Persian and Urdu are written in
  // the Arabic script, so the Arabic case covers all three.
  const SPEC_ZWNJ_SCRIPTS: ReadonlyArray<readonly [string, number, number]> = [
    ['Arabic (incl. Persian, Urdu)', 0x0645, 0x062e],
    ['Devanagari', 0x0915, 0x0937],
    ['Bengali', 0x0995, 0x09b7],
    ['Gurmukhi', 0x0a15, 0x0a38],
    ['Gujarati', 0x0a95, 0x0ab7],
    ['Tamil', 0x0b95, 0x0bb7],
    ['Telugu', 0x0c15, 0x0c37],
    ['Kannada', 0x0c95, 0x0cb7],
    ['Malayalam', 0x0d15, 0x0d37],
    ['Sinhala', 0x0d9a, 0x0dc2],
  ];

  it.each(SPEC_ZWNJ_SCRIPTS)('preserves ZWNJ between %s letters', (_name, before, after) => {
    const input = chr(before) + ZWNJ + chr(after);
    const result = normalize(input);
    expect(result.normalizedText).toBe(input);
    expect(result.transformations).toEqual([]);
  });

  it('preserves ZWNJ in real Persian text', () => {
    const input = 'می' + ZWNJ + 'خواهم که نمی' + ZWNJ + 'دانند';
    expect(normalize(input).normalizedText).toBe(input);
  });

  it('preserves ZWNJ in real Hindi text after a virama', () => {
    const input = 'क' + chr(0x094d) + ZWNJ + 'ष';
    expect(normalize(input).normalizedText).toBe(input);
  });

  it('still strips ZWNJ where it is noise rather than morphology', () => {
    // Latin ligature suppression and text edges carry no linguistic load.
    expect(normalize('Auf' + ZWNJ + 'lage').normalizedText).toBe('Auflage');
    expect(normalize(ZWNJ + 'خواهم').normalizedText).toBe('خواهم');
    expect(normalize('می' + ZWNJ).normalizedText).toBe('می');
  });

  it('still strips the other zero-width and bidi controls the spec lists', () => {
    // "Strip zero-width and bidi control characters
    //  (U+200B–U+200F, U+202A–U+202E, U+FEFF)"
    for (const control of [ZWSP, ZWJ, BOM, RLO, chr(0x200e), chr(0x202a)]) {
      expect(normalize('a' + control + 'b').normalizedText).toBe('ab');
    }
  });
});

describe('SPEC.md Stage 0 — selective homoglyph folding', () => {
  it('folds a script-anomalous character within its token', () => {
    // "fold a character only when it is script-anomalous within its own token"
    expect(normalize('p' + CYR_A + 'ssword').normalizedText).toBe('password');
  });

  it('never folds a character belonging to its token dominant script', () => {
    // "Never fold a character that belongs to its token's dominant script."
    for (const token of ['пароль', 'βιβλίο', 'مرحبا', 'שלום', '你好世界']) {
      const result = normalize(token);
      expect(result.normalizedText).toBe(token);
      expect(result.transformations).toEqual([]);
    }
  });

  it('does not fold on a dominant-script tie', () => {
    // "No folding on a dominant-script tie."
    const tied = 'a' + CYR_A; // one Latin letter, one Cyrillic letter
    expect(normalize(tied).normalizedText).toBe(tied);
  });

  it('treats Han/Hiragana/Katakana/Latin as one compatible group', () => {
    // "treat Han/Hiragana/Katakana/Latin as one compatible group ... so
    //  ordinary Japanese ... text is never treated as anomalous mixing"
    const pairs: ReadonlyArray<readonly [ScriptName, ScriptName]> = [
      ['han', 'kana'],
      ['kana', 'latin'],
      ['latin', 'han'],
    ];
    for (const [a, b] of pairs) {
      expect(scriptsCompatible(a, b)).toBe(true);
    }
    for (const japanese of ['東京タワーTokyo2026', 'アプリのUpdate情報']) {
      const result = normalize(japanese);
      expect(result.normalizedText).toBe(japanese);
      expect(result.transformations).toEqual([]);
    }
  });

  it('treats Han/Hangul as one compatible group', () => {
    // "and Han/Hangul as one compatible group, so ordinary ... Korean text is
    //  never treated as anomalous mixing"
    expect(scriptsCompatible('hangul', 'han')).toBe(true);
    const korean = '한국어漢字교육';
    const result = normalize(korean);
    expect(result.normalizedText).toBe(korean);
    expect(result.transformations).toEqual([]);
  });

  it('keeps unrelated scripts incompatible so real obfuscation still folds', () => {
    expect(scriptsCompatible('latin', 'cyrillic')).toBe(false);
    expect(scriptsCompatible('greek', 'latin')).toBe(false);
    expect(scriptsCompatible('hangul', 'latin')).toBe(false);
  });
});

describe('SPEC.md Stage 0 — remaining stated rules', () => {
  it('re-runs NFKC after folding so the pipeline stays idempotent', () => {
    // "Re-run NFKC after folding if any fold fired, so a folded base character
    //  followed by a combining mark composes the same way native text would,
    //  keeping the pipeline idempotent."
    const input = 'p' + CYR_A + ACUTE + 'sta';
    const once = normalize(input);
    expect(once.normalizedText).toBe('pásta');
    const twice = normalize(once.normalizedText);
    expect(twice.normalizedText).toBe(once.normalizedText);
    expect(twice.transformations).toEqual([]);
  });

  it('records every script the spec lists as detectable', () => {
    // "Detect and record the dominant script(s) present (Latin, Cyrillic,
    //  Arabic, Hebrew, Han, Kana, Hangul, Devanagari, Greek, Thai, Armenian,
    //  Georgian, Ethiopic)"
    const samples: ReadonlyArray<readonly [ScriptName, string]> = [
      ['latin', 'hello'],
      ['cyrillic', 'привет'],
      ['arabic', 'مرحبا'],
      ['hebrew', 'שלום'],
      ['han', '你好'],
      ['kana', 'こんにちは'],
      ['hangul', '안녕'],
      ['devanagari', 'नमस्ते'],
      ['greek', 'γειά'],
      ['thai', 'สวัสดี'],
      ['armenian', 'Բարեւ'],
      ['georgian', 'გამარჯობა'],
      ['ethiopic', 'ሰላም'],
    ];
    for (const [script, text] of samples) {
      expect(detectScripts(text).dominant).toBe(script);
      expect(normalize(text).scripts.dominant).toBe(script);
    }
  });

  it('normalizes whitespace, dash, and quote variants', () => {
    // "Collapse whitespace variants; normalize dash and quote variants"
    expect(normalize('a' + chr(0x00a0) + 'b').normalizedText).toBe('a b');
    expect(normalize('a' + chr(0x3000) + 'b').normalizedText).toBe('a b');
    expect(normalize('4242' + chr(0x2014) + '4242').normalizedText).toBe('4242-4242');
    expect(normalize(chr(0x201c) + 'q' + chr(0x201d)).normalizedText).toBe('"q"');
    expect(normalize(chr(0x2018) + 'r' + chr(0x2019)).normalizedText).toBe("'r'");
  });

  it('maintains an exact bidirectional offset map', () => {
    // "CRITICAL: maintain an exact bidirectional offset map from normalized
    //  text back to original text."
    const input = ZWSP + 'ﬁle p' + CYR_A + 'ssword';
    const result = normalize(input);
    expect(result.offsetMap.length).toBe(result.normalizedLength + 1);
    expect(result.reverseMap.length).toBe(result.originalLength + 1);
    expect(result.offsetMap[0]).toBe(0);
    expect(result.offsetMap[result.normalizedLength]).toBe(result.originalLength);
    expect(result.reverseMap[result.originalLength]).toBe(result.normalizedLength);
  });
});
