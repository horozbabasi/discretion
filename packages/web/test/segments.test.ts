/**
 * Pure span arithmetic for the two panes. The load-bearing invariants:
 * segment lists are concat-identities of their source text, and the output
 * segments rebuild EXACTLY the masked text the masker produced — if these
 * drift, the highlights annotate the wrong characters.
 */

import { describe, expect, it } from 'vitest';

import { Vault, generate, maskOriginal, normalize, runStage1 } from '@privacyshield/core';
import type { Stage1Candidate } from '@privacyshield/core';
import {
  buildInputSegments,
  buildOutputSegments,
  countByType,
  resolveForDisplay,
} from '../src/segments.js';

function candidate(overrides: Partial<Stage1Candidate> & Pick<Stage1Candidate, 'originalStart' | 'originalEnd'>): Stage1Candidate {
  const text = 'x'.repeat(overrides.originalEnd - overrides.originalStart);
  return {
    text,
    type: 'EMAIL',
    start: overrides.originalStart,
    end: overrides.originalEnd,
    rawConfidence: 0.85,
    stage: 'stage1-validated-identifier',
    detectorId: 'test-detector',
    sensitive: true,
    canonical: text,
    ...overrides,
  };
}

describe('resolveForDisplay', () => {
  it('drops overlap-shadowed candidates, keeping the higher-confidence span', () => {
    const winner = candidate({ originalStart: 5, originalEnd: 20, rawConfidence: 0.9 });
    const shadowed = candidate({ originalStart: 10, originalEnd: 18, rawConfidence: 0.6 });
    const displayed = resolveForDisplay([shadowed, winner]);
    expect(displayed).toEqual([winner]);
  });

  it('keeps non-sensitive test values when they do not overlap a masked span', () => {
    const masked = candidate({ originalStart: 0, originalEnd: 10 });
    const testValue = candidate({ originalStart: 15, originalEnd: 25, sensitive: false });
    const displayed = resolveForDisplay([masked, testValue]);
    expect(displayed).toEqual([masked, testValue]);
  });

  it('drops a non-sensitive candidate that overlaps a masked span', () => {
    const masked = candidate({ originalStart: 0, originalEnd: 10 });
    const overlappingTest = candidate({ originalStart: 8, originalEnd: 14, sensitive: false });
    expect(resolveForDisplay([masked, overlappingTest])).toEqual([masked]);
  });
});

describe('buildInputSegments', () => {
  it('is a concat-identity over the source text', () => {
    const text = 'before someone@example-corp.net after';
    const c = candidate({ originalStart: 7, originalEnd: 30 });
    const segments = buildInputSegments(text, [c]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.filter((s) => s.candidate !== undefined)).toHaveLength(1);
    expect(segments[1]!.text).toBe(text.slice(7, 30));
  });

  it('slices by UTF-16 code units so astral characters cannot shift spans', () => {
    // The emoji is 2 code units; a span computed AFTER it must land exactly.
    const text = '🛡️ mail: a@b.co end';
    const start = text.indexOf('a@b.co');
    const c = candidate({ originalStart: start, originalEnd: start + 6 });
    const segments = buildInputSegments(text, [c]);
    expect(segments.map((s) => s.text).join('')).toBe(text);
    expect(segments.find((s) => s.candidate !== undefined)!.text).toBe('a@b.co');
  });

  it('handles adjacent spans and a span at position 0', () => {
    const text = 'ab';
    const first = candidate({ originalStart: 0, originalEnd: 1 });
    const second = candidate({ originalStart: 1, originalEnd: 2 });
    const segments = buildInputSegments(text, [first, second]);
    expect(segments.map((s) => s.text)).toEqual(['a', 'b']);
  });
});

describe('buildOutputSegments', () => {
  it('rebuilds exactly the masked text the real masker produced', () => {
    const text =
      `Wire ${generate.generateValidIban(3)} today, card ${generate.generateValidCard(4)}, ` +
      `mail ${generate.generateValidEmail(5)} or ${generate.generateValidEmail(5)} again.`;
    const vault = new Vault();
    const result = maskOriginal(text, runStage1(normalize(text)), vault, { seed: 11 });
    expect(result.entities.length).toBeGreaterThanOrEqual(3);

    const segments = buildOutputSegments(text, result.entities);
    expect(segments.map((s) => s.text).join('')).toBe(result.maskedText);
    // Every replacement segment carries its entity; plain segments none.
    const replaced = segments.filter((s) => s.entity !== undefined);
    expect(replaced.map((s) => s.text)).toEqual(result.entities.map((e) => e.replacement));
  });

  it('token mode rebuilds identically', () => {
    const text = `Reach ${generate.generateValidEmail(9)} re account ${generate.generateValidIban(10)}.`;
    const vault = new Vault();
    const result = maskOriginal(text, runStage1(normalize(text)), vault, { mode: 'token' });
    const joined = buildOutputSegments(text, result.entities)
      .map((s) => s.text)
      .join('');
    expect(joined).toBe(result.maskedText);
  });
});

describe('countByType', () => {
  it('buckets masked and test values separately per type', () => {
    const displayed = [
      candidate({ originalStart: 0, originalEnd: 5 }),
      candidate({ originalStart: 10, originalEnd: 15 }),
      candidate({ originalStart: 20, originalEnd: 25, sensitive: false }),
      candidate({ originalStart: 30, originalEnd: 40, type: 'IBAN' }),
    ];
    const counts = countByType(displayed);
    expect(counts).toEqual([
      { type: 'EMAIL', masked: 2, testValues: 1 },
      { type: 'IBAN', masked: 1, testValues: 0 },
    ]);
  });
});
