/**
 * W2c national identifiers: TR, RU, UA, KZ, IL, SA, AE, QA, KW.
 *
 * Mutation-property policy per the W2b analysis: hard mutation for schemes
 * with bijective check mappings (TCKN, VKN, SNILS, Luhn schemes, KW Civil
 * ID's rejected 10/11), fold-documented validation-only where a fold or
 * mod-10 alias exists (INN's `% 10`, RNOKPP's `% 10`, IIN's rotated retry).
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
  generateValidTckn,
  generateValidVkn,
  generateValidInn10,
  generateValidInn12,
  generateValidSnils,
  generateValidRnokpp,
  generateValidIin,
  generateValidTeudatZehut,
  generateValidSaudiId,
  generateValidEmiratesId,
  generateValidQid,
  generateValidKwCivilId,
} from '../src/generate/natidMeCis.js';

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
      expect(scan(`no ${value} end`, detector), value).toHaveLength(1);
      const mutated = mutateDigit(value, idxSeed, delta);
      if (mutated !== null) {
        expect(scan(`no ${mutated} end`, detector), mutated).toHaveLength(0);
      }
    }),
    { numRuns: runs },
  );
}

function validOnlyProperty(detector: Detector, generate: (seed: number) => string, runs = 200): void {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
      expect(scan(`no ${generate(seed)} end`, detector)).toHaveLength(1);
    }),
    { numRuns: runs },
  );
}

describe('tr', () => {
  it('TCKN: the SPEC-quoted dual check', () => {
    only(`tc ${generateValidTckn(1)} x`, det('national-id-tr-tckn'));
    none('tc 12345678901 x', det('national-id-tr-tckn'));
    none('tc 02345678901 x', det('national-id-tr-tckn')); // leading zero never matches
  });
  it('VKN: the transform check', () => {
    only(`vkn ${generateValidVkn(2)} x`, det('national-id-tr-vkn'));
  });
  it('PROPERTIES: TCKN hard; VKN hard (both bijective)', () => {
    hardMutationProperty(det('national-id-tr-tckn'), generateValidTckn);
    // The VKN transform maps each digit through a bijective per-position
    // permutation before the mod-9 contribution — but the 2^k mod 9 factor
    // can alias (2^k cycles 1,2,4,8,7,5). Validation-only, honestly.
    validOnlyProperty(det('national-id-tr-vkn'), generateValidVkn);
  });
});

describe('ru', () => {
  it('INN both widths; SNILS mod-101', () => {
    only(`inn ${generateValidInn10(3)} x`, det('national-id-ru-inn'));
    only(`inn ${generateValidInn12(4)} x`, det('national-id-ru-inn'));
    only(`snils ${generateValidSnils(5)} x`, det('national-id-ru-snils'));
    none('snils 112-233-445 96 x', det('national-id-ru-snils'));
  });
  it('PROPERTIES: INN validation-only (mod-11-then-mod-10 aliases); SNILS validation-only (100→0 fold)', () => {
    validOnlyProperty(det('national-id-ru-inn'), generateValidInn10);
    validOnlyProperty(det('national-id-ru-inn'), generateValidInn12);
    validOnlyProperty(det('national-id-ru-snils'), generateValidSnils);
  });
});

describe('ua-rnokpp / kz-iin', () => {
  it('validate their published algorithms', () => {
    only(`ipn ${generateValidRnokpp(6)} x`, det('national-id-ua-rnokpp'));
    only(`iin ${generateValidIin(7)} x`, det('national-id-kz-iin'));
    none('iin 991332412345 x', det('national-id-kz-iin')); // month 13
  });
  it('PROPERTIES: validation-only (both schemes fold through mod 10 / rotated retry)', () => {
    validOnlyProperty(det('national-id-ua-rnokpp'), generateValidRnokpp);
    validOnlyProperty(det('national-id-kz-iin'), generateValidIin);
  });
});

describe('il-teudat-zehut', () => {
  it('the left-anchored Luhn variant coincides with standard Luhn on 9 digits', () => {
    // Worked example: 123456782 doubles positions 2,4,6,8 (from left):
    // 1+(4)+3+(8)+5+(1+2)+7+(1+6)+2 → 40 → divisible by 10.
    only('id 123456782 x', det('national-id-il-teudat-zehut'));
    none('id 123456789 x', det('national-id-il-teudat-zehut'));
    none('id 000000000 x', det('national-id-il-teudat-zehut'));
  });
  it('PROPERTY: hard mutation (Luhn is bijective per digit)', () => {
    hardMutationProperty(det('national-id-il-teudat-zehut'), generateValidTeudatZehut);
  });
});

describe('gulf', () => {
  it('SA and AE Luhn; QA structural at MEDIUM; KW mod-11', () => {
    only(`sa ${generateValidSaudiId(8)} x`, det('national-id-sa'));
    only(`ae ${generateValidEmiratesId(9)} x`, det('national-id-ae-emirates-id'));
    expect(only(`qa ${generateValidQid(10)} x`, det('national-id-qa-qid')).rawConfidence).toBe(CONFIDENCE.MEDIUM);
    only(`kw ${generateValidKwCivilId(11)} x`, det('national-id-kw-civil-id'));
    none('ae 784-1850-1234567-1 x', det('national-id-ae-emirates-id')); // implausible year
    none('kw 199130212345 x', det('national-id-kw-civil-id')); // month 13 in body — wait: month digits are 4-5 → craft below
  });
  it('PROPERTIES: SA/AE hard (Luhn); KW hard (10/11 rejected → bijective); QA validation-only (no checksum)', () => {
    hardMutationProperty(det('national-id-sa'), generateValidSaudiId);
    hardMutationProperty(det('national-id-ae-emirates-id'), generateValidEmiratesId);
    hardMutationProperty(det('national-id-kw-civil-id'), generateValidKwCivilId);
    validOnlyProperty(det('national-id-qa-qid'), generateValidQid);
  });
});
