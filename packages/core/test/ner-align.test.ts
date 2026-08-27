/**
 * Piece→character alignment across every script Stage 0 distinguishes.
 * SPEC.md: "Correct subword token merging with exact character offsets.
 * Test explicitly across scripts: Latin with diacritics, Cyrillic, Arabic
 * (RTL), Hebrew (RTL), Han (no word boundaries), Kana, Hangul, Devanagari,
 * Thai." Each case feeds the aligner the pieces a real tokenizer produces
 * (WordPiece '##' continuations, SentencePiece splits without markers) and
 * asserts every span slices back to exactly its piece.
 */

import { describe, expect, it } from 'vitest';

import { alignPieces } from '../src/ner/align.js';

function assertExact(text: string, pieces: readonly string[]): void {
  const aligned = alignPieces(text, pieces);
  expect(aligned).toHaveLength(pieces.length);
  for (let i = 0; i < pieces.length; i++) {
    const span = aligned[i]!;
    const surface = pieces[i]!.replace(/^##/, '').replace(/^▁/, '');
    expect(span.located, `piece ${i} "${pieces[i]}" should locate`).toBe(true);
    expect(text.slice(span.start, span.end)).toBe(surface);
  }
  // Spans are non-overlapping and ordered.
  for (let i = 1; i < aligned.length; i++) {
    expect(aligned[i]!.start).toBeGreaterThanOrEqual(aligned[i - 1]!.end);
  }
}

describe('alignPieces across scripts', () => {
  it('Latin with diacritics (WordPiece)', () => {
    assertExact('Bitte kontaktieren Sie Frau Müller morgen früh.', [
      'Bitte', 'kontakt', '##ieren', 'Sie', 'Frau', 'Müller', 'morgen', 'früh', '.',
    ]);
  });

  it('Cyrillic (WordPiece continuation mid-name)', () => {
    assertExact('Отчёт подготовит Екатерина Морозова к пятнице.', [
      'Отчёт', 'под', '##готов', '##ит', 'Екатерина', 'Морозов', '##а', 'к', 'пятнице', '.',
    ]);
  });

  it('Arabic (RTL, logical order)', () => {
    assertExact('وقع عمر الخطيب على العقد أمس.', [
      'وقع', 'عمر', 'الخط', '##يب', 'على', 'العقد', 'أمس', '.',
    ]);
  });

  it('Hebrew (RTL)', () => {
    assertExact('איש הקשר: נועה לוי.', ['איש', 'הקשר', ':', 'נועה', 'לוי', '.']);
  });

  it('Han (no word boundaries, per-character pieces)', () => {
    assertExact('联系人:王小明。', ['联', '系', '人', ':', '王', '小', '明', '。']);
  });

  it('Kana/Kanji mix', () => {
    assertExact('担当者は田中美咲です。', ['担', '当', '者', 'は', '田', '中', '美', '咲', 'です', '。']);
  });

  it('Hangul (WordPiece with particles)', () => {
    assertExact('담당자는 김서연입니다.', ['담당', '##자는', '김', '##서', '##연', '##입니다', '.']);
  });

  it('Devanagari', () => {
    assertExact('संपर्क व्यक्ति: प्रिया शर्मा।', ['संपर्क', 'व्यक्ति', ':', 'प्रिया', 'शर्मा', '।']);
  });

  it('Thai (no spaces inside the name cluster)', () => {
    assertExact('ผู้ประสานงาน: สมชาย วงศ์สวัสดิ์', ['ผู้', 'ประสาน', 'งาน', ':', 'สมชาย', 'วงศ์', 'สวัสดิ์']);
  });

  it('SentencePiece-style pieces without markers (XLM-R output shape)', () => {
    assertExact('Yuki Tanaka met the team.', ['Yuk', 'i', 'Tan', 'aka', 'met', 'the', 'team', '.']);
  });

  it('SentencePiece ▁-prefixed pieces', () => {
    assertExact('Anna Kowalska arrived.', ['▁Anna', '▁Kowal', 'ska', '▁arrived', '.']);
  });
});

describe('alignPieces edge cases', () => {
  it('[UNK] pieces become zero-width, later pieces still locate', () => {
    const text = 'met ☃ Anna today';
    const aligned = alignPieces(text, ['met', '[UNK]', 'Anna', 'today']);
    expect(aligned[1]!.located).toBe(false);
    expect(aligned[1]!.start).toBe(aligned[1]!.end);
    expect(text.slice(aligned[2]!.start, aligned[2]!.end)).toBe('Anna');
  });

  it('an unfindable piece is treated like [UNK], not guessed', () => {
    const text = 'plain text here';
    const aligned = alignPieces(text, ['plain', 'MISSING', 'text']);
    expect(aligned[1]!.located).toBe(false);
    expect(text.slice(aligned[2]!.start, aligned[2]!.end)).toBe('text');
  });

  it('a piece repeated in the text matches at the cursor, not earlier', () => {
    const text = 'aba aba';
    const aligned = alignPieces(text, ['aba', 'aba']);
    expect(aligned[0]!.start).toBe(0);
    expect(aligned[1]!.start).toBe(4);
  });

  it('empty and bare-marker pieces are zero-width', () => {
    const aligned = alignPieces('word', ['▁', 'word']);
    expect(aligned[0]!.located).toBe(false);
    expect(aligned[1]!.located).toBe(true);
  });

  it('bounded search recovers a normalization skip but refuses far jumps', () => {
    // 'x' is dropped by the imaginary tokenizer; 'name' sits 3 chars ahead.
    const near = alignPieces('qq zz name', ['qq', 'name']);
    expect(near[1]!.located).toBe(true);
    // A piece 40 chars downstream is beyond the window: refuse.
    const far = alignPieces('qq ' + 'z'.repeat(40) + ' name', ['qq', 'name']);
    expect(far[1]!.located).toBe(false);
  });
});
