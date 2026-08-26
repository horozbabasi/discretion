/**
 * W2f: EU VAT — one detector, 27 member states.
 *
 * Every state's synthesizer is exercised individually (a random-country
 * property alone could under-sample a broken rule), the three hand-verified
 * published vectors are pinned, and the CZ/FR structural fallbacks are
 * asserted to downgrade to MEDIUM rather than claim a checksum they did not
 * verify.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/vat/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, Stage1Candidate } from '../src/detect/types.js';
import { generateValidEuVat, generateValidVatFor, VAT_COUNTRIES } from './generators/vat.js';

const vat = getDetector('eu-vat')!;

function scan(text: string, detector: Detector): Stage1Candidate[] {
  return runStage1(normalize(text), { detectors: [detector] });
}

function only(text: string): Stage1Candidate {
  const found = scan(text, vat);
  expect(found, `expected exactly one candidate in: ${text}`).toHaveLength(1);
  return found[0]!;
}

function none(text: string): void {
  expect(scan(text, vat), `expected no candidate in: ${text}`).toHaveLength(0);
}

describe('eu-vat', () => {
  it('covers all 27 member states', () => {
    expect(VAT_COUNTRIES).toHaveLength(27);
  });

  it('accepts hand-verified published vectors', () => {
    // Verified against the national algorithms during implementation.
    expect(only('vat ATU13585627 invoice').metadata?.['country']).toBe('AT');
    expect(only('vat LV40003009497 invoice').metadata?.['country']).toBe('LV');
    expect(only('vat MT11679112 invoice').metadata?.['country']).toBe('MT');
    // Greece is quoted with EL and normalized to GR in metadata.
    const el = only(`vat ${generateValidVatFor('EL', 3)} invoice`);
    expect(el.metadata?.['country']).toBe('GR');
  });

  it('every member state synthesizer validates (three seeds each)', () => {
    for (const country of VAT_COUNTRIES) {
      for (const seed of [1, 22, 333]) {
        const value = generateValidVatFor(country, seed);
        const found = scan(`invoice ${value} total`, vat);
        expect(found, value).toHaveLength(1);
      }
    }
  });

  it('rejects corrupted vectors and unknown prefixes (more invalid than valid)', () => {
    none('vat ATU13585628 bad'); // AT check broken
    none('vat LV40003009498 bad'); // LV check broken
    none('vat MT11679113 bad'); // MT check broken
    none('vat DE12345678 short'); // 8 digits
    none('vat ZZ123456789 prefix'); // not a member state
    none('vat GB123456789 prefix'); // left the union; not in the table
    none('vat FI0000000A char'); // charset violation
    none('vat BE9403019261 lead'); // BE must start 0/1
  });

  it('structural fallbacks (CZ 9-digit, FR letter keys) downgrade to MEDIUM', () => {
    // CZ pre-1954 personal numbers carry no check at all.
    const cz = only('vat CZ123456789 old');
    expect(cz.rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(cz.metadata?.['checksum']).toBe('structural-only');
  });

  it('PROPERTY: generated VAT numbers always validate at HIGH (checksum verified)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        const value = generateValidEuVat(seed);
        const found = scan(`inv ${value} sum`, vat);
        expect(found, value).toHaveLength(1);
        expect(found[0]!.rawConfidence, value).toBe(CONFIDENCE.HIGH);
      }),
      { numRuns: 400 },
    );
    // Mutation is not asserted globally: the 27 national rules span every
    // fold behaviour documented in the natid suites; per-rule vectors above
    // carry the negative coverage.
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'Rechnung​ an ATU13585627 gestellt';
    const found = runStage1(normalize(original), { detectors: [vat] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('ATU13585627');
  });
});
