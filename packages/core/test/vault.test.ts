/**
 * Vault: bidirectional map, normalized lookup, plaintext containment.
 */

import { describe, it, expect } from 'vitest';

import { Vault, normalizedKey } from '../src/mask/vault.js';

const entry = (original: string, replacement: string, canonical?: string) => ({
  type: 'EMAIL' as const,
  original,
  replacement,
  ...(canonical !== undefined ? { canonical } : {}),
});

describe('vault', () => {
  it('registers and resolves both directions', () => {
    const v = new Vault();
    const e = v.register(entry('john@real.com', 'nils@fake.net'));
    expect(v.getByOriginal('john@real.com')).toBe(e);
    expect(v.getBySurrogate('nils@fake.net')).toBe(e);
    expect(v.size).toBe(1);
    expect(e.id).toBe('v1');
  });

  it('normalized lookup folds case and whitespace, but only when unambiguous', () => {
    const v = new Vault();
    const e = v.register(entry('john@real.com', 'a@b.cd'));
    expect(v.getByOriginal('  JOHN@REAL.COM ')).toBe(e);
    expect(v.getByOriginal('John@Real.Com')).toBe(e);
    // A second entry sharing the normalized key makes variants ambiguous:
    // exact writings still resolve, folded ones no longer guess.
    // (byOriginal duplicate check is on exact strings, so this registers.)
    const e2 = v.register(entry('JOHN@real.com', 'c@d.ef'));
    expect(v.getByOriginal('JOHN@real.com')).toBe(e2);
    expect(v.getByOriginal('john@real.com')).toBe(e);
    expect(v.getByOriginal('JoHn@ReAl.CoM')).toBeUndefined();
  });

  it('canonical lookup links separator variants of one identifier', () => {
    const v = new Vault();
    const e = v.register(entry('4111 1111 1111 1111', '5274 5763 9425 9961', '4111111111111111'));
    expect(v.getByOriginal('4111-1111-1111-1111', '4111111111111111')).toBe(e);
    expect(v.getByOriginal('4111-1111-1111-1111')).toBeUndefined(); // no canonical hint, different writing
  });

  it('rejects duplicate originals and duplicate replacements', () => {
    const v = new Vault();
    v.register(entry('a@x.com', 's1@y.net'));
    expect(() => v.register(entry('a@x.com', 's2@y.net'))).toThrow(/original/);
    expect(() => v.register(entry('b@x.com', 's1@y.net'))).toThrow(/replacement/);
  });

  it('wouldCollide covers replacements, originals, and case-insensitive variants', () => {
    const v = new Vault();
    v.register(entry('a@x.com', 'Fake@Pool.net'));
    expect(v.wouldCollide('Fake@Pool.net')).toBe(true); // existing replacement
    expect(v.wouldCollide('fake@pool.net')).toBe(true); // case-variant of replacement
    expect(v.wouldCollide('a@x.com')).toBe(true); // existing original
    expect(v.wouldCollide('A@X.COM')).toBe(true); // case-variant of original
    expect(v.wouldCollide('other@pool.net')).toBe(false);
  });

  it('clear() wipes everything', () => {
    const v = new Vault();
    v.register(entry('a@x.com', 's@y.net'));
    v.clear();
    expect(v.size).toBe(0);
    expect(v.getByOriginal('a@x.com')).toBeUndefined();
    expect(v.getBySurrogate('s@y.net')).toBeUndefined();
  });

  it('exposes no bulk plaintext outside the egress auditor', () => {
    const v = new Vault();
    v.register(entry('secret@real.com', 'fake@pool.net'));
    // The public surface: replacements() holds no originals…
    expect(v.replacements()).toEqual(['fake@pool.net']);
    // …and no other iteration API exists at all.
    const publicNames = Object.getOwnPropertyNames(Object.getPrototypeOf(v)).filter(
      (n) => n !== 'constructor' && !n.startsWith('_'),
    );
    expect(publicNames.sort()).toEqual(
      ['clear', 'createEgressAuditor', 'getByOriginal', 'getBySurrogate', 'register', 'replacements', 'size', 'wouldCollide'].sort(),
    );
    // The auditor is the one door, and it carries what the guard needs.
    const audit = v.createEgressAuditor().auditEntries();
    expect(audit).toHaveLength(1);
    expect(audit[0]!.original).toBe('secret@real.com');
    expect(audit[0]!.type).toBe('EMAIL');
  });

  it('normalizedKey folds case and collapses inner whitespace', () => {
    expect(normalizedKey('  A  B\tC ')).toBe('a b c');
  });
});
