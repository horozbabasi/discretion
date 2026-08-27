/**
 * BIO decoding: both tagging conventions the candidate models use (IOB2
 * with B- starts; IOB1 where entities open with I- — verified against the
 * real XLM-R CoNLL03 runtime output), boundary handling, bridging across
 * unlocatable pieces, and the conservative min-score aggregate.
 */

import { describe, expect, it } from 'vitest';

import { alignPieces } from '../src/ner/align.js';
import { decodeEntities } from '../src/ner/merge.js';
import type { TokenPrediction } from '../src/ner/types.js';

function preds(pairs: readonly (readonly [string, string, number?])[]): TokenPrediction[] {
  return pairs.map(([piece, label, score]) => ({ piece, label, score: score ?? 0.99 }));
}

function decode(text: string, pairs: readonly (readonly [string, string, number?])[]) {
  const p = preds(pairs);
  return decodeEntities(text, p, alignPieces(text, p.map((x) => x.piece)));
}

describe('decodeEntities', () => {
  it('IOB2: B- starts, I- continues, multi-token name merges to one span', () => {
    const spans = decode('Reach Anna Maria Kowalska today.', [
      ['Reach', 'O'], ['Anna', 'B-PER'], ['Maria', 'I-PER'], ['Kowal', 'I-PER'], ['##ska', 'I-PER'], ['today', 'O'], ['.', 'O'],
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ type: 'PERSON', text: 'Anna Maria Kowalska' });
  });

  it('IOB1: an entity may open with I- (XLM-R CoNLL03 output shape)', () => {
    const spans = decode('Yuki Tanaka met Bangkok.', [
      ['Yuk', 'I-PER'], ['i', 'I-PER'], ['Tan', 'I-PER'], ['aka', 'I-PER'], ['met', 'O'], ['Bangkok', 'I-LOC'], ['.', 'O'],
    ]);
    expect(spans.map((s) => [s.type, s.text])).toEqual([
      ['PERSON', 'Yuki Tanaka'],
      ['LOCATION', 'Bangkok'],
    ]);
  });

  it('a label-type change is an entity boundary even without O between', () => {
    const spans = decode('Anna Veltrix', [
      ['Anna', 'B-PER'], ['Veltrix', 'I-ORG'],
    ]);
    expect(spans.map((s) => [s.type, s.text])).toEqual([
      ['PERSON', 'Anna'],
      ['ORG', 'Veltrix'],
    ]);
  });

  it('B- after a same-type entity starts a NEW entity (adjacent entities)', () => {
    const spans = decode('Anna Boris', [
      ['Anna', 'B-PER'], ['Boris', 'B-PER'],
    ]);
    expect(spans.map((s) => s.text)).toEqual(['Anna', 'Boris']);
  });

  it('MISC and unknown labels are dropped', () => {
    const spans = decode('The Treaty of Rome', [
      ['The', 'O'], ['Treaty', 'B-MISC'], ['of', 'I-MISC'], ['Rome', 'I-LOC'],
    ]);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ type: 'LOCATION', text: 'Rome' });
  });

  it('score is the MINIMUM across the entity tokens', () => {
    const spans = decode('Anna Kowalska', [
      ['Anna', 'B-PER', 0.98], ['Kowalska', 'I-PER', 0.61],
    ]);
    expect(spans[0]!.score).toBeCloseTo(0.61);
  });

  it('bridges an [UNK] inside an entity, span bounded by located pieces', () => {
    const text = 'Anna ☃nna Kowalska works here';
    const p = preds([
      ['Anna', 'B-PER'], ['[UNK]', 'I-PER'], ['Kowalska', 'I-PER'], ['works', 'O'], ['here', 'O'],
    ]);
    const spans = decodeEntities(text, p, alignPieces(text, p.map((x) => x.piece)));
    expect(spans).toHaveLength(1);
    expect(spans[0]!.text).toBe('Anna ☃nna Kowalska');
  });

  it('an entity made ONLY of unlocatable pieces is dropped, never guessed', () => {
    const text = 'plain text';
    const p = preds([['plain', 'O'], ['[UNK]', 'B-PER'], ['text', 'O']]);
    const spans = decodeEntities(text, p, alignPieces(text, p.map((x) => x.piece)));
    expect(spans).toHaveLength(0);
  });

  it('CJK single-character pieces merge into one contiguous name', () => {
    const spans = decode('联系人:王小明。', [
      ['联', 'O'], ['系', 'O'], ['人', 'O'], [':', 'O'], ['王', 'B-PER'], ['小', 'I-PER'], ['明', 'I-PER'], ['。', 'O'],
    ]);
    expect(spans[0]).toMatchObject({ type: 'PERSON', text: '王小明' });
  });
});
