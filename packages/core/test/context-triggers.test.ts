/**
 * Stage 3 trigger proximity, exercised against the SHIPPED lexicons.
 *
 * SPEC.md: "TRIGGER PROXIMITY — labels near the candidate, across many
 * languages … Cover at minimum the twenty most-spoken languages."
 *
 * These tests deliberately use the real `TRIGGER_LEXICONS` rather than
 * fixtures. A matcher that works on invented data and fails on the shipped
 * lexicon would pass a fixture-based suite and protect nobody; the thing worth
 * pinning is that a Turkish identity label actually finds a Turkish identity
 * number.
 */
import { describe, expect, it } from 'vitest';
import { TRIGGER_LEXICONS } from '@discretion/data';
import { buildTriggerIndex, foldForMatch } from '../src/context/triggers.js';
import type { EntityType } from '../src/types.js';

const index = buildTriggerIndex(TRIGGER_LEXICONS);

/** Terms near `value` in `doc` that vouch for `type`. */
function triggersFor(doc: string, value: string, type: EntityType): readonly string[] {
  const start = doc.indexOf(value);
  expect(start, `fixture must contain ${value}`).toBeGreaterThanOrEqual(0);
  return index
    .near(doc, start, start + value.length)
    .filter((m) => m.types.includes(type))
    .map((m) => m.term);
}

describe('foldForMatch', () => {
  it('folds case before stripping marks, so dotted capital I survives', () => {
    // Turkish 'İ' lowercases to 'i' + COMBINING DOT ABOVE; stripping marks
    // first would leave the dot behind and the fold would not converge.
    expect(foldForMatch('İSTANBUL')).toBe(foldForMatch('istanbul'));
    expect(foldForMatch('Kimlik No')).toBe('kimlik no');
  });

  it('makes diacritics optional, so a user typing without them keeps cover', () => {
    expect(foldForMatch('número')).toBe(foldForMatch('numero'));
    expect(foldForMatch('CÉDULA')).toBe(foldForMatch('cedula'));
  });
});

describe('trigger lexicons — coverage across scripts', () => {
  const cases: readonly [string, string, string, EntityType][] = [
    ['turkish identity label', 'TC Kimlik No: 10000000146', '10000000146', 'NATIONAL_ID'],
    ['german identity document', 'Personalausweis: L01X00T471', 'L01X00T471', 'NATIONAL_ID'],
    ['russian passport', 'Паспорт: 4509 123456', '4509 123456', 'PASSPORT_MRZ'],
    ['chinese identity number', '身份证号: 11010119900307771X', '11010119900307771X', 'NATIONAL_ID'],
    ['japanese name label', '氏名: 山田太郎', '山田太郎', 'PERSON'],
    ['arabic phone label', 'رقم الهاتف: 0512345678', '0512345678', 'PHONE'],
    ['hebrew identity card', 'תעודת זהות: 123456782', '123456782', 'NATIONAL_ID'],
    ['thai identity number', 'เลขบัตรประชาชน: 1234567890121', '1234567890121', 'NATIONAL_ID'],
    ['english ssn', 'SSN: 123-45-6789', '123-45-6789', 'NATIONAL_ID'],
    ['korean name label', '이름: 김민준', '김민준', 'PERSON'],
    ['polish pesel', 'PESEL: 44051401359', '44051401359', 'NATIONAL_ID'],
  ];

  for (const [label, doc, value, type] of cases) {
    it(`finds a ${label}`, () => {
      expect(triggersFor(doc, value, type).length).toBeGreaterThan(0);
    });
  }

  it('covers at least the twenty most-spoken languages SPEC.md requires', () => {
    expect(TRIGGER_LEXICONS.length).toBeGreaterThanOrEqual(20);
  });

  it('indexes every language without collapsing terms', () => {
    expect(index.termCount).toBeGreaterThan(3000);
  });
});

describe('trigger matching — behaviour', () => {
  it('finds labels that follow the value, not only ones that precede it', () => {
    // Several languages place the label after the value.
    expect(triggersFor('10000000146 TC Kimlik No', '10000000146', 'NATIONAL_ID').length).toBeGreaterThan(0);
  });

  it('reports distance so nearer evidence can outweigh distant evidence', () => {
    const doc = 'SSN: 123-45-6789';
    const start = doc.indexOf('123-45-6789');
    const [nearest] = index.near(doc, start, start + 11);
    expect(nearest).toBeDefined();
    expect(nearest!.distance).toBeLessThan(4);
  });

  it('does not fire on ordinary prose', () => {
    const prose = 'The weather was pleasant and the meeting finished early yesterday.';
    expect(index.near(prose, 30, 37)).toEqual([]);
  });

  it('respects the search window', () => {
    const far = `SSN:${' '.repeat(200)}123-45-6789`;
    const start = far.indexOf('123-45-6789');
    expect(index.near(far, start, start + 11, 16)).toEqual([]);
  });

  it('matches multi-word triggers as a unit', () => {
    // "kimlik no" is two tokens; n-gram assembly is what finds it.
    expect(triggersFor('Kimlik No: 10000000146', '10000000146', 'NATIONAL_ID')).toContain('kimlik no');
  });
});
