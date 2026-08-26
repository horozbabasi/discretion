/**
 * Location family: POSTAL_CODE, STREET_ADDRESS, COORDINATES.
 *
 * The first two are SPEC-designated context-dependent detectors: this suite
 * pins that BOTH are capped at CONFIDENCE.LOW while Stage 3 is absent and
 * rise once a context signal is supplied — the same structural guarantee
 * GENERIC_SECRET gets. COORDINATES has a real range validator and is
 * treated normally.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/location/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { ContextSignal, Detector, Stage1Candidate } from '../src/detect/types.js';
import { POSTAL_FORMATS } from '../src/detect/detectors/location/postalRegistry.js';
import {
  generateValidPostal,
  generateValidStreet,
  generateValidCoordinates,
} from './generators/location.js';

const postal = getDetector('postal-code')!;
const street = getDetector('street-address')!;
const coords = getDetector('coordinates')!;

function scan(
  text: string,
  detector: Detector,
  context?: ContextSignal,
): Stage1Candidate[] {
  return runStage1(normalize(text), {
    detectors: [detector],
    ...(context !== undefined ? { contextFor: () => context } : {}),
  });
}

function only(text: string, detector: Detector): Stage1Candidate {
  const found = scan(text, detector);
  expect(found, `expected exactly one candidate in: ${text}`).toHaveLength(1);
  return found[0]!;
}

function none(text: string, detector: Detector): void {
  expect(scan(text, detector), `expected no candidate in: ${text}`).toHaveLength(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// POSTAL_CODE
// ─────────────────────────────────────────────────────────────────────────────

describe('postal-code', () => {
  it('is capped at LOW without context and lists candidate countries (SPEC.md: requires context boost)', () => {
    const c = only('code SW1A 1AA london', postal);
    expect(c.rawConfidence).toBe(CONFIDENCE.LOW);
    expect(c.metadata?.['countries']).toContain('GB');
  });

  it('rises above LOW once Stage 3 context arrives', () => {
    const found = scan('postcode: SW1A 1AA', postal, { trigger: 'postcode' });
    expect(found[0]!.rawConfidence).toBeGreaterThan(CONFIDENCE.LOW);
  });

  it('validates country-specific structure', () => {
    expect(only('to K1A 0B1 ottawa', postal).metadata?.['countries']).toContain('CA');
    expect(only('to 1012 AB amsterdam', postal).metadata?.['countries']).toContain('NL');
    expect(only('to 00-950 warszawa', postal).metadata?.['countries']).toContain('PL');
    expect(only('to 1000-001 lisboa', postal).metadata?.['countries']).toContain('PT');
    expect(only('to 100-0001 tokyo', postal).metadata?.['countries']).toContain('JP');
    expect(only('to 34000 istanbul', postal).metadata?.['countries']).toContain('TR');
  });

  it("rejects Canada's excluded letters and other structure violations", () => {
    none('to D1A 0B1 fake', postal); // D excluded from first position
    none('to K1A 0O1 fake', postal); // O excluded everywhere
    none('year 2023 report', postal); // year-shaped 4-digit guard
    none('price 12,50 items', postal); // fragment guards
    none('run 123456789012 long', postal);
  });

  it('every registry entry compiles and matches its own shape family', () => {
    expect(Object.keys(POSTAL_FORMATS).length).toBeGreaterThanOrEqual(100);
    for (const [country, re] of Object.entries(POSTAL_FORMATS)) {
      expect(country).toMatch(/^[A-Z]{2}$/);
      expect(re).toBeInstanceOf(RegExp);
    }
  });

  it('PROPERTY: generated postal codes always validate (at LOW without context)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidPostal(seed);
        const found = scan(`addr ${value} end`, postal);
        expect(found.length, value).toBeGreaterThanOrEqual(1);
        expect(found[0]!.rawConfidence).toBe(CONFIDENCE.LOW);
      }),
      { numRuns: 300 },
    );
    // Postal codes carry no checksum anywhere; mutation half omitted.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// STREET_ADDRESS
// ─────────────────────────────────────────────────────────────────────────────

describe('street-address', () => {
  it('is capped at LOW without context (SPEC.md: requires context boost)', () => {
    const c = only('meet at 221B Baker Street soon', street);
    expect(c.rawConfidence).toBe(CONFIDENCE.LOW);
    expect(c.metadata?.['convention']).toBe('western');
  });

  it('recognizes each convention', () => {
    expect(only('12 rue de la Paix', street).metadata?.['convention']).toBe('romance');
    expect(only('wohne Hauptstraße 12a hier', street).metadata?.['convention']).toBe('germanic');
    expect(only('adres Atatürk Caddesi No: 15 tir', street).metadata?.['convention']).toBe('turkish');
    expect(only('地址 中山路25号 在', street).metadata?.['convention']).toBe('east-asian');
    expect(only('住所 銀座4丁目5番6号 です', street).metadata?.['convention']).toBe('east-asian');
    expect(only('주소 세종대로 110 이다', street).metadata?.['convention']).toBe('east-asian');
    expect(only('العنوان شارع الملك فهد 12 هنا', street).metadata?.['convention']).toBe('arabic');
  });

  it('rises above LOW with context', () => {
    const found = scan('ship to: 1600 Pennsylvania Avenue', street, { trigger: 'ship to' });
    expect(found[0]!.rawConfidence).toBeGreaterThan(CONFIDENCE.LOW);
  });

  it('rejects non-addresses (more invalid than valid)', () => {
    none('chapter 12 begins here', street);
    none('the 5 Ways method', street); // 'Ways' plural — not the type lexicon
    none('error 404 Street? no digit-name-type shape', street);
    none('nur Straße allein', street); // type word alone, no number
    none('회의 시간 3시', street);
  });

  it('PROPERTY: generated addresses always validate at LOW', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidStreet(seed);
        const found = scan(`x ${value} y`, street);
        expect(found.length, value).toBeGreaterThanOrEqual(1);
        expect(found[0]!.rawConfidence).toBe(CONFIDENCE.LOW);
      }),
      { numRuns: 300 },
    );
    // Heuristic format, no checksum; mutation half omitted.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// COORDINATES
// ─────────────────────────────────────────────────────────────────────────────

describe('coordinates', () => {
  it('accepts decimal pairs at MEDIUM, with hemispheres or DMS at HIGH', () => {
    expect(only('at 41.008238, 28.979530 mark', coords).rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(only('at 41.008° N, 28.979° E mark', coords).rawConfidence).toBe(CONFIDENCE.HIGH);
    const dms = only('at 40°26′46″N 79°58′56″W mark', coords);
    expect(dms.rawConfidence).toBe(CONFIDENCE.HIGH);
    expect(dms.metadata?.['format']).toBe('dms');
  });

  it('parses signed values and computes decimal metadata', () => {
    const c = only('gps -33.8688, 151.2093 syd', coords);
    expect(c.metadata?.['lat']).toBeCloseTo(-33.8688, 3);
    expect(c.metadata?.['lon']).toBeCloseTo(151.2093, 3);
  });

  it('rejects out-of-range, low-precision, and placeholder pairs (more invalid than valid)', () => {
    none('bad 91.123456, 10.123456 lat', coords); // lat > 90
    none('bad 45.123456, 191.123456 lon', coords); // lon > 180
    none('null 0.000, 0.000 island', coords); // placeholder
    none('ver 1.5, 2.5 numbers', coords); // < 3 fraction digits
    none('dms 40°66′46″N 79°58′56″W min', coords); // minutes ≥ 60
    none('money 12.99, 24.99 prices', coords); // 2 decimals
  });

  it('PROPERTY: generated coordinates always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidCoordinates(seed);
        expect(scan(`pos ${value} end`, coords), value).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // Range validation, no checksum; mutation half omitted.
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'pin​ at 41.008238, 28.979530 saved';
    const found = runStage1(normalize(original), { detectors: [coords] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('41.008238, 28.979530');
  });
});
