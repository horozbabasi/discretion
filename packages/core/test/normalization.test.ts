import { describe, it, expect } from 'vitest';
import { normalize } from '../src/normalization.js';
import { mapNormalizedSpan } from '../src/offsetMap.js';
import {
  assertNormalizationInvariants,
  chr,
  ACUTE,
  CEDILLA,
  CYR_A,
  BOM,
  NBSP,
  OGHAM_SPACE,
  PDF_CTRL,
  RLM,
  RLO,
  SHY,
  WJ,
  ZWJ,
  ZWNJ,
  ZWSP,
} from './helpers.js';

/** normalize + invariant check in one call; returns the result. */
function norm(text: string, options?: Parameters<typeof normalize>[1]) {
  const result = normalize(text, options);
  assertNormalizationInvariants(text, result);
  return result;
}

describe('identity', () => {
  it('passes pure ASCII through unchanged with an identity map', () => {
    const input = 'Hello, world! 123 foo_bar@example.com';
    const r = norm(input);
    expect(r.normalizedText).toBe(input);
    expect([...r.offsetMap]).toEqual([...Array(input.length + 1).keys()]);
    expect([...r.reverseMap]).toEqual([...Array(input.length + 1).keys()]);
    expect(r.transformations).toEqual([]);
  });

  it('handles the empty string', () => {
    const r = norm('');
    expect(r.normalizedText).toBe('');
    expect([...r.offsetMap]).toEqual([0]);
    expect([...r.reverseMap]).toEqual([0]);
  });

  it('handles a single character', () => {
    for (const input of ['a', '中', '👍']) {
      const r = norm(input);
      expect(r.normalizedText).toBe(input);
      expect(r.transformations).toEqual([]);
    }
  });

  it('leaves non-ASCII text with nothing normalizable untouched', () => {
    const input = 'просто текст без фокусов';
    const r = norm(input);
    expect(r.normalizedText).toBe(input);
    expect(r.transformations).toEqual([]);
    expect([...r.offsetMap]).toEqual([...Array(input.length + 1).keys()]);
  });
});

describe('strip invisibles', () => {
  it('removes a zero-width space with correct offsets', () => {
    const input = `foo${ZWSP}bar`;
    const r = norm(input);
    expect(r.normalizedText).toBe('foobar');
    // The deleted character is attributed to the following cluster ('b').
    expect([...r.offsetMap]).toEqual([0, 1, 2, 3, 5, 6, 7]);
    expect([...r.reverseMap]).toEqual([0, 1, 2, 3, 3, 4, 5, 6]);
    expect(r.transformations).toEqual([
      {
        kind: 'strip-invisibles',
        originalStart: 3,
        originalEnd: 4,
        original: ZWSP,
        replacement: '',
      },
    ]);
  });

  it('removes every listed invisible', () => {
    for (const invisible of [SHY, ZWSP, ZWNJ, ZWJ, RLM, RLO, PDF_CTRL, WJ, BOM, chr(0x2064)]) {
      const r = norm(`a${invisible}b`);
      expect(r.normalizedText).toBe('ab');
    }
  });

  it('removes bidi controls, including at the edges', () => {
    const input = `${RLO}abc${PDF_CTRL}`;
    const r = norm(input);
    expect(r.normalizedText).toBe('abc');
    // Leading deleted run is absorbed by 'a' (so offsetMap[0] === 0);
    // trailing run falls under the sentinel.
    expect([...r.offsetMap]).toEqual([0, 2, 3, 5]);
  });

  it('normalizes a string of nothing but invisibles to empty', () => {
    const input = ZWSP + ZWNJ + BOM;
    const r = norm(input);
    expect(r.normalizedText).toBe('');
    expect([...r.offsetMap]).toEqual([3]); // sentinel only
    expect([...r.reverseMap]).toEqual([0, 0, 0, 0]);
  });

  it('strips a soft hyphen inside a word', () => {
    const r = norm(`ex${SHY}ample`);
    expect(r.normalizedText).toBe('example');
  });
});

