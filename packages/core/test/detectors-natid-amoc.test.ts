/**
 * W2e national identifiers: AU, NZ, BR, MX, AR, CL, CO, PE, ZA, NG, KE,
 * EG, MA.
 *
 * Hard mutation for bijective schemes (TFN and ABN divisibility, Medicare's
 * odd weights mod 10, CUIT, RUT, ZA Luhn); fold-documented validation-only
 * for CPF/CNPJ (r<2→0), NZ IRD (two-phase retry), CURP (mod-10 letter
 * aliasing), NIT (identity branch); structural/labeled schemes assert their
 * gates.
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
  generateValidTfn,
  generateValidMedicare,
  generateValidAbn,
  generateValidIrd,
  generateValidCpf,
  generateValidCnpj,
  generateValidCurp,
  generateValidRfc,
  generateValidCuit,
  generateValidRut,
  generateValidNit,
  generateValidPeDni,
  generateValidZaId,
  generateValidNin,
  generateValidKeId,
  generateValidEgId,
  generateValidCnie,
} from '../src/generate/natidAmOc.js';

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
      expect(scan(`nr ${value} end`, detector), value).toHaveLength(1);
      const mutated = mutateDigit(value, idxSeed, delta);
      if (mutated !== null) {
        expect(scan(`nr ${mutated} end`, detector), mutated).toHaveLength(0);
      }
    }),
    { numRuns: runs },
  );
}

function validOnlyProperty(detector: Detector, generate: (seed: number) => string, runs = 200): void {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
      expect(scan(`nr ${generate(seed)} end`, detector)).toHaveLength(1);
    }),
    { numRuns: runs },
  );
}

describe('au', () => {
  it('TFN divisibility, Medicare check, ABN mod-89', () => {
    only(`tfn ${generateValidTfn(1)} x`, det('national-id-au-tfn'));
    only(`mc ${generateValidMedicare(2)} x`, det('national-id-au-medicare'));
    only(`abn ${generateValidAbn(3)} x`, det('national-id-au-abn'));
    none('mc 1234 56789 1 2 x', det('national-id-au-medicare')); // first digit 1
  });
  it('PROPERTIES: TFN and ABN hard (divisibility, no check-digit mapping to fold); Medicare hard (odd weights mod 10)', () => {
    hardMutationProperty(det('national-id-au-tfn'), generateValidTfn);
    hardMutationProperty(det('national-id-au-abn'), generateValidAbn);
    // Medicare's weights are 1,3,7,9 — all odd and coprime to 10 — but the
    // trailing issue number is outside the check; mutating it is undetectable,
    // and the check digit itself maps 1:1. Mutate only the first nine.
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), fc.integer({ min: 1, max: 9 }), (seed, idxSeed, delta) => {
        const value = generateValidMedicare(seed);
        expect(scan(`mc ${value} x`, det('national-id-au-medicare')), value).toHaveLength(1);
        const scope = value.slice(0, 9);
        const mutated = mutateDigit(scope, idxSeed, delta);
        if (mutated !== null && /^[2-6]/.test(mutated)) {
          expect(scan(`mc ${mutated}${value.slice(9)} x`, det('national-id-au-medicare'))).toHaveLength(0);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('nz-ird', () => {
  it('range and two-phase check', () => {
    only(`ird ${generateValidIrd(4)} x`, det('national-id-nz-ird'));
    none('ird 9999999 x', det('national-id-nz-ird')); // below range
  });
  it('PROPERTY: validation-only (two-phase retry gives second chances)', () => {
    validOnlyProperty(det('national-id-nz-ird'), generateValidIrd);
  });
});

describe('br', () => {
  it('CPF and CNPJ dual checks; repdigits rejected', () => {
    only(`cpf ${generateValidCpf(5)} x`, det('national-id-br-cpf'));
    only(`cnpj ${generateValidCnpj(6)} x`, det('national-id-br-cnpj'));
    none('cpf 111.111.111-11 x', det('national-id-br-cpf')); // arithmetic passes, issuance forbids
    none('cpf 123.456.789-00 x', det('national-id-br-cpf'));
  });
  it('PROPERTIES: validation-only (r<2→0 folds in both)', () => {
    validOnlyProperty(det('national-id-br-cpf'), generateValidCpf);
    validOnlyProperty(det('national-id-br-cnpj'), generateValidCnpj);
  });
});

describe('mx', () => {
  it('CURP with the RENAPO check; RFC structural at MEDIUM', () => {
    only(`curp ${generateValidCurp(7)} x`, det('national-id-mx-curp'));
    expect(only(`rfc ${generateValidRfc(8)} x`, det('national-id-mx-rfc')).rawConfidence).toBe(CONFIDENCE.MEDIUM);
  });
  it('PROPERTIES: validation-only (letter values alias through mod 10; RFC unpublished)', () => {
    validOnlyProperty(det('national-id-mx-curp'), generateValidCurp);
    validOnlyProperty(det('national-id-mx-rfc'), generateValidRfc);
  });
});

describe('ar / cl / co / pe', () => {
  it('CUIT and RUT checks; NIT; labeled DNI forms', () => {
    only(`cuit ${generateValidCuit(9)} x`, det('national-id-ar-cuit'));
    only('dni DNI 12.345.678 x', det('national-id-ar-dni'));
    only(`rut ${generateValidRut(10)} x`, det('national-id-cl-rut'));
    only(`nit ${generateValidNit(11)} x`, det('national-id-co-nit'));
    only(`pe ${generateValidPeDni(12)} x`, det('national-id-pe-dni'));
    none('cuit 21-12345678-0 x', det('national-id-ar-cuit')); // prefix 21 not issued
    none('bare 12345678 pe', det('national-id-pe-dni')); // unlabeled never claimed
  });
  it('PROPERTIES: CUIT and RUT hard (bijective); NIT validation-only (identity branch fold)', () => {
    hardMutationProperty(det('national-id-ar-cuit'), generateValidCuit);
    hardMutationProperty(det('national-id-cl-rut'), generateValidRut);
    validOnlyProperty(det('national-id-co-nit'), generateValidNit);
    validOnlyProperty(det('national-id-pe-dni'), generateValidPeDni);
  });
});

describe('za', () => {
  it('date + citizenship + Luhn', () => {
    only(`za ${generateValidZaId(13)} x`, det('national-id-za'));
    none('za 9913315800086 x', det('national-id-za')); // month 13
  });
  it('PROPERTY: hard (Luhn bijective; date-field mutations fail either gate)', () => {
    hardMutationProperty(det('national-id-za'), generateValidZaId);
  });
});

describe('africa (labeled/structural)', () => {
  it('NIN, KE ID, EG ID, CNIE with their gates', () => {
    only(`ng ${generateValidNin(14)} x`, det('national-id-ng-nin'));
    only(`ke ${generateValidKeId(15)} x`, det('national-id-ke'));
    only(`eg ${generateValidEgId(16)} x`, det('national-id-eg'));
    only(`ma ${generateValidCnie(17)} x`, det('national-id-ma-cnie'));
    none('ng 12345678901 bare', det('national-id-ng-nin'));
    none('eg 41011250112345 x', det('national-id-eg')); // century 4
    none('eg 29913250112345 x', det('national-id-eg')); // month 13
  });
  it('PROPERTIES: validation-only (no checksums exist; stated in each detector)', () => {
    validOnlyProperty(det('national-id-ng-nin'), generateValidNin);
    validOnlyProperty(det('national-id-ke'), generateValidKeId);
    validOnlyProperty(det('national-id-eg'), generateValidEgId);
    validOnlyProperty(det('national-id-ma-cnie'), generateValidCnie);
  });
});
