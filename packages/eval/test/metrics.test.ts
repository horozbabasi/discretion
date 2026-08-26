/**
 * Metrics scoring, verified on hand-built micro-corpora with known
 * outcomes — the scorer itself must be trustworthy before its numbers mean
 * anything.
 */

import { describe, it, expect } from 'vitest';

import type { LabeledDocument } from '../src/index.js';
import { runEval } from '../src/metrics.js';
import { renderReport } from '../src/report.js';

function doc(partial: Partial<LabeledDocument> & { text: string }): LabeledDocument {
  return {
    id: partial.id ?? 'doc-t-0',
    language: partial.language ?? 'en',
    docType: partial.docType ?? 'prose',
    text: partial.text,
    entities: partial.entities ?? [],
    hardNegative: partial.hardNegative ?? false,
  };
}

describe('runEval', () => {
  it('scores a clean true positive as exact precision and recall 1', () => {
    const text = 'mail john.doe@gmail.com now';
    const result = runEval([
      doc({
        text,
        entities: [{ type: 'EMAIL', scheme: 'email', text: 'john.doe@gmail.com', start: 5, end: 23, obfuscated: false }],
      }),
    ]);
    const m = result.byType['EMAIL']!;
    expect(m.groundTruth).toBe(1);
    expect(m.matchedExact).toBe(1);
    expect(m.matchedPartial).toBe(1);
    expect(m.falseNegatives).toBe(0);
    expect(m.precision).toBe(1);
    expect(m.recallExact).toBe(1);
    expect(m.f1).toBe(1);
  });

  it('separates partial from exact matches', () => {
    // Ground truth deliberately includes the leading space, so the detector
    // span (the address alone) overlaps but is not exact.
    const text = 'mail john.doe@gmail.com now';
    const result = runEval([
      doc({
        text,
        entities: [{ type: 'EMAIL', scheme: 'email', text: ' john.doe@gmail.com', start: 4, end: 23, obfuscated: false }],
      }),
    ]);
    const m = result.byType['EMAIL']!;
    expect(m.matchedPartial).toBe(1);
    expect(m.matchedExact).toBe(0);
    expect(m.recallPartial).toBe(1);
    expect(m.recallExact).toBe(0);
  });

  it('counts a miss as a false negative with context recorded', () => {
    const text = 'nothing detectable here at all';
    const result = runEval([
      doc({
        text,
        entities: [{ type: 'EMAIL', scheme: 'email', text: 'nothing', start: 0, end: 7, obfuscated: false }],
      }),
    ]);
    const m = result.byType['EMAIL']!;
    expect(m.falseNegatives).toBe(1);
    expect(result.falseNegatives).toHaveLength(1);
    expect(result.falseNegatives[0]!.scheme).toBe('email');
  });

  it('counts hard-negative detections as false positives with their category', () => {
    // AKIA + 16 chars satisfies the AWS shape rule: a placeholder that the
    // Stage-1 detector will flag sensitive — a known, measured FP.
    const result = runEval([
      doc({
        id: 'neg-1-0-placeholder-code',
        text: 'AWS_ACCESS_KEY_ID = "AKIAXXXXXXXXXXXXXXXX"',
        hardNegative: true,
      }),
    ]);
    const m = result.byType['API_KEY'];
    expect(m).toBeDefined();
    expect(m!.falsePositives).toBeGreaterThanOrEqual(1);
    expect(result.hardNegativeFalsePositivesByCategory['placeholder-code']).toBeGreaterThanOrEqual(1);
    expect(result.falsePositives[0]!.hardNegativeCategory).toBe('placeholder-code');
  });

  it('a mismatched type is both a false negative and a false positive', () => {
    // GT claims the span is a PHONE; the detector reports EMAIL.
    const text = 'mail john.doe@gmail.com now';
    const result = runEval([
      doc({
        text,
        entities: [{ type: 'PHONE', scheme: 'phone', text: 'john.doe@gmail.com', start: 5, end: 23, obfuscated: false }],
      }),
    ]);
    expect(result.byType['PHONE']!.falseNegatives).toBe(1);
    expect(result.byType['EMAIL']!.falsePositives).toBe(1);
  });

  it('reports latency percentiles and renders a report', () => {
    const result = runEval([doc({ text: 'plain filler text with nothing in it' })]);
    expect(result.latencyMs.p50).toBeGreaterThanOrEqual(0);
    expect(result.latencyMs.max).toBeGreaterThanOrEqual(result.latencyMs.p50);
    const md = renderReport(result, 'Test report');
    expect(md).toContain('# Test report');
    expect(md).toContain('synthetic');
  });
});
