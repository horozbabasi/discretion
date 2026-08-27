/**
 * Stage 2b gazetteers.
 *
 * SPEC.md: "Bundled compressed lookup sets, checked in parallel with the
 * model … Gazetteer hit alone is medium confidence; gazetteer plus model
 * agreement is high."
 *
 * The sets are Bloom filters, so the property that matters most is asymmetry:
 * a MISS is conclusive, a HIT is corroboration with a bounded error rate. The
 * tests below pin both sides, and the multilingual cases exist because a
 * gazetteer that only knows Latin-script names would quietly fail for most of
 * the world.
 */
import { describe, expect, it } from 'vitest';
import { generate } from '../src/index.js';
import { gazetteerSizes, isGazetteerType, lookupGazetteer } from '../src/gazetteer/index.js';

describe('gazetteer — coverage', () => {
  it('knows given names and surnames across scripts', () => {
    for (const name of ['Anna', 'Kowalska', 'Yuki', 'Tanaka', 'Mohammed', '山田']) {
      expect(lookupGazetteer(name, 'PERSON'), name).toBeDefined();
    }
  });

  it('knows places across scripts, including two-character CJK names', () => {
    // A CJK place name is routinely two characters. An alphabetic-script
    // minimum of three silently lost most Chinese and Japanese city names.
    for (const place of ['Istanbul', 'Warszawa', 'Köln', 'Nederland', '深圳']) {
      expect(lookupGazetteer(place, 'LOCATION'), place).toBeDefined();
    }
  });

  it('resolves a multi-word personal name word by word', () => {
    // The sets hold given names and family names separately, so a full name is
    // rarely one entry.
    const hit = lookupGazetteer('Boris Petrov', 'PERSON');
    expect(hit).toBeDefined();
    expect(hit!.totalWords).toBe(2);
    expect(hit!.matchedWords).toBe(2);
  });

  it('carries enough entries to be worth consulting', () => {
    const sizes = gazetteerSizes();
    expect(sizes.PERSON).toBeGreaterThan(500_000);
    expect(sizes.LOCATION).toBeGreaterThan(250_000);
    expect(sizes.ORG).toBeGreaterThan(250_000);
  });
});

describe('gazetteer — the miss side, which is conclusive', () => {
  it('rejects strings that are not names', () => {
    expect(lookupGazetteer('zzzqqxwv', 'PERSON')).toBeUndefined();
    expect(lookupGazetteer('qwertyuiopasdf', 'ORG')).toBeUndefined();
    expect(lookupGazetteer('thursday afternoon meeting', 'LOCATION')).toBeUndefined();
  });

  it('keeps the false-positive rate near its design target', () => {
    // A Bloom filter never returns a false negative, so this is its only error
    // mode, and it is measured rather than asserted.
    //
    // The PRNG matters more than it looks. An earlier version of this test
    // used a textbook LCG, `seed * 1103515245 + 12345`, whose multiply
    // exceeds 2^53 and silently loses precision: it produced 1,731 DISTINCT
    // tokens from 20,000 draws, so it was probing the same handful of strings
    // over and over and reported 0.000%. mulberry32 is the generator the rest
    // of the repo already uses for seeded work, and it stays inside 32-bit
    // integer arithmetic.
    const rng = generate.mulberry32(20260828);
    const samples = 50_000;
    const distinct = new Set<string>();
    let hits = 0;
    for (let i = 0; i < samples; i += 1) {
      let token = '';
      const length = 7 + Math.floor(rng() * 6);
      for (let j = 0; j < length; j += 1) token += String.fromCharCode(97 + Math.floor(rng() * 26));
      distinct.add(token);
      if (lookupGazetteer(token, 'PERSON') !== undefined) hits += 1;
    }

    // Guard the guard: a probe that repeats itself cannot measure anything.
    expect(distinct.size).toBeGreaterThan(samples * 0.99);
    // Sized for 0.1%; allow generous sampling slack without admitting a filter
    // that is an order of magnitude off in either direction.
    expect(hits / samples).toBeGreaterThan(0.0002);
    expect(hits / samples).toBeLessThan(0.005);
  });

  it('ignores values too short or too long to be a name', () => {
    expect(lookupGazetteer('a', 'PERSON')).toBeUndefined();
    expect(lookupGazetteer('one two three four five six', 'PERSON')).toBeUndefined();
  });
});

describe('gazetteer — type guard', () => {
  it('admits only the three types a gazetteer speaks to', () => {
    expect(isGazetteerType('PERSON')).toBe(true);
    expect(isGazetteerType('ORG')).toBe(true);
    expect(isGazetteerType('LOCATION')).toBe(true);
    expect(isGazetteerType('CREDIT_CARD')).toBe(false);
    expect(isGazetteerType('GENERIC_SECRET')).toBe(false);
  });
});
