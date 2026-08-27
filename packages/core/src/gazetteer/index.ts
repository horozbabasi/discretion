/**
 * Stage 2b — GAZETTEER lookup.
 *
 * SPEC.md: "Bundled compressed lookup sets, checked in parallel with the
 * model … Gazetteer hit alone is medium confidence; gazetteer plus model
 * agreement is high."
 *
 * The bundled sets are Bloom filters (see `@privacyshield/data`'s
 * gazetteers.ts for why). Two consequences shape this module:
 *
 *   • A filter can report a false POSITIVE and never a false negative. So a
 *     hit is corroboration, never proof — which is exactly the weight SPEC.md
 *     assigns it — while a miss is conclusive.
 *   • The hash here must match the builder's byte for byte, so it is written
 *     out explicitly rather than pulled from a library that might change.
 */

import { GAZETTEERS, type GazetteerFilter } from '@privacyshield/data';
import type { EntityType } from '../types.js';

/** Entity types a gazetteer can speak to. */
export type GazetteerType = 'PERSON' | 'ORG' | 'LOCATION';

const GAZETTEER_TYPES: readonly GazetteerType[] = ['PERSON', 'ORG', 'LOCATION'];

export function isGazetteerType(type: EntityType): type is GazetteerType {
  return (GAZETTEER_TYPES as readonly string[]).includes(type);
}

/**
 * Fold a value for lookup: lowercase, then strip combining marks.
 *
 * Identical to the trigger matcher's folding, and to the builder's. Case fold
 * precedes mark stripping so Turkish dotted capital I resolves correctly.
 */
function fold(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC').trim();
}

/** FNV-1a with two seeds, then double hashing. Must match the builder. */
function hashPair(value: string): readonly [number, number] {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ (c + 0x9e3779b9), 0x85ebca6b) >>> 0;
  }
  return [a >>> 0, (b || 1) >>> 0];
}

function decode(base64: string): Uint8Array {
  // atob is available in browsers and in Node 16+, and keeps core free of
  // Node-only APIs (`Buffer`), which its eslint config bans.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

class BloomSet {
  private readonly bytes: Uint8Array;

  constructor(private readonly filter: GazetteerFilter) {
    this.bytes = decode(filter.base64);
  }

  has(folded: string): boolean {
    const [h1, h2] = hashPair(folded);
    for (let i = 0; i < this.filter.k; i += 1) {
      const bit = ((h1 + Math.imul(i, h2)) >>> 0) % this.filter.bits;
      if ((this.bytes[bit >>> 3]! & (1 << (bit & 7))) === 0) return false;
    }
    return true;
  }
}

/**
 * Filters are decoded on first use and cached.
 *
 * Decoding all three eagerly costs about 2 MB of base64 work at import time,
 * which a consumer that never runs Stage 2b should not pay.
 */
const decoded = new Map<GazetteerType, BloomSet>();

function setFor(type: GazetteerType): BloomSet {
  const cached = decoded.get(type);
  if (cached !== undefined) return cached;
  const built = new BloomSet(GAZETTEERS[type]);
  decoded.set(type, built);
  return built;
}

/** How a value matched the gazetteer. */
export interface GazetteerHit {
  readonly type: GazetteerType;
  /** True when the whole value matched, rather than one of its words. */
  readonly whole: boolean;
  /** Number of the value's words that matched, for multi-word names. */
  readonly matchedWords: number;
  readonly totalWords: number;
}

/** Longest multi-word span the gazetteer will consider as a single name. */
const MAX_WORDS = 5;

/**
 * Look a value up as `type`.
 *
 * A person's full name is rarely a single gazetteer entry — the sets hold
 * given names and family names separately — so a multi-word value is checked
 * whole first, then word by word. `matchedWords` lets the caller weigh
 * "every word is a known name" differently from "one word out of four is".
 */
export function lookupGazetteer(value: string, type: GazetteerType): GazetteerHit | undefined {
  const folded = fold(value);
  if (folded.length < 2) return undefined;

  const set = setFor(type);
  const words = folded.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0 || words.length > MAX_WORDS) return undefined;

  if (set.has(folded)) {
    return { type, whole: true, matchedWords: words.length, totalWords: words.length };
  }

  const matchedWords = words.filter((w) => set.has(w)).length;
  if (matchedWords === 0) return undefined;
  return { type, whole: false, matchedWords, totalWords: words.length };
}

/** Entry counts per set, for reporting and for BENCHMARKS.md. */
export function gazetteerSizes(): Readonly<Record<GazetteerType, number>> {
  return {
    PERSON: GAZETTEERS.PERSON.entries,
    ORG: GAZETTEERS.ORG.entries,
    LOCATION: GAZETTEERS.LOCATION.entries,
  };
}