describe('NFKC', () => {
  it('expands the fi ligature with every output unit mapping to the cluster start', () => {
    const r = norm('ﬁle');
    expect(r.normalizedText).toBe('file');
    expect([...r.offsetMap]).toEqual([0, 0, 1, 2, 3]);
    expect(r.transformations).toEqual([
      { kind: 'nfkc', originalStart: 0, originalEnd: 1, original: 'ﬁ', replacement: 'fi' },
    ]);
  });

  it('maps a span covering part of an expansion to the whole original cluster', () => {
    const r = norm('ﬁle');
    // Just the 'f' — you cannot substitute half a ligature.
    expect(mapNormalizedSpan(r.offsetMap, 0, 1)).toEqual({ start: 0, end: 1 });
    expect(mapNormalizedSpan(r.offsetMap, 1, 2)).toEqual({ start: 0, end: 1 });
    expect(mapNormalizedSpan(r.offsetMap, 0, 2)).toEqual({ start: 0, end: 1 });
    expect(mapNormalizedSpan(r.offsetMap, 2, 4)).toEqual({ start: 1, end: 3 });
  });

  it('expands ½ to 1⁄2 (with U+2044 FRACTION SLASH)', () => {
    const r = norm('½ cup');
    expect(r.normalizedText).toBe('1' + chr(0x2044) + '2 cup');
    expect(r.normalizedText.length).toBe(7);
    expect([...r.offsetMap]).toEqual([0, 0, 0, 1, 2, 3, 4, 5]);
  });

  it('folds circled and fullwidth forms', () => {
    expect(norm('①②③').normalizedText).toBe('123');
    expect(norm('Ｈｅｌｌｏ').normalizedText).toBe('Hello');
    expect(norm('ｱｲｳ').normalizedText).toBe('アイウ'); // halfwidth → fullwidth kana
  });

  it('contracts e + combining acute to precomposed é', () => {
    const input = `e${ACUTE}`;
    const r = norm(input);
    expect(r.normalizedText).toBe('é');
    expect([...r.offsetMap]).toEqual([0, 2]);
    expect([...r.reverseMap]).toEqual([0, 0, 1]);
  });

  it('handles combining sequences with multiple marks', () => {
    const input = `e${ACUTE}${CEDILLA}`;
    const expected = input.normalize('NFKC'); // reorders marks, composes e+cedilla
    const r = norm(input);
    expect(r.normalizedText).toBe(expected);
    expect(expected).not.toBe(input); // the case is non-trivial
    // Whole cluster replaced: all output maps to the cluster start.
    expect([...r.offsetMap]).toEqual([...expected].map(() => 0).concat([input.length]));
  });

  it('composes decomposed Hangul jamo into a syllable', () => {
    const input = chr(0x1112) + chr(0x1161) + chr(0x11ab);
    const r = norm(input);
    expect(r.normalizedText).toBe('한');
    expect([...r.offsetMap]).toEqual([0, 3]);
  });
});

describe('selective homoglyph folding', () => {
  it('folds a Cyrillic а inside an otherwise-Latin token', () => {
    const input = `p${CYR_A}ssword`;
    const r = norm(input);
    expect(r.normalizedText).toBe('password');
    expect([...r.offsetMap]).toEqual([...Array(9).keys()]);
    expect(r.transformations).toEqual([
      {
        kind: 'homoglyph-fold',
        originalStart: 1,
        originalEnd: 2,
        original: CYR_A,
        replacement: 'a',
      },
    ]);
  });

  it('folds Latin into a dominant non-Latin token (reverse direction)', () => {
    // Latin 'o' inside a Greek word → Greek omicron. Built from parts so the
    // Latin o and Greek omicron cannot be visually confused in this source.
    const omicron = chr(0x03bf);
    const input = 'λ' + 'o' + 'γ' + omicron + 'ς';
    const r = norm(input);
    expect(r.normalizedText).toBe('λ' + omicron + 'γ' + omicron + 'ς');
    expect(r.transformations).toEqual([
      {
        kind: 'homoglyph-fold',
        originalStart: 1,
        originalEnd: 2,
        original: 'o',
        replacement: omicron,
      },
    ]);
  });

  it('folds an unsupported-script confusable (Cherokee) into a Latin token', () => {
    const cherokeeT = chr(0x13a2); // Cherokee Ꭲ, confusable with Latin T
    const r = norm(`S${cherokeeT}OP`);
    expect(r.normalizedText).toBe('STOP');
  });

  const untouched = [
    'пароль', // Cyrillic
    'βιβλίο', // Greek
    'مرحبا', // Arabic
    'שלום', // Hebrew
    '你好世界', // Han
    'password', // Latin
  ];
  it.each(untouched)('leaves the wholly single-script token %s byte-identical', (token) => {
    const r = norm(token);
    expect(r.normalizedText).toBe(token);
    expect(r.transformations).toEqual([]);
  });

  it('folds only the anomalous character in a mixed-language document', () => {
    const input = `The p${CYR_A}ssword is set. Пароль установлен.`;
    const r = norm(input);
    expect(r.normalizedText).toBe('The password is set. Пароль установлен.');
    expect(r.transformations).toHaveLength(1);
    expect(r.transformations[0]).toEqual({
      kind: 'homoglyph-fold',
      originalStart: 5,
      originalEnd: 6,
      original: CYR_A,
      replacement: 'a',
    });
  });

  it('leaves an evenly tied mixed token alone', () => {
    const input = `a${CYR_A}`; // one Latin letter, one Cyrillic letter
    const r = norm(input);
    expect(r.normalizedText).toBe(input);
  });

  it('never folds to an NFKC-unstable replacement (fuzz regression)', () => {
    // Found by the fuzz suite: in this Greek-dominant token the ligature ﬁ
    // expands to "fi", and the anomalous Latin i once folded to U+037A GREEK
    // YPOGEGRAMMENI — whose NFKC form is a SPACE plus combining mark, which
    // changed tokenization and broke idempotency. Unstable representatives
    // are now rejected.
    const input = 'd' + chr(0x03bf) + 'ﬁ' + chr(0x03be) + chr(0x03b3) + chr(0x03b5);
    const first = norm(input);
    expect(first.normalizedText).not.toContain(' ');
    const second = norm(first.normalizedText);
    expect(second.normalizedText).toBe(first.normalizedText);
    expect(second.transformations).toEqual([]);
  });

  it('lets a folded character compose with a following combining mark', () => {
    // Cyrillic а + combining acute inside a Latin token: the fold produces
    // Latin 'a' + U+0301, and the NFKC re-pass composes it to á exactly as
    // native text would have been.
    const input = `p${CYR_A}${ACUTE}sta`;
    const r = norm(input);
    expect(r.normalizedText).toBe('pásta');
    // Idempotency: normalizing the output changes nothing.
    expect(normalize(r.normalizedText).normalizedText).toBe(r.normalizedText);
  });

  it('can be disabled', () => {
    const input = `p${CYR_A}ssword`;
    const r = norm(input, { homoglyphFold: false });
    expect(r.normalizedText).toBe(input);
  });
});

