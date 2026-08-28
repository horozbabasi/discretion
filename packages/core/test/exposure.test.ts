/**
 * The exposure score.
 *
 * SPEC.md requires two things of this engine that are easy to state and easy
 * to get wrong:
 *
 *   "EXPLAINABLE BY CONSTRUCTION: a deterministic aggregation … and the report
 *    decomposes the total into named contributions. A score that cannot show
 *    its work is not acceptable."
 *   "Property test required: monotonicity — adding a detected entity never
 *    lowers the score; removing one never raises it."
 *
 * MONOTONICITY IS TESTED INDEPENDENTLY of the calibration monotonicity that
 * `fuse-calibrate.test.ts` already checks. The two are separate properties
 * with separate failure modes: calibration could be perfectly monotonic while
 * the exposure aggregation broke the property through a negative contribution
 * or a non-increasing transform. Inheriting it would leave that gap untested,
 * so nothing here consumes the calibrator — the inputs are confidences given
 * directly.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { computeExposure, exposureBand, type ExposureInput } from '../src/exposure/index.js';
import { CATEGORY_OF, SEVERITY_WEIGHTS, TYPE_FACTORS } from '@privacyshield/data';
import type { EntityType } from '../src/types.js';

const SCORABLE = Object.keys(CATEGORY_OF) as EntityType[];

const entityArb = fc.record({
  type: fc.constantFrom(...SCORABLE),
  calibratedConfidence: fc.double({ min: 0, max: 1, noNaN: true }),
});

describe('exposure — monotonicity, the property SPEC requires', () => {
  it('adding an entity never lowers the score', () => {
    fc.assert(
      fc.property(fc.array(entityArb, { maxLength: 25 }), entityArb, (entities, extra) => {
        const before = computeExposure(entities).score;
        const after = computeExposure([...entities, extra]).score;
        expect(after).toBeGreaterThanOrEqual(before - 1e-9);
      }),
      { numRuns: 500 },
    );
  });

  it('removing an entity never raises the score', () => {
    fc.assert(
      fc.property(fc.array(entityArb, { minLength: 1, maxLength: 25 }), (entities) => {
        const full = computeExposure(entities).score;
        for (let i = 0; i < entities.length; i += 1) {
          const without = [...entities.slice(0, i), ...entities.slice(i + 1)];
          expect(computeExposure(without).score).toBeLessThanOrEqual(full + 1e-9);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('raising one entity\'s confidence never lowers the score', () => {
    // The other direction of the same property: more evidence, more exposure.
    fc.assert(
      fc.property(
        fc.array(entityArb, { minLength: 1, maxLength: 10 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (entities, bump) => {
          const raised = entities.map((e, i) =>
            i === 0 ? { ...e, calibratedConfidence: Math.max(e.calibratedConfidence, bump) } : e,
          );
          expect(computeExposure(raised).score).toBeGreaterThanOrEqual(
            computeExposure(entities).score - 1e-9,
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('never leaves the 0–100 range, however many entities', () => {
    fc.assert(
      fc.property(fc.array(entityArb, { maxLength: 300 }), (entities) => {
        const { score } = computeExposure(entities);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200 },
    );
  });
});

describe('exposure — explainable by construction', () => {
  it('decomposes the total into named contributions that sum to it', () => {
    const entities: ExposureInput[] = [
      { type: 'NATIONAL_ID', calibratedConfidence: 0.9 },
      { type: 'EMAIL', calibratedConfidence: 0.8 },
      { type: 'POSTAL_CODE', calibratedConfidence: 0.4 },
    ];
    const report = computeExposure(entities);
    const summed = report.contributions.reduce((s, c) => s + c.points, 0);
    expect(summed).toBeCloseTo(report.rawPoints, 9);
  });

  it('shows the arithmetic of each contribution', () => {
    const report = computeExposure([{ type: 'STREET_ADDRESS', calibratedConfidence: 0.5 }]);
    const c = report.contributions[0]!;
    // confidence × category weight × per-type factor, all visible.
    expect(c.points).toBeCloseTo(c.confidence * c.weight * c.factor, 9);
    expect(c.weight).toBe(SEVERITY_WEIGHTS.location.weight);
    expect(c.factor).toBe(TYPE_FACTORS.STREET_ADDRESS!.factor);
  });

  it('category shares sum to one when anything scored', () => {
    const report = computeExposure([
      { type: 'API_KEY', calibratedConfidence: 0.9 },
      { type: 'PERSON', calibratedConfidence: 0.9 },
    ]);
    const total = report.byCategory.reduce((s, c) => s + c.share, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('is deterministic regardless of entity order', () => {
    const entities: ExposureInput[] = [
      { type: 'IBAN', calibratedConfidence: 0.7 },
      { type: 'HEALTH_DATA', calibratedConfidence: 0.6 },
      { type: 'PHONE', calibratedConfidence: 0.95 },
    ];
    const forward = computeExposure(entities);
    const backward = computeExposure([...entities].reverse());
    expect(backward.score).toBeCloseTo(forward.score, 12);
    expect(backward.topContributors.map((c) => c.type)).toEqual(
      forward.topContributors.map((c) => c.type),
    );
  });

  it('carries the limitation SPEC requires wherever the score is shown', () => {
    const report = computeExposure([{ type: 'EMAIL', calibratedConfidence: 0.9 }]);
    expect(report.limitation).toContain('not a guarantee of safety');
  });
});

describe('exposure — the severity ordering the weights encode', () => {
  it('ranks an irreversible identifier above a rotatable credential', () => {
    // The judgement this file rests on: permanence outranks acuteness.
    const identity = computeExposure([{ type: 'NATIONAL_ID', calibratedConfidence: 1 }]).score;
    const secret = computeExposure([{ type: 'API_KEY', calibratedConfidence: 1 }]).score;
    expect(identity).toBeGreaterThan(secret);
  });

  it('ranks a validated card above a city name, as SPEC states outright', () => {
    const card = computeExposure([{ type: 'CREDIT_CARD', calibratedConfidence: 1 }]).score;
    const city = computeExposure([{ type: 'LOCATION', calibratedConfidence: 1 }]).score;
    expect(card).toBeGreaterThan(city);
  });

  it('ranks a street address above a postal code within one category', () => {
    const street = computeExposure([{ type: 'STREET_ADDRESS', calibratedConfidence: 1 }]).score;
    const postal = computeExposure([{ type: 'POSTAL_CODE', calibratedConfidence: 1 }]).score;
    expect(street).toBeGreaterThan(postal);
  });

  it('gives one certain identity number a score that already reads as serious', () => {
    // A document does not need many identifiers to be dangerous.
    const score = computeExposure([{ type: 'NATIONAL_ID', calibratedConfidence: 1 }]).score;
    expect(score).toBeGreaterThan(50);
    expect(exposureBand(score)).toBe('high');
  });

  it('scores an empty document at zero', () => {
    const report = computeExposure([]);
    expect(report.score).toBe(0);
    expect(exposureBand(report.score)).toBe('none');
    expect(report.byCategory).toEqual([]);
  });

  it('ignores a candidate too uncertain to mean anything', () => {
    expect(computeExposure([{ type: 'NATIONAL_ID', calibratedConfidence: 0.01 }]).score).toBe(0);
  });

  it('every scorable type has a category and every category a rationale', () => {
    // The file's own contract: no weight without a stated reason.
    for (const type of SCORABLE) {
      const category = CATEGORY_OF[type]!;
      expect(SEVERITY_WEIGHTS[category], type).toBeDefined();
      expect(SEVERITY_WEIGHTS[category].rationale.length, category).toBeGreaterThan(80);
    }
    for (const [type, factor] of Object.entries(TYPE_FACTORS)) {
      expect(factor.rationale.length, type).toBeGreaterThan(60);
    }
  });
});
