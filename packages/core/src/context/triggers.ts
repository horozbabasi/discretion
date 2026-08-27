/**
 * Stage 3, TRIGGER PROXIMITY.
 *
 * SPEC.md: "TRIGGER PROXIMITY — labels near the candidate, across many
 * languages ('SSN', 'passport no', 'diagnosis', 'my name is', 'IBAN',
 * 'kimlik', 'Personalausweis', '护照', 'паспорт', 'पासपोर्ट', and so on).
 * Maintain the trigger lexicon as per-language data files, not inline code,
 * so contributors can extend it. Cover at minimum the twenty most-spoken
 * languages."
 *
 * This module is the MATCHER; the lexicons themselves live in
 * `@privacyshield/data` as required. Two matching strategies run together
 * because one alone cannot cover the world's scripts:
 *
 *   • Space-delimited scripts tokenize, then look up 1..4-word n-grams in a
 *     hash map. Exact, and O(window) rather than O(window × terms).
 *   • Scripts that do not space their words (Han, Kana, Hangul-adjacent
 *     compounds, Thai, Khmer, Lao) cannot be tokenized that way, so their
 *     terms are substring-searched instead. Keeping them in a separate,
 *     much smaller list is what makes the substring pass affordable.
 *
 * Matching is case- and diacritic-insensitive: a form label reading "TCKN",
 * "tckn" or "Tckn" is the same signal, and a user typing "numero" instead of
 * "número" should not lose protection.
 */

import type { EntityType } from '../types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Lexicon shape
// ─────────────────────────────────────────────────────────────────────────────

/** One language's triggers, keyed by the entity type each vouches for. */
export interface LanguageTriggers {
  /** BCP-47 primary subtag, e.g. 'tr', 'zh', 'he'. */
  readonly code: string;
  readonly triggers: Readonly<Partial<Record<EntityType, readonly string[]>>>;
}

/** A trigger found near a candidate. */
export interface TriggerMatch {
  /** The lexicon term that matched, in its lexicon (folded) form. */
  readonly term: string;
  /** Entity types this term vouches for. */
  readonly types: readonly EntityType[];
  /** Characters between the trigger and the candidate. 0 when adjacent. */
  readonly distance: number;
  /** Language codes that contributed this term. */
  readonly languages: readonly string[];
}

export interface TriggerIndex {
  /** Number of distinct terms indexed, for reporting. */
  readonly termCount: number;
  /**
   * Triggers found within `window` characters of the span, nearest first.
   * Searching both sides matters: most languages label before the value
   * ("SSN: …") but several place it after ("… کد ملی").
   */
  near(text: string, start: number, end: number, window?: number): readonly TriggerMatch[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Folding
// ─────────────────────────────────────────────────────────────────────────────

const COMBINING_MARKS = /\p{M}+/gu;

/**
 * Fold a string for comparison: lowercase, then strip combining marks via NFD.
 *
 * Order matters. Turkish 'İ' lowercases to 'i' + U+0307 COMBINING DOT ABOVE,
 * so the mark strip has to come after the case fold to remove it.
 */
export function foldForMatch(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
}

/** Scripts whose text is not space-delimited, so n-gram lookup cannot see it. */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Khmer}\p{Script=Lao}\p{Script=Myanmar}]/u;

/** Longest trigger, in words, that n-gram lookup will assemble. */
const MAX_NGRAM_WORDS = 4;

/** How far from the candidate a trigger still counts, in characters. */
const DEFAULT_WINDOW = 64;

/** Word characters for tokenizing space-delimited scripts. */
const WORD_TOKEN = /[\p{L}\p{M}\p{N}_]+/gu;

// ─────────────────────────────────────────────────────────────────────────────
// Index construction
// ─────────────────────────────────────────────────────────────────────────────

interface TermEntry {
  readonly term: string;
  readonly types: EntityType[];
  readonly languages: string[];
}

interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Compile per-language lexicons into one index.
 *
 * All languages are matched at once rather than gated on a detected document
 * language. That is deliberate: real messages mix languages (an English
 * sentence quoting a German form label), language detection on a short chat
 * message is unreliable, and a missed trigger costs recall on a privacy tool.
 * The cost is that a term which is a common word in another language can
 * mis-fire, which is why `near` reports what matched — Stage 3 weighs it,
 * and the explanation records it.
 */
