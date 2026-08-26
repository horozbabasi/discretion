/**
 * vault.ts — the in-memory bidirectional map between originals and their
 * replacements.
 *
 * SPEC.md contract: deterministic and referentially consistent; normalized
 * lookup so trivial variants (case, surrounding whitespace) resolve to one
 * entry; clear() wipes it; and NO method exposes the full plaintext set
 * except the egress guard, which needs it.
 *
 * That last rule is enforced by shape, not convention: the only bulk
 * accessor is `createEgressAuditor()`, which returns a capability object
 * whose sole consumer is `guardEgress`. Every other read requires already
 * knowing the value being looked up (`getByOriginal`) or holds no plaintext
 * (`getBySurrogate` returns the entry, whose `original` the restorer needs
 * one at a time — that is restoration's whole job). There is deliberately
 * no `entries()` / iteration API. (TypeScript cannot stop a caller from
 * invoking the auditor factory, but the single, loudly-named door makes any
 * misuse a visible code-review event rather than an accident. Recorded in
 * ARCHITECTURE.md D11.)
 *
 * NORMALIZED LOOKUP is deliberately conservative. The lookup key folds
 * case and trims/collapses whitespace, but a normalized key may be shared
 * by DIFFERENT exact originals (two base58 values differing only in case
 * are different values). The exact map always wins; the normalized index
 * resolves a variant only when it maps to exactly one entry — an ambiguous
 * normalized hit returns undefined rather than guessing.
 */

import type { EntityType, VaultEntry } from '../types.js';

/** Case-folded, trimmed, inner-whitespace-collapsed lookup key. */
export function normalizedKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** What the egress guard receives: the one deliberate door to plaintext. */
export interface EgressAuditor {
  /** Every entry: (exact original, canonical, id, type). Guard-only. */
  auditEntries(): readonly { original: string; canonical: string; id: string; type: EntityType }[];
}

export class Vault {
  private readonly byOriginal = new Map<string, VaultEntry>();
  private readonly byCanonical = new Map<string, VaultEntry>();
  private readonly byNormalized = new Map<string, Set<VaultEntry>>();
  private readonly byReplacement = new Map<string, VaultEntry>();
  private counter = 0;

  /**
   * Register a new masked value. The caller (the masker) has already
   * resolved consistency — `register` throws on a duplicate original or
   * replacement rather than silently merging, because reaching that point
   * means the masker's lookup logic is broken and restoration would be
   * ambiguous.
   */
  register(entry: Omit<VaultEntry, 'id' | 'createdAt'>): VaultEntry {
    if (this.byOriginal.has(entry.original)) {
      throw new Error('vault: original already registered');
    }
    if (this.byReplacement.has(entry.replacement)) {
      throw new Error('vault: replacement already in use');
    }
    const full: VaultEntry = {
      ...entry,
      id: `v${++this.counter}`,
      createdAt: Date.now(),
    };
    this.byOriginal.set(full.original, full);
    if (full.canonical !== undefined) {
      if (!this.byCanonical.has(full.canonical)) this.byCanonical.set(full.canonical, full);
    }
    const key = normalizedKey(full.original);
    let set = this.byNormalized.get(key);
    if (set === undefined) {
      set = new Set();
      this.byNormalized.set(key, set);
    }
    set.add(full);
    this.byReplacement.set(full.replacement, full);
    return full;
  }

  /**
   * Find the entry for an original: exact writing first, then the
   * detector's canonical form (separator variants of one identifier), then
   * the case/whitespace-normalized index — which only resolves when
   * unambiguous.
   */
  getByOriginal(original: string, canonical?: string): VaultEntry | undefined {
    const exact = this.byOriginal.get(original);
    if (exact !== undefined) return exact;
    if (canonical !== undefined) {
      const viaCanonical = this.byCanonical.get(canonical);
      if (viaCanonical !== undefined) return viaCanonical;
    }
    const set = this.byNormalized.get(normalizedKey(original));
    if (set !== undefined && set.size === 1) {
      return set.values().next().value;
    }
    return undefined;
  }

  /** Find the entry whose replacement is exactly `replacement`. */
  getBySurrogate(replacement: string): VaultEntry | undefined {
    return this.byReplacement.get(replacement);
  }

  /** True when `value` is already in use as a replacement or an original —
   *  the collision check surrogate selection runs before committing. */
  wouldCollide(value: string): boolean {
    if (this.byReplacement.has(value)) return true;
    if (this.byOriginal.has(value)) return true;
    // Case-insensitive replacement uniqueness: the restorer's fuzzy pass
    // (case-changed surrogates) is only sound when no two replacements
    // collide case-insensitively.
    const key = normalizedKey(value);
    for (const replacement of this.byReplacement.keys()) {
      if (normalizedKey(replacement) === key) return true;
    }
    return this.byNormalized.has(key);
  }

  /** All current replacements (surrogates/tokens) — contains no originals;
   *  the restorer builds its match tables from this. */
  replacements(): readonly string[] {
    return [...this.byReplacement.keys()];
  }

  get size(): number {
    return this.byOriginal.size;
  }

  /** Wipe everything. Called on navigation away and conversation switch. */
  clear(): void {
    this.byOriginal.clear();
    this.byCanonical.clear();
    this.byNormalized.clear();
    this.byReplacement.clear();
  }

  /** THE one deliberate door to the plaintext set. Egress guard only. */
  createEgressAuditor(): EgressAuditor {
    return {
      auditEntries: () =>
        [...this.byOriginal.values()].map((e) => ({
          original: e.original,
          canonical: e.canonical ?? e.original,
          id: e.id,
          type: e.type,
        })),
    };
  }
}
