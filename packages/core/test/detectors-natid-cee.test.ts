/**
 * W2b national identifiers: PL, SE, NO, DK, FI, IS, PT, GR, CZ/SK, HU, RO,
 * BG, HR, SI.
 *
 * All but the Danish CPR carry real checksums with prime-modulus weighted
 * sums (or Luhn), so single digit→digit mutations are guaranteed caught and
 * every checksummed scheme runs the full mutation property. CPR's check was
 * abolished in 2007 — its detector says so, sits at MEDIUM, and its
 * property is validation-only.
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
  generateValidPesel,
  generateValidNip,
  generateValidRegon,
  generateValidPersonnummer,
  generateValidFodselsnummer,
  generateValidCpr,
  generateValidHetu,
  generateValidKennitala,
  generateValidPtNif,
  generateValidAfm,
  generateValidRodneCislo,
  generateValidSzemelyi,
  generateValidCnp,
  generateValidEgn,
  generateValidOib,
  generateValidEmso,
} from '../src/generate/natidCee.js';

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

/**
 * Full mutation property — ONLY for schemes whose remainder→check mapping is
 * BIJECTIVE (no fold), where a digit·weight change mod a prime can never
 * alias. `excludeLastDigits` masks trailing digits outside the checksum
 * (Iceland's century digit).
 */
function checksummedProperty(
  detector: Detector,
  generate: (seed: number) => string,
  runs = 200,
  excludeLastDigits = 0,
): void {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), fc.integer({ min: 1, max: 9 }), (seed, idxSeed, delta) => {
      const value = generate(seed);
      expect(scan(`nr ${value} end`, detector), value).toHaveLength(1);
      const scope = excludeLastDigits > 0 ? value.slice(0, value.length - excludeLastDigits) : value;
      const mutated = mutateDigit(scope, idxSeed, delta);
      if (mutated !== null) {
        const full = excludeLastDigits > 0 ? mutated + value.slice(value.length - excludeLastDigits) : mutated;
        expect(scan(`nr ${full} end`, detector), full).toHaveLength(0);
      }
    }),
    { numRuns: runs },
  );
}

/**
 * For schemes whose check mapping FOLDS two remainders onto one check digit
 * (REGON 10→0, PT NIF r<2→0, AFM mod-10, CNP 10→1, EGN 10→0, EMŠO k≥10→0):
 * roughly one single-digit mutation in eleven is undetectable BY THE SCHEME
 * ITSELF, so a hard mutation assertion would be asserting something the
 * identifier design does not promise. Validation-only, with the fold named
 * at each call site.
 */