export function buildTriggerIndex(lexicons: readonly LanguageTriggers[]): TriggerIndex {
  const spaced = new Map<string, TermEntry>();
  const unspaced: TermEntry[] = [];

  for (const lexicon of lexicons) {
    for (const [type, terms] of Object.entries(lexicon.triggers)) {
      for (const raw of terms ?? []) {
        const term = foldForMatch(raw.trim());
        if (term.length === 0) continue;
        addTerm(term, type as EntityType, lexicon.code, spaced, unspaced);
      }
    }
  }

  // Longest first, so "kimlik no" wins over "kimlik" on the same text.
  unspaced.sort((a, b) => b.term.length - a.term.length);

  return {
    termCount: spaced.size + unspaced.length,
    near(text, start, end, window = DEFAULT_WINDOW) {
      return findNear(text, start, end, window, spaced, unspaced);
    },
  };
}

function addTerm(
  term: string,
  type: EntityType,
  language: string,
  spaced: Map<string, TermEntry>,
  unspaced: TermEntry[],
): void {
  if (UNSPACED_SCRIPT.test(term)) {
    const existing = unspaced.find((e) => e.term === term);
    mergeInto(existing ?? pushNew(unspaced, term), type, language);
    return;
  }
  const existing = spaced.get(term);
  if (existing === undefined) {
    spaced.set(term, { term, types: [type], languages: [language] });
    return;
  }
  mergeInto(existing, type, language);
}

function pushNew(list: TermEntry[], term: string): TermEntry {
  const entry: TermEntry = { term, types: [], languages: [] };
  list.push(entry);
  return entry;
}

function mergeInto(entry: TermEntry, type: EntityType, language: string): void {
  if (!entry.types.includes(type)) entry.types.push(type);
  if (!entry.languages.includes(language)) entry.languages.push(language);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

function findNear(
  text: string,
  start: number,
  end: number,
  window: number,
  spaced: ReadonlyMap<string, TermEntry>,
  unspaced: readonly TermEntry[],
): TriggerMatch[] {
  const from = Math.max(0, start - window);
  const to = Math.min(text.length, end + window);
  const before = foldForMatch(text.slice(from, start));
  const after = foldForMatch(text.slice(end, to));

  const matches: TriggerMatch[] = [];
  collectSpaced(before, spaced, (entry, tokenEnd) =>
    matches.push(toMatch(entry, before.length - tokenEnd)),
  );
  collectSpaced(after, spaced, (entry, _tokenEnd, tokenStart) =>
    matches.push(toMatch(entry, tokenStart)),
  );
  collectUnspaced(before, unspaced, (entry, index) =>
    matches.push(toMatch(entry, before.length - (index + entry.term.length))),
  );
  collectUnspaced(after, unspaced, (entry, index) => matches.push(toMatch(entry, index)));

  matches.sort((a, b) => a.distance - b.distance);
  return dedupe(matches);
}

function toMatch(entry: TermEntry, distance: number): TriggerMatch {
  return {
    term: entry.term,
    types: entry.types,
    languages: entry.languages,
    distance: Math.max(0, distance),
  };
}

/** Tokenize and probe every 1..MAX_NGRAM_WORDS window against the map. */
function collectSpaced(
  text: string,
  spaced: ReadonlyMap<string, TermEntry>,
  emit: (entry: TermEntry, tokenEnd: number, tokenStart: number) => void,
): void {
  const tokens = tokenize(text);
  for (let i = 0; i < tokens.length; i += 1) {
    for (let n = 1; n <= MAX_NGRAM_WORDS && i + n <= tokens.length; n += 1) {
      const slice = tokens.slice(i, i + n);
      const first = slice[0];
      const last = slice[n - 1];
      if (first === undefined || last === undefined) continue;
      const entry = spaced.get(slice.map((t) => t.text).join(' '));
      if (entry !== undefined) emit(entry, last.end, first.start);
    }
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const pattern = new RegExp(WORD_TOKEN.source, WORD_TOKEN.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

function collectUnspaced(
  text: string,
  unspaced: readonly TermEntry[],
  emit: (entry: TermEntry, index: number) => void,
): void {
  for (const entry of unspaced) {
    const index = text.indexOf(entry.term);
    if (index !== -1) emit(entry, index);
  }
}

/** Keep the nearest occurrence of each distinct term. */
function dedupe(matches: readonly TriggerMatch[]): TriggerMatch[] {
  const seen = new Set<string>();
  const out: TriggerMatch[] = [];
  for (const match of matches) {
    if (seen.has(match.term)) continue;
    seen.add(match.term);
    out.push(match);
  }
  return out;
}
