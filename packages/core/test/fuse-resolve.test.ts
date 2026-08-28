/**
 * Stage 4 overlap resolution.
 *
 * SPEC.md: "Resolve overlapping candidates: prefer the more specific type,
 * then higher calibrated confidence, then longer span. Never emit overlapping
 * entities."
 *
 * Resolution DROPS candidates, so D18's rule applies to it as it applies to a
 * suppression rule — and it has a failure mode a suppression rule does not.
 * Dropping a WIDE candidate in favour of a narrow one it contains does not
 * relabel a span, it UNMASKS the characters outside the narrow one. The
 * coverage tests below are the important half of this file; the specificity
 * tests only decide which label a fully-covered span carries.
 */
import { describe, expect, it } from 'vitest';

import { coverageHoles, resolveOverlaps, type ScoredForResolution } from '../src/fuse/resolve.js';
import type { PipelineCandidate } from '../src/context/types.js';
import type { EntityType } from '../src/types.js';

function at(
  type: EntityType,
  start: number,
  end: number,
  options: { confidence?: number; sensitive?: boolean } = {},
): ScoredForResolution {
  const candidate: PipelineCandidate = {
    text: 'x'.repeat(end - start),
    type,
    start,
    end,
    originalStart: start,
    originalEnd: end,
    rawConfidence: options.confidence ?? 0.5,
    stage: 'stage1-validated-identifier',
    detectorId: `test-${type.toLowerCase()}`,
    sensitive: options.sensitive ?? true,
    canonical: 'x',
  };
  return { candidate, confidence: options.confidence ?? 0.5 };
}

const types = (r: { emitted: readonly ScoredForResolution[] }): EntityType[] =>
  r.emitted.map((i) => i.candidate.type);

describe('overlap resolution — coverage is never reduced', () => {
  it('keeps the containing span, not the contained one', () => {
    // The naive reading of "prefer the more specific type" would take
    // CONNECTION_STRING here and leave the rest of the URL unmasked.
    const items = [at('URL_WITH_CREDENTIALS', 0, 60), at('POSTAL_CODE', 40, 44)];
    const result = resolveOverlaps(items);
    expect(types(result)).toEqual(['URL_WITH_CREDENTIALS']);
    expect(coverageHoles(items, result.emitted)).toEqual([]);
  });

  it('absorbs a partial overlap rather than dropping its overhang', () => {
    // The measured leak: a street address abutting a crypto wallet, sharing
    // two characters. Dropping the address left its first five unmasked.
    const items = [at('STREET_ADDRESS', 5, 12), at('CRYPTO_WALLET', 10, 105)];
    const result = resolveOverlaps(items);

    expect(result.emitted).toHaveLength(1);
    const span = result.emitted[0]!.candidate;
    expect(span.start).toBe(5);
    expect(span.end).toBe(105);
    expect(coverageHoles(items, result.emitted)).toEqual([]);
  });

  it('widens the original-text span too, not just the normalized one', () => {
    // Masking edits the ORIGINAL, so a union that widened only the normalized
    // span would still leak.
    const items = [at('STREET_ADDRESS', 5, 12), at('IP_ADDRESS', 10, 38)];
    const winner = resolveOverlaps(items).emitted[0]!.candidate;
    expect(winner.originalStart).toBe(5);
    expect(winner.originalEnd).toBe(38);
  });

  it('emits nothing that overlaps anything else', () => {
    const items = [
      at('PHONE', 0, 20),
      at('POSTAL_CODE', 5, 10),
      at('NATIONAL_ID', 8, 14),
      at('EMAIL', 30, 50),
      at('GENERIC_SECRET', 35, 45),
    ];
    const { emitted } = resolveOverlaps(items);
    for (let i = 0; i < emitted.length; i += 1) {
      for (let j = i + 1; j < emitted.length; j += 1) {
        const a = emitted[i]!.candidate;
        const b = emitted[j]!.candidate;
        expect(a.start < b.end && b.start < a.end, `${a.type} vs ${b.type}`).toBe(false);
      }
    }
  });

  it('never lets a non-sensitive candidate displace a sensitive one', () => {
    // Known test values are detected so the eval can assert they were seen.
    // Letting one win an overlap would unmask whatever it covers.
    const items = [at('IBAN', 0, 30, { sensitive: false }), at('GENERIC_SECRET', 0, 30)];
    const result = resolveOverlaps(items);
    expect(result.emitted[0]!.candidate.sensitive).toBe(true);
  });
});

describe('overlap resolution — the specificity order, which the census measured', () => {
  it('prefers a connection string over a credentialled URL on equal spans', () => {
    // Ground truth agreed with CONNECTION_STRING in 140 of 140 equal-span
    // overlaps: the DB scheme is the more specific reading of the same
    // characters.
    const items = [at('URL_WITH_CREDENTIALS', 0, 50), at('CONNECTION_STRING', 0, 50)];
    expect(types(resolveOverlaps(items))).toEqual(['CONNECTION_STRING']);
  });

  it('prefers any validated type over a generic high-entropy match', () => {
    // 2,047 of 2,053 measured overlaps went the specific type's way.
    for (const specific of ['CRYPTO_WALLET', 'JWT', 'API_KEY', 'PRIVATE_KEY', 'IBAN'] as const) {
      const items = [at('GENERIC_SECRET', 0, 40), at(specific, 0, 40)];
      expect(types(resolveOverlaps(items)), specific).toEqual([specific]);
    }
  });

  it('falls through to confidence where two schemes are genuinely ambiguous', () => {
    // NATIONAL_ID and TAX_ID tie on specificity on purpose: the census found
    // ground truth split between them on equal spans, so no static ordering
    // is honest and calibrated confidence has to settle it.
    const taxWins = resolveOverlaps([
      at('NATIONAL_ID', 0, 11, { confidence: 0.4 }),
      at('TAX_ID', 0, 11, { confidence: 0.9 }),
    ]);
    expect(types(taxWins)).toEqual(['TAX_ID']);

    const idWins = resolveOverlaps([
      at('NATIONAL_ID', 0, 11, { confidence: 0.9 }),
      at('TAX_ID', 0, 11, { confidence: 0.4 }),
    ]);
    expect(types(idWins)).toEqual(['NATIONAL_ID']);
  });

  it('is deterministic regardless of input order', () => {
    const items = [
      at('POSTAL_CODE', 5, 10),
      at('PHONE', 0, 20),
      at('GENERIC_SECRET', 0, 20),
      at('NATIONAL_ID', 8, 14),
    ];
    const forward = types(resolveOverlaps(items));
    const backward = types(resolveOverlaps([...items].reverse()));
    expect(forward).toEqual(backward);
  });
});
