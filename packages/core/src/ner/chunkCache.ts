/**
 * Per-session reuse of Stage 2 results for unchanged chunks.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, WHICH IS AN OMISSION BEING CLOSED RATHER THAN A FEATURE
 *
 * ARCHITECTURE.md D28 reasons about window size using "the content-hash cache
 * keys on chunk text", and BENCHMARKS.md's incremental figures — the ones
 * SPEC's "pressing send is instant" rests on — were measured against exactly
 * that behaviour. It did not exist. The benchmark harness SIMULATED it, by
 * computing which chunks an edit invalidated and re-inferring only those,
 * while `NerEngine.recognize()` re-inferred every chunk on every call.
 *
 * So the published incremental number described a design, and the shipped
 * behaviour was the cold number on every debounced keystroke. This closes the
 * gap so that the two agree.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT IS PER SESSION, AND THAT IS A PRIVACY CONSTRAINT, NOT A SIZE ONE
 *
 * The keys ARE the user's text, and the values are the entities found in it.
 * SPEC.md: "Originals live in memory only, per-tab-session, cleared on
 * nav-away/close." The model lives in an offscreen document that outlives any
 * one tab and is shared by all of them, so a cache owned by the ENGINE would
 * quietly retain one tab's composer text after that tab was gone, and expose
 * it to the next.
 *
 * Ownership therefore sits with the caller, one instance per connection, so
 * its lifetime is the connection's: the content script's session opens it and
 * closing that session destroys it. That is the same lifetime the unmask vault
 * already has, so this adds no new retention — it just must not be allowed to
 * add any.
 *
 * NOT KEYED BY HASH. A 64-bit digest would shorten the keys and remove the
 * plaintext, and a collision would return one chunk's entities for a different
 * chunk's text — silently attaching the wrong spans at the wrong offsets. The
 * retention question is settled by the per-connection lifetime above; trading
 * a correctness risk for a privacy property already held would be a bad deal.
 *
 * SPANS ARE STORED WITHOUT THEIR TEXT and it is re-sliced on read. Not for
 * privacy — the key is the text anyway — but because a stored `text` could
 * drift from the chunk it is served against, and re-slicing makes that
 * impossible by construction.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { NerSpan } from './types.js';

/** A span with its text elided; re-derived from the chunk on read. */
type StoredSpan = Omit<NerSpan, 'text'>;

/**
 * How many chunks one session may keep.
 *
 * A 2,000-character message is 7 chunks at the shipped 400-character window,
 * so this holds a long message plus the history of edits that produced it.
 * Bounded because a session lasts as long as a tab does, and an unbounded map
 * keyed on everything a user has typed is exactly what SPEC's memory-only rule
 * is trying to avoid.
 */
const MAX_ENTRIES = 256;

export class ChunkCache {
  /** Insertion order IS the LRU order: Map iterates oldest-first. */
  private readonly entries = new Map<string, readonly StoredSpan[]>();
  private hitCount = 0;
  private missCount = 0;

  get(chunkText: string): NerSpan[] | undefined {
    const stored = this.entries.get(chunkText);
    if (stored === undefined) {
      this.missCount += 1;
      return undefined;
    }
    // Re-inserted so a chunk that keeps being reused stays warm.
    this.entries.delete(chunkText);
    this.entries.set(chunkText, stored);
    this.hitCount += 1;
    return stored.map((span) => ({ ...span, text: chunkText.slice(span.start, span.end) }));
  }

  set(chunkText: string, spans: readonly NerSpan[]): void {
    if (this.entries.has(chunkText)) this.entries.delete(chunkText);
    this.entries.set(
      chunkText,
      spans.map((span) => ({
        type: span.type,
        start: span.start,
        end: span.end,
        score: span.score,
        ...(span.gazetteer === undefined ? {} : { gazetteer: span.gazetteer }),
      })),
    );
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  /** Drops every original. Called when the session it belongs to ends. */
  clear(): void {
    this.entries.clear();
  }

  /** Counts only — never keys, never values. For the diagnostic. */
  get stats(): { readonly size: number; readonly hits: number; readonly misses: number } {
    return { size: this.entries.size, hits: this.hitCount, misses: this.missCount };
  }
}
