/**
 * restorer.ts — the unmasker, correct against fragmented streaming text.
 *
 * The model's response arrives in chunks, and a surrogate may be split across
 * a chunk boundary. The restorer therefore operates on ACCUMULATED text and
 * emits only what is safe to finalize:
 *
 *  • HOLD ON PARTIAL MATCH. If a suffix of the accumulated buffer is a proper
 *    prefix of any known surrogate, that suffix is held unrendered until more
 *    text resolves it. This is the guarantee behind the key test: no partial
 *    surrogate is ever wrongly replaced, however the stream is chunked.
 *
 *  • EXACT REPLACEMENT is longest-match, left to right — a surrogate that is a
 *    prefix of a longer surrogate never steals the longer one's match.
 *
 *  • FUZZY FALLBACK is a controlled, per-token pass for a surrogate the model
 *    transformed: case change, possessive ('s), or plural (s/es). It fires
 *    ONLY when exactly one surrogate matches a settled token under those
 *    relaxations; ANY ambiguity (two surrogates match, or none) leaves the
 *    token untouched — SPEC.md's hard rule. Cross-script "translation" of a
 *    surrogate is deliberately NOT attempted; such a surrogate stays visible
 *    rather than being guessed at (ARCHITECTURE.md D13).
 *
 *  • IDEMPOTENT. Only newly-buffered text is ever processed; rendered text is
 *    never revisited. Re-restoring already-restored text is a no-op because
 *    originals are collision-guaranteed distinct from every surrogate, so
 *    nothing in the output matches a surrogate to replace again.
 */

import type { RestoreResult } from '../types.js';
import type { Vault } from './vault.js';

/** ASCII/Unicode word character, for exact-match boundary checks. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

interface FuzzyEntry {
  readonly surrogate: string;
  readonly lower: string;
  readonly original: string;
}

export interface RestorerOptions {
  /** Enable the transformed-surrogate fuzzy fallback. Default true. */
  readonly fuzzy?: boolean;
}

export class Restorer {
  private buffer = '';
  private out = '';
  private restored = 0;
  private done = false;

  private readonly surrogatesByLength: readonly string[];
  private readonly maxLen: number;
  private readonly fuzzyByLower: ReadonlyMap<string, readonly FuzzyEntry[]>;
  private readonly fuzzy: boolean;
  private readonly vault: Vault;

  constructor(vault: Vault, options: RestorerOptions = {}) {
    this.vault = vault;
    this.fuzzy = options.fuzzy ?? true;
    const surrogates = vault.replacements();
    this.surrogatesByLength = [...surrogates].sort((a, b) => b.length - a.length);
    this.maxLen = surrogates.reduce((m, s) => Math.max(m, s.length), 0);

    const fuzzyMap = new Map<string, FuzzyEntry[]>();
    for (const surrogate of surrogates) {
      const entry = vault.getBySurrogate(surrogate);
      if (entry === undefined) continue;
      const lower = surrogate.toLowerCase();
      const list = fuzzyMap.get(lower) ?? [];
      list.push({ surrogate, lower, original: entry.original });
      fuzzyMap.set(lower, list);
    }
    this.fuzzyByLower = fuzzyMap;
  }

  /** Push the next stream chunk; returns the text newly rendered this call. */
  push(chunk: string): string {
    if (this.done) throw new Error('restorer: push after finish');
    this.buffer += chunk;
    return this.drain(false);
  }

  /** Flush the remainder; no more holding. Returns the final rendered text. */
  finish(): string {
    if (this.done) return '';
    const tail = this.drain(true);
    this.done = true;
    return tail;
  }

  /** Everything rendered so far. */
  get rendered(): string {
    return this.out;
  }

  /** How many surrogate occurrences have been restored. */
  get restoredCount(): number {
    return this.restored;
  }

  /** Emit every settled portion of the buffer, holding what is still risky. */
  private drain(final: boolean): string {
    if (this.surrogatesByLength.length === 0) {
      // Nothing to restore: pure passthrough, no holding.
      const emit = this.buffer;
      this.buffer = '';
      this.out += emit;
      return emit;
    }

    const holdFrom = final ? this.buffer.length : this.holdPoint();
    const settled = this.buffer.slice(0, holdFrom);
    this.buffer = this.buffer.slice(holdFrom);
    const emitted = this.replaceSettled(settled);
    this.out += emitted;
    return emitted;
  }

  /**
   * The earliest position from which the buffer must be held back:
   *  • the start of any suffix that is a proper prefix of a surrogate, and
   *  • (fuzzy on) the start of a trailing non-whitespace run, so the fuzzy
   *    pass always sees whole tokens rather than a word still being typed.
   */
  private holdPoint(): number {
    const n = this.buffer.length;
    let hold = n;

    // A prefix-to-end can only begin within maxLen characters of the end.
    const scanStart = Math.max(0, n - this.maxLen);
    for (let p = scanStart; p < n; p++) {
      const tail = this.buffer.slice(p);
      if (this.isProperPrefixOfSurrogate(tail)) {
        hold = Math.min(hold, p);
        break; // earliest such p found
      }
    }

    if (this.fuzzy) {
      // Trailing run of non-whitespace = a token that may still be growing.
      let w = n;
      while (w > 0 && !/\s/.test(this.buffer[w - 1]!)) w--;
      if (w < n) hold = Math.min(hold, w);
    }

    return hold;
  }

  private isProperPrefixOfSurrogate(tail: string): boolean {
    if (tail.length === 0) return false;
    for (const s of this.surrogatesByLength) {
      if (s.length > tail.length && s.startsWith(tail)) return true;
    }
    return false;
  }

