import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { composeMaps, identityMap, MappedTextBuilder } from '../src/offsetMap.js';

/**
 * Synthetic transforms with hand-checkable maps, built through the same
 * MappedTextBuilder the real transforms use so the deletion-attribution
 * convention matches.
 */
interface Step {
  text: string;
  map: Int32Array;
}

/** Deletes every 'x'. */
function tDelete(input: string): Step {
  const b = new MappedTextBuilder();
  for (let i = 0; i < input.length; i++) {
    if (input[i] === 'x') b.deleteRange(i, i + 1);
    else b.copyVerbatim(input, i, i + 1);
  }
  return b.finish(input.length);
}

/** Expands every 'e' to 'ee'. */
function tExpand(input: string): Step {
  const b = new MappedTextBuilder();
  for (let i = 0; i < input.length; i++) {
    if (input[i] === 'e') b.replaceRange('ee', i, i + 1);
    else b.copyVerbatim(input, i, i + 1);
  }
  return b.finish(input.length);
}

/** Contracts every 'aa' pair to a single 'a'. */
function tContract(input: string): Step {
  const b = new MappedTextBuilder();
  let i = 0;
  while (i < input.length) {
    if (input[i] === 'a' && input[i + 1] === 'a') {
      b.replaceRange('a', i, i + 2);
      i += 2;
    } else {
      b.copyVerbatim(input, i, i + 1);
      i += 1;
    }
  }
  return b.finish(input.length);
}

/** Reference: delete-then-expand computed directly in a single pass. */
function tDeleteThenExpandDirect(input: string): Step {
  const b = new MappedTextBuilder();
  for (let i = 0; i < input.length; i++) {
    if (input[i] === 'x') b.deleteRange(i, i + 1);
    else if (input[i] === 'e') b.replaceRange('ee', i, i + 1);
    else b.copyVerbatim(input, i, i + 1);
  }
  return b.finish(input.length);
}

describe('composeMaps', () => {
  it('composes two identity maps to identity', () => {
    const composed = composeMaps(identityMap(5), identityMap(5));
    expect([...composed]).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('composes with an expansion', () => {
    // 'bec' --expand--> 'beec'
    const step = tExpand('bec');
    expect(step.text).toBe('beec');
    expect([...step.map]).toEqual([0, 1, 1, 2, 3]);
    const composed = composeMaps(identityMap(3), step.map);
    expect([...composed]).toEqual([...step.map]);
  });

  it('composes with a contraction', () => {
    // 'baab' --contract--> 'bab'
    const step = tContract('baab');
    expect(step.text).toBe('bab');
    expect([...step.map]).toEqual([0, 1, 3, 4]);
    const composed = composeMaps(identityMap(4), step.map);
    expect([...composed]).toEqual([...step.map]);
  });

  it('composes with a deletion', () => {
    // 'xex' --delete--> 'e': the leading deleted run is attributed to 'e',
    // the trailing one to the sentinel.
    const del = tDelete('xex');
    expect(del.text).toBe('e');
    expect([...del.map]).toEqual([0, 3]);
    // then 'e' --expand--> 'ee'
    const exp = tExpand(del.text);
    expect([...exp.map]).toEqual([0, 0, 1]);
    const composed = composeMaps(del.map, exp.map);
    expect([...composed]).toEqual([0, 0, 3]);
    // Identical to computing the combined transform in one pass.
    const direct = tDeleteThenExpandDirect('xex');
    expect(direct.text).toBe('ee');
    expect([...direct.map]).toEqual([...composed]);
  });

  it('composes three maps associatively', () => {
    const input = 'xaaeb';
    const s1 = tDelete(input); // 'aaeb'
    const s2 = tContract(s1.text); // 'aeb'
    const s3 = tExpand(s2.text); // 'aeeb'
    expect(s3.text).toBe('aeeb');

    const leftAssoc = composeMaps(composeMaps(s1.map, s2.map), s3.map);
    const rightAssoc = composeMaps(s1.map, composeMaps(s2.map, s3.map));
    expect([...leftAssoc]).toEqual([...rightAssoc]);

    // Spot-check the values: 'a' ← cluster 'xaa' start 0 (deleted x absorbed,
    // then contraction), 'ee' ← 'e' at original index 3, 'b' ← index 4.
    expect([...leftAssoc]).toEqual([0, 3, 3, 4, 5]);
  });

  it('rejects inner values outside the outer domain', () => {
    const outer = identityMap(2); // domain 0..2
    const inner = Int32Array.from([0, 3, 3]); // 3 is out of range
    expect(() => composeMaps(outer, inner)).toThrow(/outside the outer map's domain/);
  });

  it('property: composing maps equals applying transforms sequentially and mapping directly', () => {
    fc.assert(
      fc.property(fc.stringOf(fc.constantFrom('a', 'b', 'e', 'x'), { maxLength: 40 }), (input) => {
        const s1 = tDelete(input);
        const s2 = tExpand(s1.text);
        const composed = composeMaps(s1.map, s2.map);
        const direct = tDeleteThenExpandDirect(input);
        expect(s2.text).toBe(direct.text);
        expect([...composed]).toEqual([...direct.map]);
      }),
      { numRuns: 300 },
    );
  });

  it('property: composition preserves monotonicity and sentinels', () => {
    fc.assert(
      fc.property(fc.stringOf(fc.constantFrom('a', 'b', 'e', 'x'), { maxLength: 60 }), (input) => {
        const s1 = tContract(input);
        const s2 = tExpand(s1.text);
        const composed = composeMaps(s1.map, s2.map);
        expect(composed.length).toBe(s2.text.length + 1);
        expect(composed[s2.text.length]).toBe(input.length);
        for (let i = 1; i < composed.length; i++) {
          expect(composed[i]!).toBeGreaterThanOrEqual(composed[i - 1]!);
        }
      }),
      { numRuns: 300 },
    );
  });
});
