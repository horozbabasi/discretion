/**
 * W2d national identifiers: IN, CN, TW, JP, KR, SG, HK, PK, BD, MY, ID,
 * TH, VN, PH.
 *
 * Mutation policy per the fold analysis: Aadhaar (Verhoeff — catches ALL
 * single errors by construction), CN RIC (ISO 7064) and TW/SG/HK (strict
 * mod-10/11 with no fold) run hard mutation; JP My Number (r≤1→0 fold),
 * KR RRN ((11−r) mod 10 fold) and TH (same shape) are validation-only with
 * the fold named; the structural schemes assert their gates.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/natid/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, Stage1Candidate } from '../src/detect/types.js';
import {
  generateValidAadhaar,
  generateValidPan,
  generateValidRic,
  generateValidTwId,
  generateValidMyNumber,
  generateValidRrn,
  generateValidNric,
  generateValidHkid,
  generateValidCnic,
  generateValidBdNid,
  generateValidMykad,
  generateValidNik,
  generateValidThaiId,
  generateValidCccd,
  generateValidPsn,
} from './generators/natidAsia.js';

const det = (id: string): Detector => getDetector(id)!;

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

function mutateDigit(value: string, idxSeed: number, delta: number): string | null {
  const positions = [...value].flatMap((ch, i) => (/\d/.test(ch) ? [i] : []));
  if (positions.length === 0) return null;
  const i = positions[idxSeed % positions.length]!;
  const replacement = String((Number(value[i]) + delta) % 10);
  if (replacement === value[i]) return null;
  return value.slice(0, i) + replacement + value.slice(i + 1);
}

function hardMutationProperty(detector: Detector, generate: (seed: number) => string, runs = 200): void {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), fc.integer({ min: 1, max: 9 }), (seed, idxSeed, delta) => {
      const value = generate(seed);
      expect(scan(`id ${value} end`, detector), value).toHaveLength(1);
      const mutated = mutateDigit(value, idxSeed, delta);
      if (mutated !== null) {
        expect(scan(`id ${mutated} end`, detector), mutated).toHaveLength(0);
      }
    }),
    { numRuns: runs },
  );
}

function validOnlyProperty(detector: Detector, generate: (seed: number) => string, runs = 200): void {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
      expect(scan(`id ${generate(seed)} end`, detector)).toHaveLength(1);
    }),
    { numRuns: runs },
  );
}

describe('in', () => {
  it('Aadhaar Verhoeff, spaced and compact; PAN holder types', () => {
    const c = only(`a ${generateValidAadhaar(1)} x`, det('national-id-in-aadhaar'));
    expect(c.metadata?.['scheme']).toBe('aadhaar');
    only('p ABCPD1234E x', det('national-id-in-pan'));
    expect(only('p ABCPD1234E x', det('national-id-in-pan')).rawConfidence).toBe(CONFIDENCE.MEDIUM);
    none('p ABCXD1234E x', det('national-id-in-pan')); // X not a holder type
    none('a 1234 5678 9012 x', det('national-id-in-aadhaar')); // leading 1 never issued
  });
  it('PROPERTIES: Aadhaar hard (Verhoeff catches everything); PAN validation-only (unpublished check)', () => {
    hardMutationProperty(det('national-id-in-aadhaar'), generateValidAadhaar);
    validOnlyProperty(det('national-id-in-pan'), generateValidPan);
  });
});

describe('cn-ric', () => {
  it('province, date, and MOD 11-2 including X', () => {
    only(`ric ${generateValidRic(2)} x`, det('national-id-cn-ric'));
    none('ric 991101199001011234 x', det('national-id-cn-ric')); // province 99
  });
  it('PROPERTY: hard (ISO 7064 catches all single substitutions)', () => {
    hardMutationProperty(det('national-id-cn-ric'), generateValidRic);
  });
});

describe('tw / sg / hk', () => {
  it('validate their letter-code checks', () => {
    only(`tw ${generateValidTwId(3)} x`, det('national-id-tw'));
    only(`sg ${generateValidNric(4)} x`, det('national-id-sg-nric'));
    only(`hk ${generateValidHkid(5)} x`, det('national-id-hk-hkid'));
    none('sg S1234567A x', det('national-id-sg-nric')); // wrong letter for body
  });
  it('PROPERTIES: SG and HK hard (prime modulus 11); TW validation-only', () => {
    // Taiwan's check is mod TEN with even weights (8,6,4,2), so a delta of
    // 5 on an even-weight position aliases (5x8=40===0 mod 10) - a property
    // run proved it. The scheme itself cannot catch those mutations.
    validOnlyProperty(det('national-id-tw'), generateValidTwId);
    hardMutationProperty(det('national-id-sg-nric'), generateValidNric);
    hardMutationProperty(det('national-id-hk-hkid'), generateValidHkid);
  });
});

describe('jp / kr / th', () => {
  it('validate their mod-11 variants', () => {
    only(`jp ${generateValidMyNumber(6)} x`, det('national-id-jp-my-number'));
    only(`kr ${generateValidRrn(7)} x`, det('national-id-kr-rrn'));
    only(`th ${generateValidThaiId(8)} x`, det('national-id-th'));
    none('kr 991301-1234567 x', det('national-id-kr-rrn')); // month 13
  });
  it('PROPERTIES: validation-only — all three fold remainders (r≤1→0 / (11−r) mod 10)', () => {
    validOnlyProperty(det('national-id-jp-my-number'), generateValidMyNumber);
    validOnlyProperty(det('national-id-kr-rrn'), generateValidRrn);
    validOnlyProperty(det('national-id-th'), generateValidThaiId);
  });
});

describe('structural schemes', () => {
  it('PK CNIC, BD NID, MY MyKad, ID NIK, VN CCCD, PH PCN at MEDIUM with their gates', () => {
    expect(only(`pk ${generateValidCnic(9)} x`, det('national-id-pk-cnic')).rawConfidence).toBe(CONFIDENCE.MEDIUM);
    only(`bd ${generateValidBdNid(10)} x`, det('national-id-bd-nid'));
    only(`my ${generateValidMykad(11)} x`, det('national-id-my-mykad'));
    only(`id ${generateValidNik(12)} x`, det('national-id-id-nik'));
    only(`vn ${generateValidCccd(13)} x`, det('national-id-vn-cccd'));
    only(`ph ${generateValidPsn(14)} x`, det('national-id-ph-psn'));

    none('my 990115-18-1234 x', det('national-id-my-mykad')); // PB 18 unassigned
    none('my 991315-05-1234 x', det('national-id-my-mykad')); // month 13
    none('id 09120101010001 x', det('national-id-id-nik')); // province 09
    none('ph 1111-1111-1111-1111 x', det('national-id-ph-psn')); // repdigit
    none('bd 18801234567890123 x', det('national-id-bd-nid')); // year 1880
  });
  it('PROPERTIES: validation-only (no checksums exist; stated in each detector)', () => {
    validOnlyProperty(det('national-id-pk-cnic'), generateValidCnic);
    validOnlyProperty(det('national-id-bd-nid'), generateValidBdNid);
    validOnlyProperty(det('national-id-my-mykad'), generateValidMykad);
    validOnlyProperty(det('national-id-id-nik'), generateValidNik);
    validOnlyProperty(det('national-id-vn-cccd'), generateValidCccd);
    validOnlyProperty(det('national-id-ph-psn'), generateValidPsn);
  });
});