function foldedSchemeProperty(detector: Detector, generate: (seed: number) => string, runs = 200): void {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
      expect(scan(`nr ${generate(seed)} end`, detector)).toHaveLength(1);
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

describe('pl', () => {
  it('PESEL month bands and checksum', () => {
    only(`p ${generateValidPesel(1)} x`, det('national-id-pl-pesel'));
    none('p 44131401359 x', det('national-id-pl-pesel')); // month 13
  });
  it('NIP remainder-10 rule', () => {
    only(`n ${generateValidNip(2)} x`, det('national-id-pl-nip'));
    none('n 123-456-32-19 x', det('national-id-pl-nip')); // broken check
  });
  it('PROPERTIES: all three checksummed', () => {
    checksummedProperty(det('national-id-pl-pesel'), generateValidPesel);
    checksummedProperty(det('national-id-pl-nip'), generateValidNip);
    // REGON folds remainder 10 to 0 — see foldedSchemeProperty.
    foldedSchemeProperty(det('national-id-pl-regon'), generateValidRegon);
  });
});

describe('se-personnummer', () => {
  it('accepts standard and coordination numbers', () => {
    only(`pn ${generateValidPersonnummer(3)} x`, det('national-id-se-personnummer'));
    none('pn 811228-9873 x', det('national-id-se-personnummer')); // Luhn broken
    none('pn 811328-9874 x', det('national-id-se-personnummer')); // month 13
  });
  it('PROPERTY: checksummed', () => {
    checksummedProperty(det('national-id-se-personnummer'), generateValidPersonnummer);
  });
});

describe('no-fodselsnummer', () => {
  it('dual mod-11 and D-numbers', () => {
    only(`fn ${generateValidFodselsnummer(4)} x`, det('national-id-no-fodselsnummer'));
    none('fn 01010112345 x', det('national-id-no-fodselsnummer')); // checks fail
  });
  it('PROPERTY: checksummed', () => {
    checksummedProperty(det('national-id-no-fodselsnummer'), generateValidFodselsnummer);
  });
});

describe('dk-cpr', () => {
  it('date-gated structure at MEDIUM (check abolished 2007)', () => {
    expect(only(`cpr ${generateValidCpr(5)} x`, det('national-id-dk-cpr')).rawConfidence).toBe(CONFIDENCE.MEDIUM);
    none('cpr 320186-1234 x', det('national-id-dk-cpr')); // day 32
    none('cpr 011386-1234 x', det('national-id-dk-cpr')); // month 13
    none('cpr 0101861234 x', det('national-id-dk-cpr')); // unhyphenated never claimed
  });
  it('PROPERTY: validation-only (no checksum exists any more)', () => {
    validOnlyProperty(det('national-id-dk-cpr'), generateValidCpr);
  });
});

describe('fi-hetu', () => {
  it('base-31 check and century signs', () => {
    only(`h ${generateValidHetu(6)} x`, det('national-id-fi-hetu'));
    none('h 010190-999L x', det('national-id-fi-hetu')); // wrong check char (unless coincidence: L not in position)
  });
  it('PROPERTY: checksummed', () => {
    checksummedProperty(det('national-id-fi-hetu'), generateValidHetu);
  });
});

describe('is-kennitala', () => {
  it('mod-11 and century digit', () => {
    only(`kt ${generateValidKennitala(7)} x`, det('national-id-is-kennitala'));
    none('kt 010190-2385 x', det('national-id-is-kennitala')); // century 5 invalid
  });
  it('PROPERTY: checksummed', () => {
    // The trailing century digit is outside the checksum; exclude it.
    checksummedProperty(det('national-id-is-kennitala'), generateValidKennitala, 200, 1);
  });
});

describe('pt-nif / gr-afm', () => {
  it('NIF and AFM checksums', () => {
    only(`nif ${generateValidPtNif(8)} x`, det('national-id-pt-nif'));
    only(`afm ${generateValidAfm(9)} x`, det('national-id-gr-afm'));
    none('afm 000000000 x', det('national-id-gr-afm')); // all zeros excluded
  });
  it('PROPERTIES: checksummed', () => {
    // NIF folds remainders 0 and 1 to check 0; AFM folds mod-11 through
    // mod-10 — both schemes admit ~1/11 mutation aliases by design.
    foldedSchemeProperty(det('national-id-pt-nif'), generateValidPtNif);
    foldedSchemeProperty(det('national-id-gr-afm'), generateValidAfm);
  });
});

describe('cz-rodne-cislo', () => {
  it('divisibility by 11 with month bands', () => {
    only(`rc ${generateValidRodneCislo(10)} x`, det('national-id-cz-rodne-cislo'));
    none('rc 856713/1234 x', det('national-id-cz-rodne-cislo')); // month 67 outside bands
  });
  it('PROPERTY: checksummed', () => {
    checksummedProperty(det('national-id-cz-rodne-cislo'), generateValidRodneCislo);
  });
});

describe('hu / ro / bg', () => {
  it('személyi szám, CNP, EGN', () => {
    only(`sz ${generateValidSzemelyi(11)} x`, det('national-id-hu-szemelyi'));
    only(`cnp ${generateValidCnp(12)} x`, det('national-id-ro-cnp'));
    only(`egn ${generateValidEgn(13)} x`, det('national-id-bg-egn'));
    none('cnp 0801019876543 x', det('national-id-ro-cnp')); // leading 0 never issued
  });
  it('PROPERTIES: checksummed', () => {
    checksummedProperty(det('national-id-hu-szemelyi'), generateValidSzemelyi);
    // CNP folds 10→1 (aliasing remainder 1); EGN folds 10→0.
    foldedSchemeProperty(det('national-id-ro-cnp'), generateValidCnp);
    foldedSchemeProperty(det('national-id-bg-egn'), generateValidEgn);
  });
});

describe('hr-oib / si-emso', () => {
  it('OIB and EMŠO checksums', () => {
    only(`oib ${generateValidOib(14)} x`, det('national-id-hr-oib'));
    only(`emso ${generateValidEmso(15)} x`, det('national-id-si-emso'));
  });
  it('PROPERTIES: checksummed', () => {
    checksummedProperty(det('national-id-hr-oib'), generateValidOib);
    // EMŠO folds k=10 and k=11 to 0.
    foldedSchemeProperty(det('national-id-si-emso'), generateValidEmso);
  });
});