describe('whitespace, dashes, quotes', () => {
  it('collapses exotic spaces to a regular space', () => {
    for (const space of [
      NBSP,
      OGHAM_SPACE,
      chr(0x2000),
      chr(0x2007),
      chr(0x200a),
      chr(0x202f),
      chr(0x3000),
    ]) {
      const r = norm(`a${space}b`);
      expect(r.normalizedText).toBe('a b');
      expect([...r.offsetMap]).toEqual([0, 1, 2, 3]);
    }
  });

  it('normalizes exotic spaces even with NFKC disabled', () => {
    const r = norm(`a${NBSP}b`, { nfkc: false });
    expect(r.normalizedText).toBe('a b');
    expect(r.transformations).toEqual([
      {
        kind: 'whitespace-punct',
        originalStart: 1,
        originalEnd: 2,
        original: NBSP,
        replacement: ' ',
      },
    ]);
  });

  it('normalizes dash variants to hyphen-minus', () => {
    for (const dash of ['‐', '‑', '‒', '–', '—', '―', '−']) {
      const r = norm(`4242${dash}4242`);
      expect(r.normalizedText).toBe('4242-4242');
      expect([...r.offsetMap]).toEqual([...Array(10).keys()]);
    }
  });

  it('normalizes curly and angle quotes to straight quotes', () => {
    expect(norm('“double” and ‘single’').normalizedText).toBe('"double" and \'single\'');
    expect(norm('«guillemets» and ‹angles›').normalizedText).toBe('"guillemets" and \'angles\'');
    expect(norm('„a‟b‚c‛d').normalizedText).toBe('"a"b\'c\'d');
  });

  it('does NOT collapse runs of spaces or trim', () => {
    const input = '  a   b  \t c \n';
    const r = norm(input);
    expect(r.normalizedText).toBe(input);
    const doubled = `a${NBSP}${NBSP}b`;
    expect(norm(doubled).normalizedText).toBe('a  b'); // two spaces stay two
  });

  it('can be disabled', () => {
    const r = norm('a–b', { whitespacePunct: false });
    expect(r.normalizedText).toBe('a–b');
  });
});

