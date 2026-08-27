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
    // A Bloom filter never returns a false negative, so this is the only error
    // mode. Measured rather than asserted: the filters are sized for 0.1%.
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let hits = 0;
    const samples = 5000;
    for (let i = 0; i < samples; i += 1) {
      let token = '';
      const length = 7 + Math.floor(next() * 5);
      for (let j = 0; j < length; j += 1) token += String.fromCharCode(97 + Math.floor(next() * 26));
      if (lookupGazetteer(token, 'PERSON') !== undefined) hits += 1;
    }
    expect(hits / samples).toBeLessThan(0.01);
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
