import { describe, it, expect } from 'vitest';
import { detectScripts, getCharScript, scriptsCompatible } from '../src/scripts.js';
import type { ScriptName } from '../src/types.js';

describe('getCharScript', () => {
  const cases: ReadonlyArray<readonly [string, ScriptName]> = [
    ['a', 'latin'],
    ['Z', 'latin'],
    ['é', 'latin'],
    ['я', 'cyrillic'],
    ['Ж', 'cyrillic'],
    ['α', 'greek'],
    ['Ω', 'greek'],
    ['ا', 'arabic'],
    ['ش', 'arabic'],
    ['ש', 'hebrew'],
    ['中', 'han'],
    ['ひ', 'kana'],
    ['カ', 'kana'],
    ['한', 'hangul'],
    ['न', 'devanagari'],
    ['ท', 'thai'],
    ['Ա', 'armenian'],
    ['ქ', 'georgian'],
    ['ሀ', 'ethiopic'],
  ];
  it.each(cases)('classifies %s as %s', (char, script) => {
    expect(getCharScript(char)).toBe(script);
  });

  it('reports script-neutral characters as other', () => {
    for (const char of ['5', '!', ' ', '\t', '.', '@', '€', '😀']) {
      expect(getCharScript(char)).toBe('other');
    }
  });

  it('reports letters of unsupported scripts as other', () => {
    expect(getCharScript('Ꭲ')).toBe('other'); // Cherokee
    expect(getCharScript('ᚠ')).toBe('other'); // Runic
  });

  it('handles the empty string', () => {
    expect(getCharScript('')).toBe('other');
  });
});

describe('detectScripts', () => {
  const samples: ReadonlyArray<readonly [ScriptName, string]> = [
    ['latin', 'hello world'],
    ['cyrillic', 'привет мир'],
    ['arabic', 'مرحبا بالعالم'],
    ['hebrew', 'שלום עולם'],
    ['han', '你好世界'],
    ['kana', 'こんにちは'],
    ['kana', 'カタカナ'],
    ['hangul', '안녕하세요'],
    ['devanagari', 'नमस्ते दुनिया'],
    ['greek', 'γειά σου κόσμε'],
    ['thai', 'สวัสดีชาวโลก'],
    ['armenian', 'Բարեւ աշխարհ'],
    ['georgian', 'გამარჯობა მსოფლიო'],
    ['ethiopic', 'ሰላም ልዑል'],
  ];
  it.each(samples)('detects %s as dominant', (script, text) => {
    const info = detectScripts(text);
    expect(info.dominant).toBe(script);
    expect(info.counts[script]).toBeGreaterThan(0);
    expect(info.mixed).toBe(false);
  });

  it('detects mixed-script text', () => {
    const info = detectScripts('hello привет');
    expect(info.mixed).toBe(true);
    expect(info.counts.latin).toBe(5);
    expect(info.counts.cyrillic).toBe(6);
    expect(info.dominant).toBe('cyrillic');
  });

  it('marks Japanese (han + kana) as mixed', () => {
    const info = detectScripts('日本語です');
    expect(info.mixed).toBe(true);
    expect(info.counts.han).toBe(3);
    expect(info.counts.kana).toBe(2);
  });

  it('excludes digits, punctuation, and whitespace from dominance', () => {
    const info = detectScripts('abc 123 !!! ... ???');
    expect(info.counts.latin).toBe(3);
    expect(info.dominant).toBe('latin');
    // The many neutral characters must not be counted anywhere.
    const total = Object.values(info.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(3);
  });

  it('has no dominant script for all-neutral text', () => {
    const info = detectScripts('123 456 --- !!!');
    expect(info.dominant).toBeNull();
    expect(info.mixed).toBe(false);
  });

  it('has no dominant script on an exact tie', () => {
    const info = detectScripts('ab πρ');
    expect(info.dominant).toBeNull();
    expect(info.mixed).toBe(true);
  });

  it('handles astral-plane characters by code point, not code unit', () => {
    const ideograph = String.fromCodePoint(0x20000); // CJK Extension B
    expect(ideograph.length).toBe(2); // surrogate pair
    const info = detectScripts(ideograph);
    expect(info.counts.han).toBe(1); // counted once, not twice
    expect(info.dominant).toBe('han');
    expect(getCharScript(ideograph)).toBe('han');
  });

  it('counts astral letters of unsupported scripts under other', () => {
    const mathBoldA = String.fromCodePoint(0x1d400); // 𝐀 (Script=Common letter)
    const info = detectScripts(mathBoldA);
    expect(info.counts.other).toBe(1);
    expect(info.dominant).toBeNull();
  });

  it('handles the empty string', () => {
    const info = detectScripts('');
    expect(info.dominant).toBeNull();
    expect(info.mixed).toBe(false);
  });
});

describe('scriptsCompatible', () => {
  it('treats Han, Kana, and Latin as one compatible group (Japanese)', () => {
    expect(scriptsCompatible('han', 'kana')).toBe(true);
    expect(scriptsCompatible('kana', 'latin')).toBe(true);
    expect(scriptsCompatible('latin', 'han')).toBe(true);
  });

  it('treats Hangul and Han as compatible (Korean hanja)', () => {
    expect(scriptsCompatible('hangul', 'han')).toBe(true);
    expect(scriptsCompatible('han', 'hangul')).toBe(true);
  });

  it('keeps unrelated scripts incompatible', () => {
    expect(scriptsCompatible('hangul', 'latin')).toBe(false);
    expect(scriptsCompatible('hangul', 'kana')).toBe(false);
    expect(scriptsCompatible('latin', 'cyrillic')).toBe(false);
    expect(scriptsCompatible('greek', 'latin')).toBe(false);
    expect(scriptsCompatible('arabic', 'hebrew')).toBe(false);
  });

  it('is reflexive, and other never matches a real script', () => {
    expect(scriptsCompatible('thai', 'thai')).toBe(true);
    expect(scriptsCompatible('other', 'latin')).toBe(false);
    expect(scriptsCompatible('han', 'other')).toBe(false);
  });
});