describe('emoji survive intact', () => {
  it('preserves ZWJ sequences (family emoji)', () => {
    const family = `👨${ZWJ}👩${ZWJ}👧${ZWJ}👦`;
    const r = norm(family);
    expect(r.normalizedText).toBe(family);
    expect(r.transformations).toEqual([]);
    expect([...r.offsetMap]).toEqual([...Array(family.length + 1).keys()]);
  });

  it('preserves flags and skin-tone modifiers', () => {
    for (const emoji of ['🇹🇷', '🇺🇳', '👋🏽', '🧑🏿', '1️⃣']) {
      const r = norm(`ok ${emoji} done`);
      expect(r.normalizedText).toBe(`ok ${emoji} done`);
    }
  });

  it('preserves woman-facepalming with skin tone (ZWJ + VS16)', () => {
    const emoji = '🤦🏼' + ZWJ + '♀' + chr(0xfe0f);
    const r = norm(emoji);
    expect(r.normalizedText).toBe(emoji);
  });

  it('strips a ZWSP between emoji without touching the emoji', () => {
    const input = `👍${ZWSP}👎`;
    const r = norm(input);
    expect(r.normalizedText).toBe('👍👎');
    expect([...r.offsetMap]).toEqual([0, 1, 2, 4, 5]);
  });

  it('strips ZWJ that is NOT part of an emoji sequence', () => {
    const r = norm(`a${ZWJ}b`);
    expect(r.normalizedText).toBe('ab');
  });
});

describe('RTL text', () => {
  it('strips directional marks from Arabic while preserving the letters', () => {
    const input = `مرحبا${RLM} بالعالم`;
    const r = norm(input);
    expect(r.normalizedText).toBe('مرحبا بالعالم');
    expect(r.transformations).toHaveLength(1);
  });

  it('leaves Hebrew with embedded Latin untouched (separate tokens)', () => {
    const input = 'שלום hello עולם';
    const r = norm(input);
    expect(r.normalizedText).toBe(input);
    expect(r.transformations).toEqual([]);
  });

  it('handles Arabic with an embedded bidi override around Latin', () => {
    const input = `النص ${RLO}abc${PDF_CTRL} النهاية`;
    const r = norm(input);
    expect(r.normalizedText).toBe('النص abc النهاية');
  });
});

describe('other scripts pass through byte-identical', () => {
  const texts = [
    '中文文本没有变化',
    'ひらがな と カタカナ',
    '한국어 텍스트',
    'नमस्ते दुनिया',
    'สวัสดีครับ ยินดีต้อนรับ',
  ];
  it.each(texts)('%s', (text) => {
    const r = norm(text);
    expect(r.normalizedText).toBe(text);
    expect(r.transformations).toEqual([]);
  });
});

describe('edge cases', () => {
  it('survives a string ending mid-surrogate-pair', () => {
    const input = 'ab' + String.fromCharCode(0xd83d);
    const r = norm(input);
    expect(r.normalizedText).toBe(input);
  });

  it('survives lone surrogates in the middle', () => {
    const input = 'a' + String.fromCharCode(0xdc00) + String.fromCharCode(0xd800) + 'b';
    const r = norm(input);
    expect(r.normalizedText).toBe(input);
  });

  it('returns pure identity when every transform is disabled', () => {
    const input = `${ZWSP}ﬁ ${CYR_A} — “x”`;
    const r = norm(input, {
      stripInvisibles: false,
      nfkc: false,
      homoglyphFold: false,
      whitespacePunct: false,
    });
    expect(r.normalizedText).toBe(input);
    expect(r.transformations).toEqual([]);
    expect([...r.offsetMap]).toEqual([...Array(input.length + 1).keys()]);
  });

  it('keeps invisibles when only stripInvisibles is disabled', () => {
    const input = `a${ZWSP}b`;
    const r = norm(input, { stripInvisibles: false });
    expect(r.normalizedText).toBe(input);
  });

  it('keeps compatibility characters when only nfkc is disabled', () => {
    const r = norm('ﬁle', { nfkc: false });
    expect(r.normalizedText).toBe('ﬁle');
  });
});

describe('transformation records use original-text coordinates', () => {
  it('maps a change behind a deletion back to the original range', () => {
    const input = `${ZWSP}ﬁle`;
    const r = norm(input);
    expect(r.normalizedText).toBe('file');
    expect(r.transformations).toEqual([
      {
        kind: 'strip-invisibles',
        originalStart: 0,
        originalEnd: 1,
        original: ZWSP,
        replacement: '',
      },
      // The NFKC change's original range includes the absorbed deleted run.
      { kind: 'nfkc', originalStart: 0, originalEnd: 2, original: `${ZWSP}ﬁ`, replacement: 'fi' },
    ]);
  });

  it('supports a realistic substitution round-trip', () => {
    const input = 'Card: 4242‑4242'; // non-breaking hyphen U+2011
    const r = norm(input);
    expect(r.normalizedText).toBe('Card: 4242-4242');
    const start = r.normalizedText.indexOf('4242-4242');
    const span = mapNormalizedSpan(r.offsetMap, start, start + 9);
    const masked = input.slice(0, span.start) + '[CARD]' + input.slice(span.end);
    expect(masked).toBe('Card: [CARD]');
  });
});
