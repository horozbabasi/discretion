/**
 * Tests for the Stage 1 registry and runner.
 *
 * This is infrastructure every detector stands on, so the tests target the
 * contracts detectors rely on rather than any particular identifier:
 * offsets resolve to the ORIGINAL text through the Stage 0 map, the
 * confidence rule is enforced by the runner rather than by convention, and
 * failure is loud (SPEC.md fail-closed) rather than silent.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

import { normalize } from '../src/normalization.js';
import {
  registerDetector,
  allDetectors,
  getDetector,
  detectorsForRegion,
  detectorsForEntityType,
  detectorCount,
  resetRegistryForTesting,
} from '../src/detect/registry.js';
import {
  runStage1,
  DetectionTimeoutError,
  DetectorError,
} from '../src/detect/runner.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../src/detect/types.js';
import type { Detector, ValidationContext } from '../src/detect/types.js';

/** A minimal well-formed detector, overridable per test. */
function makeDetector(overrides: Partial<Detector> = {}): Detector {
  return {
    id: 'test-detector',
    entityType: 'GENERIC_SECRET',
    regions: [GLOBAL_REGION],
    pattern: /\bAAA\d{3}\b/g,
    baseConfidence: CONFIDENCE.HIGH,
    description: 'Test detector.',
    validate: () => valid(),
    ...overrides,
  };
}

beforeEach(() => {
  resetRegistryForTesting();
});

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