  /** Exact longest-match replacement, then the controlled fuzzy pass. */
  private replaceSettled(text: string): string {
    if (text.length === 0) return '';

    // Exact pass.
    let exact = '';
    let i = 0;
    while (i < text.length) {
      const match = this.longestSurrogateAt(text, i);
      if (match !== null) {
        exact += this.vault.getBySurrogate(match)!.original;
        this.restored += 1;
        i += match.length;
      } else {
        exact += text[i];
        i += 1;
      }
    }

    return this.fuzzy ? this.fuzzyPass(exact) : exact;
  }

  /**
   * Longest surrogate matching at `pos` WITH word-boundary semantics: a
   * surrogate whose first/last character is a word character must not be
   * glued to another word character in the text. Without this, a short
   * surrogate ('Cat') corrupts an ordinary word ('Catalog' -> 'Org Onealog').
   * Structured surrogates (emails, IBANs, PEM blocks) are unaffected because
   * their neighbours in real text are punctuation or whitespace, and a
   * surrogate ending in punctuation imposes no trailing constraint at all.
   * Model-added affixes ('Northwinds') are handled by the fuzzy pass, which
   * re-attaches what it strips.
   */
  private longestSurrogateAt(text: string, pos: number): string | null {
    for (const s of this.surrogatesByLength) {
      if (pos + s.length > text.length || !text.startsWith(s, pos)) continue;
      const end = pos + s.length;
      const startsWord = WORD_CHAR.test(s[0]!);
      const endsWord = WORD_CHAR.test(s[s.length - 1]!);
      if (startsWord && pos > 0 && WORD_CHAR.test(text[pos - 1]!)) continue;
      if (endsWord && end < text.length && WORD_CHAR.test(text[end]!)) continue;
      return s;
    }
    return null;
  }

  /**
   * Per-token fuzzy restoration of transformed surrogates. Splits on
   * whitespace, keeps the separators, and rewrites only tokens that resolve
   * to exactly one surrogate under case / possessive / plural relaxation.
   */
  private fuzzyPass(text: string): string {
    const pieces = text.split(/(\s+)/); // keep whitespace as odd-indexed pieces
    for (let k = 0; k < pieces.length; k += 2) {
      const token = pieces[k];
      if (token === undefined || token.length === 0) continue;
      const rewritten = this.fuzzyToken(token);
      if (rewritten !== null) {
        pieces[k] = rewritten;
        this.restored += 1;
      }
    }
    return pieces.join('');
  }

  /** Try to restore one whitespace-free token; null = leave it alone. */
  private fuzzyToken(token: string): string | null {
    // Peel surrounding punctuation so "Nils," and "(Nils)" still resolve;
    // the peeled affixes are re-attached around the restored original.
    const m = /^(\p{P}*)(.*?)(\p{P}*)$/u.exec(token);
    if (m === null) return null;
    const [, lead, coreRaw, trail] = m as unknown as [string, string, string, string];
    if (coreRaw.length === 0) return null;

    const resolved = this.resolveFuzzyCore(coreRaw);
    if (resolved === null) return null; // zero or ambiguous → leave alone
    // The stripped affix is re-attached to the ORIGINAL, so a model plural
    // survives restoration ('Northwinds' -> 'Acme Corps') — except when the
    // original already ends with the same letters, where re-attaching would
    // only stutter ('Acme Holdings' + 's'). Either way the restored VALUE is
    // right; perfect cross-language morphology is out of scope here.
    const suffix =
      resolved.suffix.length > 0 && resolved.original.toLowerCase().endsWith(resolved.suffix.toLowerCase())
        ? ''
        : resolved.suffix;
    return `${lead}${resolved.original}${suffix}${trail}`;
  }

  /**
   * Resolve a core token to exactly one original, under case-fold plus
   * possessive/plural stripping, carrying the affix that was stripped.
   * Returns null when zero or MORE THAN ONE distinct original is reachable —
   * SPEC.md's hard rule that ambiguous matches are left alone.
   */
  private resolveFuzzyCore(core: string): { original: string; suffix: string } | null {
    const lower = core.toLowerCase();
    const forms: readonly (readonly [string, string])[] = [
      [lower, ''],
      [lower.replace(/['’]s$|['’]$/u, ''), core.slice(lower.replace(/['’]s$|['’]$/u, '').length)],
      ...(/es$/i.test(core) ? ([[lower.replace(/es$/i, ''), core.slice(core.length - 2)]] as const) : []),
      ...(/s$/i.test(core) ? ([[lower.replace(/s$/i, ''), core.slice(core.length - 1)]] as const) : []),
    ];

    const byOriginal = new Map<string, string>();
    for (const [form, suffix] of forms) {
      if (form === '' || form === lower && suffix !== '') continue;
      const entries = this.fuzzyByLower.get(form);
      if (entries === undefined) continue;
      for (const e of entries) {
        if (!byOriginal.has(e.original)) byOriginal.set(e.original, suffix);
      }
    }

    if (byOriginal.size !== 1) return null;
    const [original, suffix] = [...byOriginal.entries()][0]!;
    return { original, suffix };
  }
}

/** One-shot restoration of a complete (non-streamed) response. */
export function restore(text: string, vault: Vault, options: RestorerOptions = {}): RestoreResult {
  const r = new Restorer(vault, options);
  r.push(text);
  r.finish();
  return { restoredText: r.rendered, restoredCount: r.restoredCount, unmatchedReplacements: [] };
}
