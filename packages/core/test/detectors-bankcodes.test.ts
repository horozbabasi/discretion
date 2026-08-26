/**
 * National bank-code family: US routing, UK sort code, CA transit, AU BSB,
 * IN IFSC, BR agência.
 *
 * Only US routing numbers carry a checksum; the others are structural
 * detectors whose confidence caps are themselves part of the contract
 * being tested (SPEC.md: no high confidence without a validator).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/bankcodes/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, Stage1Candidate } from '../src/detect/types.js';
import {
  generateValidRouting,
  generateValidSortCode,
  generateValidTransit,
  generateValidBsb,
  generateValidIfsc,
  generateValidAgencia,
} from './generators/bankcodes.js';

const routing = getDetector('us-routing-number')!;
const sortCode = getDetector('uk-sort-code')!;
const transit = getDetector('ca-transit-number')!;
const bsb = getDetector('au-bsb')!;
const ifsc = getDetector('in-ifsc')!;
const agencia = getDetector('br-agencia')!;

function scan(text: string, detector: Detector): Stage1Candidate[] {
  return runStage1(normalize(text), { detectors: [detector] });
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
// US_ROUTING_NUMBER
// ─────────────────────────────────────────────────────────────────────────────

describe('us-routing-number', () => {
  it('accepts real Federal Reserve routing numbers at HIGH', () => {
    expect(only('aba 021000021 chase', routing).rawConfidence).toBe(CONFIDENCE.HIGH);
    only('aba 011401533 bank', routing);
    only('aba 121000248 wells', routing);
  });

  it('rejects checksum and prefix violations (more invalid than valid)', () => {
    none('aba 021000022 off', routing); // ABA checksum broken
    none('aba 021000012 swap', routing); // transposed tail
    none('aba 000000000 zero', routing); // valid sum, prefix 00 excluded
    none('aba 131000029 prefix', routing); // prefix 13 not an FRB symbol
    none('aba 02100002 short', routing);
    none('aba 0210000219 long', routing);
    none('ssn 123-45-6789 shape', routing); // hyphenated, never matches
  });

  it('PROPERTY: generated numbers validate; any single-digit mutation fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), fc.integer({ min: 1, max: 9 }), (seed, idxSeed, delta) => {
        const value = generateValidRouting(seed);
        expect(scan(`route ${value} ok`, routing), value).toHaveLength(1);
        const idx = idxSeed % 9;
        const mutated =
          value.slice(0, idx) + String((Number(value[idx]) + delta) % 10) + value.slice(idx + 1);
        // A mutation may break the checksum OR the prefix — either gate
        // rejecting satisfies the property.
        expect(scan(`route ${mutated} ok`, routing), mutated).toHaveLength(0);
      }),
      { numRuns: 400 },
    );
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'wire​ via 021000021 today';
    const found = runStage1(normalize(original), { detectors: [routing] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('021000021');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// UK_SORT_CODE
// ─────────────────────────────────────────────────────────────────────────────

describe('uk-sort-code', () => {
  it('accepts the hyphenated notation, capped at MEDIUM (no checksum exists)', () => {
    const c = only('sort 20-00-00 barclays', sortCode);
    expect(c.rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(c.canonical).toBe('200000');
  });

  it('rejects other shapes (more invalid than valid)', () => {
    none('bare 123456 digits', sortCode); // unhyphenated: any number
    none('spaced 12 34 56 pairs', sortCode);
    none('short 12-34-5 code', sortCode);
    none('wide 123-45-6 code', sortCode);
    none('run 12-34-56-78 fragment', sortCode);
    none('date 12-34-5678 like', sortCode);
  });

  it('PROPERTY: generated sort codes always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`sc ${generateValidSortCode(seed)} ok`, sortCode)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // No checksum exists (stated in the detector); mutation half omitted.
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'acct​ sort 40-47-84 hsbc';
    const found = runStage1(normalize(original), { detectors: [sortCode] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('40-47-84');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CA_TRANSIT_NUMBER
// ─────────────────────────────────────────────────────────────────────────────

describe('ca-transit-number', () => {
  it('accepts branch-institution pairs with known institutions', () => {
    const c = only('transit 12345-003 rbc', transit);
    expect(c.metadata?.['institution']).toBe('003');
    only('transit 00006-004 td', transit);
    only('transit 30800-815 desjardins', transit);
  });

  it('rejects unknown institutions and other shapes (more invalid than valid)', () => {
    none('inst 12345-999 unknown', transit);
    none('inst 12345-000 zero', transit);
    none('short 1234-003 branch', transit);
    none('wide 123456-003 branch', transit);
    none('inst 12345-03 short', transit);
    none('run 12345-0031 fragment', transit);
  });

  it('PROPERTY: generated transit numbers always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`tr ${generateValidTransit(seed)} ok`, transit)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // Institution membership is a table, not a checksum; mutation omitted
    // (mutating the branch part yields another plausible branch).
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'void​ cheque 12345-010 cibc';
    const found = runStage1(normalize(original), { detectors: [transit] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('12345-010');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AU_BSB
// ─────────────────────────────────────────────────────────────────────────────

describe('au-bsb', () => {
  it('accepts XXX-XXX at MEDIUM (structure-only, stated in the detector)', () => {
    const c = only('bsb 062-000 cba', bsb);
    expect(c.rawConfidence).toBe(CONFIDENCE.MEDIUM);
    expect(c.canonical).toBe('062000');
    only('bsb 640-000 hume', bsb); // real-world exception to the "state digit" folklore
  });

  it('rejects other shapes (more invalid than valid)', () => {
    none('bare 062000 digits', bsb);
    none('short 06-2000 split', bsb);
    none('wide 0620-00 split', bsb);
    none('run 062-0001 fragment', bsb);
    none('run 1062-000 fragment', bsb);
  });

  it('PROPERTY: generated BSBs always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`bsb ${generateValidBsb(seed)} ok`, bsb)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // No checksum exists (stated in the detector); mutation half omitted.
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'pay​ bsb 082-902 nab';
    const found = runStage1(normalize(original), { detectors: [bsb] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('082-902');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// IN_IFSC
// ─────────────────────────────────────────────────────────────────────────────

describe('in-ifsc', () => {
  it('accepts real IFSC codes at HIGH (the reserved zero is the signature)', () => {
    const c = only('neft SBIN0005943 branch', ifsc);
    expect(c.rawConfidence).toBe(CONFIDENCE.HIGH);
    expect(c.metadata?.['bank']).toBe('SBIN');
    only('imps HDFC0001234 branch', ifsc);
    only('rtgs UTIB0000037 branch', ifsc);
  });

  it('rejects structure violations (more invalid than valid)', () => {
    none('fifth SBIN1005943 char', ifsc); // fifth char must be 0
    none('short SBI0005943 bank', ifsc);
    none('case sbin0005943 lower', ifsc);
    none('digit SB1N0005943 bank', ifsc);
    none('len SBIN000594 short', ifsc);
    none('len SBIN00059431 long', ifsc);
    none('word ABCD0EFGHIJ letters', ifsc); // branch with no digit
  });

  it('PROPERTY: generated IFSC codes always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`ifsc ${generateValidIfsc(seed)} ok`, ifsc)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // Structure-only format; mutation half omitted (a mutated branch digit
    // is another valid branch).
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'upi​ via ICIC0001206 done';
    const found = runStage1(normalize(original), { detectors: [ifsc] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('ICIC0001206');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BR_AGENCIA
// ─────────────────────────────────────────────────────────────────────────────

describe('br-agencia', () => {
  it('accepts labeled agência forms, span narrowed to the number', () => {
    const c = only('conta na ag. 1234 do banco', agencia);
    expect(c.text).toBe('1234');
    expect(c.canonical).toBe('1234');
    const withCheck = only('Agência: 5678-9 Bradesco', agencia);
    expect(withCheck.text).toBe('5678-9');
    expect(withCheck.metadata?.['checkDigit']).toBe('9');
    only('agencia 0001 BB', agencia);
  });

  it('rejects unlabeled and malformed forms (more invalid than valid)', () => {
    none('bare 1234 number', agencia); // no label → not the notation
    none('agency 1234 english', agencia);
    none('ag. 123 short', agencia);
    none('ag. 12345 long', agencia);
    none('ag. 1234-56 check', agencia);
    none('agitated 1234 word', agencia);
  });

  it('PROPERTY: generated labeled agências always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`cliente ${generateValidAgencia(seed)} ok`, agencia)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // Per-bank check-digit rules are unverifiable without the bank; the
    // detector states this. Mutation half omitted.
  });

  it('OFFSETS: span covers the number, not the label', () => {
    const original = 'transferir​ para ag. 4271-5 hoje';
    const found = runStage1(normalize(original), { detectors: [agencia] });
    expect(found).toHaveLength(1);
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('4271-5');
  });
});