describe('registry', () => {
  it('registers and retrieves a detector', () => {
    const d = makeDetector();
    registerDetector(d);
    expect(detectorCount()).toBe(1);
    expect(getDetector('test-detector')).toBe(d);
    expect(allDetectors()).toEqual([d]);
  });

  it('rejects a duplicate id', () => {
    registerDetector(makeDetector());
    // Silent overwrite would be a silent hole in detection coverage.
    expect(() => registerDetector(makeDetector())).toThrow(/Duplicate detector id/);
  });

  it('rejects a malformed id', () => {
    for (const id of ['Test', 'test_detector', 'test detector', '-test', 'test-', '']) {
      expect(() => registerDetector(makeDetector({ id }))).toThrow(/kebab-case/);
    }
  });

  it('rejects a pattern without the /g flag', () => {
    // Without /g, exec() never advances and the runner would loop or
    // return only the first match depending on the call site.
    expect(() => registerDetector(makeDetector({ pattern: /abc/ }))).toThrow(/\/g flag/);
  });

  it('rejects malformed regions', () => {
    expect(() => registerDetector(makeDetector({ regions: [] }))).toThrow(/no regions/);
    expect(() => registerDetector(makeDetector({ regions: ['usa'] }))).toThrow(/alpha-2/);
    expect(() => registerDetector(makeDetector({ regions: ['US', 'Turkey'] }))).toThrow(/alpha-2/);
  });

  it('accepts ISO alpha-2 regions and the GLOBAL sentinel', () => {
    expect(() => registerDetector(makeDetector({ id: 'a', regions: ['TR', 'DE'] }))).not.toThrow();
    expect(() => registerDetector(makeDetector({ id: 'b', regions: [GLOBAL_REGION] }))).not.toThrow();
  });

  it('rejects an out-of-range base confidence', () => {
    for (const c of [0, -0.1, 1.1, Number.NaN]) {
      expect(() => registerDetector(makeDetector({ baseConfidence: c }))).toThrow(/baseConfidence/);
    }
  });

  it('rejects an empty description', () => {
    expect(() => registerDetector(makeDetector({ description: '   ' }))).toThrow(/description/);
  });

  it('filters by region, always including GLOBAL detectors', () => {
    registerDetector(makeDetector({ id: 'global-one', regions: [GLOBAL_REGION] }));
    registerDetector(makeDetector({ id: 'turkey-one', regions: ['TR'] }));
    registerDetector(makeDetector({ id: 'germany-one', regions: ['DE'] }));

    expect(detectorsForRegion('TR').map((d) => d.id)).toEqual(['global-one', 'turkey-one']);
    expect(detectorsForRegion('DE').map((d) => d.id)).toEqual(['global-one', 'germany-one']);
    expect(detectorsForRegion('JP').map((d) => d.id)).toEqual(['global-one']);
    // Undefined means "run everything" — a foreign identifier still deserves
    // protection.
    expect(detectorsForRegion(undefined)).toHaveLength(3);
  });

  it('filters by entity type', () => {
    registerDetector(makeDetector({ id: 'secret-one', entityType: 'GENERIC_SECRET' }));
    registerDetector(makeDetector({ id: 'iban-one', entityType: 'IBAN' }));
    expect(detectorsForEntityType('IBAN').map((d) => d.id)).toEqual(['iban-one']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runner — offsets
// ─────────────────────────────────────────────────────────────────────────────

describe('runner offsets', () => {
  it('emits normalized offsets that slice the matched text', () => {
    const norm = normalize('code AAA123 here');
    const [c] = runStage1(norm, { detectors: [makeDetector()] });
    expect(c).toBeDefined();
    expect(norm.normalizedText.slice(c!.start, c!.end)).toBe('AAA123');
    expect(c!.text).toBe('AAA123');
  });

  it('resolves ORIGINAL offsets through the Stage 0 offset map', () => {
    // Zero-width spaces are stripped by Stage 0, so normalized offsets are
    // shifted relative to the original. The original span must still land
    // exactly on the value — this is the bug class that silently corrupts
    // user text when masking is applied.
    const original = '​code ​AAA123 here';
    const norm = normalize(original);
    const [c] = runStage1(norm, { detectors: [makeDetector()] });

    expect(c).toBeDefined();
    expect(norm.normalizedText.slice(c!.start, c!.end)).toBe('AAA123');

    // The original span ABSORBS the stripped zero-width space that preceded
    // the value. That is the M1 offset-map contract, not a defect: deleted
    // runs attribute to the cluster that FOLLOWS them (see types.ts, "Deleted
    // characters ... attributed to the cluster that FOLLOWS"). It is also the
    // behaviour masking wants — an adversary writing "AAA<ZWSP>123" should
    // have the obfuscating character removed along with the value, not left
    // stranded beside a surrogate. Recorded as ARCHITECTURE.md D7.
    const slice = original.slice(c!.originalStart, c!.originalEnd);
    expect(slice.endsWith('AAA123')).toBe(true);
    expect(normalize(slice).normalizedText).toBe('AAA123');

    // The offsets genuinely differ, so this is a real test of the mapping.
    expect(c!.originalStart).not.toBe(c!.start);
  });

  it('resolves original offsets across an NFKC expansion', () => {
    // The ﬁ ligature expands to two characters during normalization, so
    // every offset after it shifts.
    const original = 'ﬁle AAA123';
    const norm = normalize(original);
    const [c] = runStage1(norm, { detectors: [makeDetector()] });
    expect(c).toBeDefined();
    expect(original.slice(c!.originalStart, c!.originalEnd)).toBe('AAA123');
  });

  it('PROPERTY: the original span always contains the value, for arbitrary prefixes', () => {
    const noise = fc.stringOf(fc.constantFrom('​', ' ', 'x', 'ﬁ', '½', 'Ａ', '­'), {
      maxLength: 30,
    });
    fc.assert(
      fc.property(noise, noise, (before, after) => {
        const original = `${before}AAA123${after}`;
        const norm = normalize(original);
        const found = runStage1(norm, { detectors: [makeDetector()] });
        // The invariant is NOT byte-exactness. Runs of characters that Stage 0
        // deletes are absorbed into the span on BOTH sides: a leading run
        // attributes to the cluster that follows it, and a trailing run at the
        // end of the text attributes to the sentinel. What must always hold is
        // that the span normalizes back to exactly the value — i.e. masking it
        // replaces the value and nothing else meaningful, and never truncates
        // or overruns into neighbouring content.
        for (const c of found) {
          const slice = original.slice(c.originalStart, c.originalEnd);
          expect(slice).toContain('AAA123');
          expect(normalize(slice).normalizedText).toBe('AAA123');
        }
      }),
      { numRuns: 300 },
    );
  });

  it('honours a validator that narrows the span', () => {
    // The pattern needs the "id:" anchor, but only the value may be masked.
    const detector = makeDetector({
      pattern: /id:(AAA\d{3})/g,
      validate: (ctx: ValidationContext) => {
        const value = ctx.match[1]!;
        const start = ctx.start + ctx.match[0].indexOf(value);
        return valid({ span: { start, end: start + value.length } });
      },
    });
    const norm = normalize('see id:AAA123 ok');
    const [c] = runStage1(norm, { detectors: [detector] });
    expect(c!.text).toBe('AAA123');
    expect('see id:AAA123 ok'.slice(c!.originalStart, c!.originalEnd)).toBe('AAA123');
  });

  it('rejects a validator returning an out-of-range span', () => {
    const detector = makeDetector({
      validate: () => valid({ span: { start: 0, end: 9999 } }),
    });
    expect(() => runStage1(normalize('AAA123'), { detectors: [detector] })).toThrow(DetectorError);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runner — the confidence rule
// ─────────────────────────────────────────────────────────────────────────────

describe('runner confidence rule', () => {
  it('drops a candidate whose validator fails', () => {
    // SPEC.md: a wrong checksum is not a low-confidence match, it is not a
    // match. Nothing is emitted.
    const detector = makeDetector({ validate: () => invalid('checksum failed') });
    expect(runStage1(normalize('AAA123'), { detectors: [detector] })).toEqual([]);
  });

  it('uses baseConfidence when the validator does not override it', () => {
    const [c] = runStage1(normalize('AAA123'), { detectors: [makeDetector()] });
    expect(c!.rawConfidence).toBe(CONFIDENCE.HIGH);
  });

  it('lets a validator override confidence per match', () => {
    const detector = makeDetector({ validate: () => valid({ confidence: CONFIDENCE.MEDIUM }) });
    const [c] = runStage1(normalize('AAA123'), { detectors: [detector] });
    expect(c!.rawConfidence).toBe(CONFIDENCE.MEDIUM);
  });

  it('caps a requiresContext detector at LOW while Stage 3 is absent', () => {
    // This is what stops GENERIC_SECRET from firing on entropy alone.
    const detector = makeDetector({ requiresContext: true, baseConfidence: CONFIDENCE.HIGH });
    const [c] = runStage1(normalize('AAA123'), { detectors: [detector] });
    expect(c!.rawConfidence).toBe(CONFIDENCE.LOW);
  });

  it('lets a requiresContext detector exceed LOW once context is supplied', () => {
    const detector = makeDetector({ requiresContext: true, baseConfidence: CONFIDENCE.HIGH });
    const [c] = runStage1(normalize('AAA123'), {
      detectors: [detector],
      contextFor: () => ({ assignment: true, trigger: 'api_key' }),
    });
    expect(c!.rawConfidence).toBe(CONFIDENCE.HIGH);
  });

  it('clamps confidence into [0, 1]', () => {
    const detector = makeDetector({ validate: () => valid({ confidence: 5 }) });
    const [c] = runStage1(normalize('AAA123'), { detectors: [detector] });
    expect(c!.rawConfidence).toBe(1);
  });

  it('carries sensitive=false for known test values', () => {
    // SPEC.md: known test values are "matched but classified as
    // non-sensitive" — detected so eval can assert they were seen, never
    // masked.
    const detector = makeDetector({ validate: () => valid({ sensitive: false }) });
    const [c] = runStage1(normalize('AAA123'), { detectors: [detector] });
    expect(c!.sensitive).toBe(false);
  });

  it('defaults sensitive to true', () => {
    const [c] = runStage1(normalize('AAA123'), { detectors: [makeDetector()] });
    expect(c!.sensitive).toBe(true);
  });

  it('carries canonical form, metadata and validator name', () => {
    const detector = makeDetector({
      validate: () =>
        valid({
          canonical: 'aaa123',
          metadata: { scheme: 'tckn', country: 'TR' },
          validator: 'mod-11',
        }),
    });
    const [c] = runStage1(normalize('AAA123'), { detectors: [detector] });
    expect(c!.canonical).toBe('aaa123');
    expect(c!.metadata).toEqual({ scheme: 'tckn', country: 'TR' });
    expect(c!.validatorPassed).toBe('mod-11');
  });

  it('defaults canonical to the matched text', () => {
    const [c] = runStage1(normalize('AAA123'), { detectors: [makeDetector()] });
    expect(c!.canonical).toBe('AAA123');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runner — robustness and fail-closed behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('runner robustness', () => {
  it('does not share regex lastIndex between scans', () => {
    // A module-scope /g regex keeps lastIndex across calls; the runner clones
    // to prevent it. Without the clone the second scan starts mid-string and
    // silently finds nothing.
    const detector = makeDetector();
    const norm = normalize('AAA123 AAA456');
    const first = runStage1(norm, { detectors: [detector] });
    const second = runStage1(norm, { detectors: [detector] });
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(detector.pattern.lastIndex).toBe(0);
  });

  it('terminates on a pattern that can match empty', () => {
    // Zero-length matches would spin forever without an explicit advance.
    const detector = makeDetector({ pattern: /x*/g, validate: () => valid() });
    const found = runStage1(normalize('abc'), { detectors: [detector] });
    expect(Array.isArray(found)).toBe(true);
  });

  it('finds every occurrence, not just the first', () => {
    const found = runStage1(normalize('AAA123 and AAA456 and AAA789'), {
      detectors: [makeDetector()],
    });
    expect(found.map((c) => c.text)).toEqual(['AAA123', 'AAA456', 'AAA789']);
  });

  it('wraps a throwing detector rather than swallowing it (fail closed)', () => {
    // SPEC.md non-negotiable #2. Returning a clean scan of text that was
    // never fully examined is the fail-open bug this prevents.
    const detector = makeDetector({
      validate: () => {
        throw new Error('boom');
      },
    });
    expect(() => runStage1(normalize('AAA123'), { detectors: [detector] })).toThrow(DetectorError);
    try {
      runStage1(normalize('AAA123'), { detectors: [detector] });
    } catch (e) {
      expect((e as DetectorError).detectorId).toBe('test-detector');
      // The error must not leak the matched value.
      expect((e as Error).message).not.toContain('AAA123');
    }
  });

  it('throws DetectionTimeoutError when the budget is exceeded', () => {
    const slow = makeDetector({
      id: 'slow-detector',
      validate: () => {
        const until = Date.now() + 15;
        while (Date.now() < until) {
          /* burn the budget deliberately */
        }
        return valid();
      },
    });
    const other = makeDetector({ id: 'other-detector' });
    expect(() =>
      runStage1(normalize('AAA123 AAA456'), { detectors: [slow, other], budgetMs: 1 }),
    ).toThrow(DetectionTimeoutError);
  });

  it('returns an empty array for text with no matches', () => {
    expect(runStage1(normalize('nothing here'), { detectors: [makeDetector()] })).toEqual([]);
  });

  it('handles empty input', () => {
    expect(runStage1(normalize(''), { detectors: [makeDetector()] })).toEqual([]);
  });

  it('runs every registered detector when none are passed explicitly', () => {
    registerDetector(makeDetector({ id: 'one', pattern: /AAA\d{3}/g }));
    registerDetector(makeDetector({ id: 'two', pattern: /BBB\d{3}/g }));
    const found = runStage1(normalize('AAA123 BBB456'));
    expect(found.map((c) => c.detectorId).sort()).toEqual(['one', 'two']);
  });
});
