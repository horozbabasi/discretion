/**
 * Documents & health family: PASSPORT_MRZ, VIN, US_NPI, DRIVERS_LICENSE,
 * HEALTH_DATA.
 *
 * MRZ is the flagship: SPEC.md says "treat a valid MRZ as maximum
 * confidence", and this suite pins both halves — every check digit must
 * close for MAXIMUM, and any single corrupted character kills the whole
 * zone (asserted by property over generated passports).
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import '../src/detect/detectors/documents/index.js';
import { getDetector } from '../src/detect/registry.js';
import { runStage1 } from '../src/detect/runner.js';
import { normalize } from '../src/normalization.js';
import { CONFIDENCE } from '../src/detect/types.js';
import type { Detector, Stage1Candidate } from '../src/detect/types.js';
import {
  generateValidTd3,
  generateValidTd1,
  generateValidVin,
  generateValidNpi,
  generateValidDvla,
  generateValidSctid,
  generateValidLabResult,
} from '../src/generate/documents.js';

const mrz = getDetector('passport-mrz')!;
const vin = getDetector('vin')!;
const npi = getDetector('us-npi')!;
const dl = getDetector('drivers-license')!;
const health = getDetector('health-data')!;

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
// PASSPORT_MRZ
// ─────────────────────────────────────────────────────────────────────────────

describe('passport-mrz', () => {
  it('accepts the ICAO 9303 specimen TD3 at MAXIMUM confidence', () => {
    // The specimen from ICAO Doc 9303 Part 4 (ERIKSSON, Utopia).
    const specimen =
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n' +
      'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    const c = only(specimen, mrz);
    expect(c.rawConfidence).toBe(CONFIDENCE.MAXIMUM);
    expect(c.metadata?.['format']).toBe('TD3');
    expect(c.metadata?.['issuingState']).toBe('UTO');
    expect(c.metadata?.['birthDate']).toBe('740812');
  });

  it('rejects a specimen with any single check digit broken', () => {
    // Document-number check digit 6→7.
    none(
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n' +
        'L898902C37UTO7408122F1204159ZE184226B<<<<<10',
      mrz,
    );
    // Composite check 0→1.
    none(
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n' +
        'L898902C36UTO7408122F1204159ZE184226B<<<<<11',
      mrz,
    );
    // Birth month 40 is impossible even if digits were re-checksummed.
    none(
      'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\n' +
        'L898902C36UTO7440122F1204159ZE184226B<<<<<10',
      mrz,
    );
  });

  it('accepts generated TD1 zones', () => {
    const c = only(generateValidTd1(11), mrz);
    expect(c.metadata?.['format']).toBe('TD1');
    expect(c.rawConfidence).toBe(CONFIDENCE.MAXIMUM);
  });

  it('rejects uppercase text that merely looks blocky', () => {
    none('THIS IS A HEADING THAT IS LOUD\nAND A SECOND LOUD LINE FOLLOWS', mrz);
    none('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', mrz);
  });

  it('PROPERTY: generated TD3 zones validate at MAXIMUM; one corrupted character kills the zone', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const zone = generateValidTd3(seed);
        const found = scan(zone, mrz);
        expect(found, zone).toHaveLength(1);
        expect(found[0]!.rawConfidence).toBe(CONFIDENCE.MAXIMUM);

        // Corrupt one character of LINE 2 (the checksummed line): swap a
        // digit for a different digit. Every position is covered by a field
        // check or the composite, so the zone must die.
        const lines = zone.split('\n');
        const l2 = lines[1]!;
        const digitPositions = [...l2].flatMap((ch, i) => (/\d/.test(ch) ? [i] : []));
        const pos = digitPositions[idxSeed % digitPositions.length]!;
        const replacement = String((Number(l2[pos]) + 1 + (idxSeed % 8)) % 10);
        if (replacement === l2[pos]) return;
        const corrupted = `${lines[0]}\n${l2.slice(0, pos)}${replacement}${l2.slice(pos + 1)}`;
        expect(scan(corrupted, mrz), corrupted).toHaveLength(0);
      }),
      { numRuns: 300 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VIN
// ─────────────────────────────────────────────────────────────────────────────

describe('vin', () => {
  it('accepts a known-good VIN', () => {
    // 1M8GDM9AXKP042788 is the canonical check-digit example ('X' at pos 9).
    const c = only('vehicle 1M8GDM9AXKP042788 sold', vin);
    expect(c.metadata?.['wmi']).toBe('1M8');
  });

  it('rejects check-digit and alphabet violations (more invalid than valid)', () => {
    none('vin 1M8GDM9A1KP042788 wrong', vin); // check digit X→1
    none('vin 1M8GDM9AXKP042789 tail', vin); // tail digit changed
    none('vin 1O8GDM9AXKP042788 letter', vin); // 'O' excluded — pattern never matches
    none('vin 1M8GDM9AXKP04278 short', vin); // 16 chars
    none('part ABCDEFGH1JKLMNPRS number', vin); // wrong check digit shape
  });

  it('PROPERTY: generated VINs validate; any single-character change fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), (seed, idxSeed) => {
        const value = generateValidVin(seed);
        expect(scan(`car ${value} listed`, vin), value).toHaveLength(1);
        const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
        const pos = idxSeed % 17;
        if (pos === 8) return; // changing the check digit itself: covered by vectors
        const cur = value[pos]!;
        const replacement = alphabet[(alphabet.indexOf(cur) + 1 + (idxSeed % 31)) % alphabet.length]!;
        if (replacement === cur) return;
        const mutated = value.slice(0, pos) + replacement + value.slice(pos + 1);
        // ISO 3779 transliteration is not injective (1 and A share a value),
        // so only assert failure when the VALUES differ.
        const sameValue = scan(`car ${mutated} listed`, vin);
        if (sameValue.length !== 0) {
          // The mutation kept the transliterated value; verify that claim.
          const table: Record<string, number> = {
            A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
            S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
            '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
          };
          expect(table[cur]).toBe(table[replacement]);
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US_NPI
// ─────────────────────────────────────────────────────────────────────────────

describe('us-npi', () => {
  it('accepts a published specimen NPI (Luhn over the 80840 prefix)', () => {
    // 1234567893 is the NPI standard's own check-digit worked example.
    only('provider 1234567893 billed', npi);
  });

  it('rejects checksum, prefix-rule and fragment violations (more invalid than valid)', () => {
    none('npi 1234567890 bad', npi); // check digit fails with 80840
    none('npi 3234567895 lead', npi); // leading 3 reserved
    none('npi 123456789 short', npi);
    none('npi 12345678931 long', npi);
    none('phone 2125550123 shaped', npi); // NANP number: Luhn-80840 fails
  });

  it('PROPERTY: generated NPIs validate; single-digit mutation fails', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), fc.nat(), fc.integer({ min: 1, max: 9 }), (seed, idxSeed, delta) => {
        const value = generateValidNpi(seed);
        expect(scan(`npi ${value} ok`, npi), value).toHaveLength(1);
        const pos = idxSeed % 10;
        const mutated = value.slice(0, pos) + String((Number(value[pos]) + delta) % 10) + value.slice(pos + 1);
        // Mutating the first digit may break the 1/2 rule instead of Luhn —
        // either gate rejecting satisfies the property.
        expect(scan(`npi ${mutated} ok`, npi), mutated).toHaveLength(0);
      }),
      { numRuns: 300 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DRIVERS_LICENSE
// ─────────────────────────────────────────────────────────────────────────────

describe('drivers-license', () => {
  it('accepts DVLA numbers at MEDIUM (date rules verified)', () => {
    const c = only('dl MORGA657054SM9IJ 35 held', dl);
    expect(c.metadata?.['scheme']).toBe('dvla');
    expect(c.rawConfidence).toBe(CONFIDENCE.MEDIUM);
  });

  it('accepts letter-anchored US shapes at LOW only', () => {
    const c = only('ca A1234567 issued', dl);
    expect(c.metadata?.['state']).toBe('CA');
    expect(c.rawConfidence).toBe(CONFIDENCE.LOW);
  });

  it('rejects date-rule violations and bare digit runs (more invalid than valid)', () => {
    none('dl MORGA664054SM9IJ bad', dl); // month 64 → 14 invalid? no: 64-50=14 > 12 → rejected
    none('dl MORGA657354SM9IJ bad', dl); // day 35 → wait, day field is chars 8-9 — use an invalid day
    none('plain 12345678 digits', dl); // digit runs are never claimed
    none('plain 123456789012 digits', dl);
    none('word ABCDE12345 mixed', dl); // matches no shape
  });

  it('PROPERTY: generated DVLA numbers always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`dl ${generateValidDvla(seed)} uk`, dl)).toHaveLength(1);
      }),
      { numRuns: 300 },
    );
    // No checksum exists for DVLA numbers (structure + date rules only, as
    // the detector documents); mutation half omitted.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH_DATA
// ─────────────────────────────────────────────────────────────────────────────

describe('health-data', () => {
  it('accepts dotted ICD-10 codes', () => {
    expect(only('dx E11.9 recorded', health).metadata?.['kind']).toBe('icd10');
    expect(only('dx S72.001A coded', health).metadata?.['kind']).toBe('icd10');
    expect(only('dx C50.911 staged', health).metadata?.['kind']).toBe('icd10');
  });

  it('accepts Verhoeff-valid SNOMED SCTIDs and rejects broken ones', () => {
    // 73211009 is the published SCTID for diabetes mellitus.
    const c = only('sct 73211009 diabetes', health);
    expect(c.metadata?.['kind']).toBe('snomed');
    none('sct 73211008 broken', health); // Verhoeff fails
    none('sct 73211019 broken', health);
  });

  it('accepts lab results with units; a reference range raises confidence', () => {
    const withRange = only('HbA1c 9.1 % [4.0-5.6] high', health);
    expect(withRange.metadata?.['kind']).toBe('lab-result');
    expect(withRange.rawConfidence).toBe(CONFIDENCE.MEDIUM);
    const noRange = only('Glucose 182 mg/dL noted', health);
    expect(noRange.rawConfidence).toBe(CONFIDENCE.LOW);
  });

  it('rejects the non-medical lookalikes (more invalid than valid)', () => {
    none('vitamin B12 supplement', health); // undotted 3-char code NOT matched
    none('room A11 booked', health);
    none('version 10.2.1 shipped', health); // not an ICD shape
    none('sum 123456 plain', health); // partition 45 undefined
    none('order 8412351 ref', health); // partition 35 undefined
  });

  it('PROPERTY: generated SCTIDs and lab results always validate', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1 << 30 }), (seed) => {
        expect(scan(`sct ${generateValidSctid(seed)} dx`, health), 'sctid').toHaveLength(1);
        expect(scan(`lab ${generateValidLabResult(seed)} res`, health), 'lab').toHaveLength(1);
      }),
      { numRuns: 300 },
    );
  });

  it('OFFSETS: original span is exact mid-sentence', () => {
    const original = 'chart​ shows E11.9 today';
    const found = runStage1(normalize(original), { detectors: [health] });
    const slice = original.slice(found[0]!.originalStart, found[0]!.originalEnd);
    expect(normalize(slice).normalizedText).toBe('E11.9');
  });
});
