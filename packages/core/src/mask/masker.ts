/**
 * masker.ts — replace detected sensitive spans with surrogates (or tokens),
 * building the vault as it goes.
 *
 * Operates on Stage 1 candidates in ORIGINAL-text coordinates (the offsets
 * the runner resolved through the Stage 0 map), so the edited text is the
 * user's real text with exactly the sensitive spans replaced.
 *
 * FOUR GUARANTEES, each enforced here:
 *  • CONSISTENT — the same original (by exact, canonical, or normalized key)
 *    always maps to the same surrogate within a session; a repeat reuses the
 *    vault entry rather than minting a new one.
 *  • COLLISION-SAFE — before committing a surrogate, verify it appears
 *    nowhere in the source text and nowhere in the vault; on collision, retry
 *    with a fresh seed up to a bound. Exhausting the bound falls back to a
 *    bracket token.
 *  • REVERSIBLE — every substitution is a vault entry, so the restorer can
 *    invert it.
 *  • NON-OVERLAPPING — overlapping candidates would corrupt the edit. Stage 4
 *    (M8) does calibrated overlap resolution; here a documented pre-fusion
 *    stopgap picks a non-overlapping subset (higher confidence, then longer
 *    span, then more-specific type) purely so masking is well-defined.
 *
 * Non-sensitive candidates (known test values) are NOT masked — they are
 * detected precisely so they can be left alone.
 */

import { normalize } from '../normalization.js';
import { runStage1 } from '../detect/runner.js';
import type { Stage1Options } from '../detect/runner.js';
import type { SubstitutionMode, VaultEntry } from '../types.js';
import type { Stage1Candidate } from '../detect/types.js';
import type { Vault } from './vault.js';
import { chooseSurrogate } from './surrogates.js';
import { comparisonForm, separatorFree } from './egressGuard.js';

const MAX_SURROGATE_ATTEMPTS = 24;

export interface MaskOptions {
  /** 'surrogate' (default) or 'token' — SPEC.md's user-selectable modes. */
  readonly mode?: SubstitutionMode;
  /** Base seed; a session should vary this so two sessions differ. */
  readonly seed?: number;
}

export interface MaskedEntity {
  readonly type: Stage1Candidate['type'];
  readonly originalStart: number;
  readonly originalEnd: number;
  readonly original: string;
  readonly replacement: string;
  readonly vaultId: string;
  readonly fallback: boolean;
}

export interface MaskResult {
  readonly maskedText: string;
  readonly entities: readonly MaskedEntity[];
  readonly vaultEntries: readonly VaultEntry[];
}

/** A stable bracket token, used in token mode and as the surrogate fallback. */
function bracketToken(type: string, ordinal: number): string {
  return `[${type}_${ordinal}]`;
}

/**
 * Pre-fusion overlap resolution: greedily keep non-overlapping candidates,
 * preferring higher confidence, then longer span, then a stable detector id
 * for determinism. A documented stopgap until Stage 4 fusion (M8) resolves
 * overlaps against calibrated scores.
 */
export function resolveForMasking(candidates: readonly Stage1Candidate[]): Stage1Candidate[] {
  const sensitive = candidates.filter((c) => c.sensitive);
  const ranked = [...sensitive].sort((a, b) => {
    if (b.rawConfidence !== a.rawConfidence) return b.rawConfidence - a.rawConfidence;
    const lenA = a.originalEnd - a.originalStart;
    const lenB = b.originalEnd - b.originalStart;
    if (lenB !== lenA) return lenB - lenA;
    return a.detectorId < b.detectorId ? -1 : 1;
  });
  const kept: Stage1Candidate[] = [];
  for (const c of ranked) {
    if (!kept.some((k) => c.originalStart < k.originalEnd && k.originalStart < c.originalEnd)) {
      kept.push(c);
    }
  }
  return kept.sort((a, b) => a.originalStart - b.originalStart);
}

/**
 * Mask the given ORIGINAL text using the Stage 1 candidates found in it.
 * The candidates' `originalStart`/`originalEnd` must index into `original`.
 */
export function maskOriginal(
  original: string,
  candidates: readonly Stage1Candidate[],
  vault: Vault,
  options: MaskOptions = {},
): MaskResult {
  const mode = options.mode ?? 'surrogate';
  const baseSeed = options.seed ?? 0x5eed;
  const resolved = resolveForMasking(candidates);

  // The collision check must run in the EGRESS GUARD'S comparison space:
  // the guard scans in normalized+case-folded form plus a separator-free
  // canonical pass, so a surrogate is acceptable only if none of this
  // document's sensitive values would be found inside it under those same
  // comparisons. The bug this prevents was found by the integration
  // property: a phone surrogate drawn from the same small pool was the SAME
  // number as the original in different formatting — the literal string
  // check passed, and the masked text then failed its own guard.
  const forbiddenNeedles = resolved.map((c) => {
    const value = original.slice(c.originalStart, c.originalEnd);
    const form = comparisonForm(value);
    const strip = separatorFree(separatorFreeCanonical(c, value));
    return { form, strip };
  });

  const entities: MaskedEntity[] = [];
  const vaultEntries: VaultEntry[] = [];
  const tokenOrdinals = new Map<string, number>();

  const out: string[] = [];
  let cursor = 0;

  for (const c of resolved) {
    const value = original.slice(c.originalStart, c.originalEnd);
    out.push(original.slice(cursor, c.originalStart));
    cursor = c.originalEnd;

    // Consistency: a value already masked this session reuses its surrogate.
    const existing = vault.getByOriginal(value, c.canonical);
    if (existing !== undefined) {
      out.push(existing.replacement);
      entities.push({
        type: c.type, originalStart: c.originalStart, originalEnd: c.originalEnd,
        original: value, replacement: existing.replacement, vaultId: existing.id,
        fallback: existing.fallback ?? false,
      });
      continue;
    }

    const { replacement, fallback } = selectReplacement(
      c, value, original, vault, mode, baseSeed, tokenOrdinals, forbiddenNeedles,
    );
    const entry = vault.register({
      type: c.type,
      original: value,
      replacement,
      ...(c.canonical !== undefined ? { canonical: c.canonical } : {}),
      ...(fallback ? { fallback: true } : {}),
    });
    vaultEntries.push(entry);
    out.push(replacement);
    entities.push({
      type: c.type, originalStart: c.originalStart, originalEnd: c.originalEnd,
      original: value, replacement, vaultId: entry.id, fallback,
    });
  }
  out.push(original.slice(cursor));

  return { maskedText: out.join(''), entities, vaultEntries };
}

/**
 * End-to-end: normalize, run Stage 1, and mask the original text. The
 * convenience entry point for the playground (M5) and the tests; the
 * extension (M9) wires the same pieces with its own detection options.
 */
export function mask(text: string, vault: Vault, options: MaskOptions & Stage1Options = {}): MaskResult {
  const normalization = normalize(text);
  const { mode, seed, ...stage1 } = options;
  const candidates = runStage1(normalization, stage1);
  return maskOriginal(
    text,
    candidates,
    vault,
    { ...(mode !== undefined ? { mode } : {}), ...(seed !== undefined ? { seed } : {}) },
  );
}

interface ForbiddenNeedle {
  readonly form: string;
  readonly strip: string;
}

/** The candidate's canonical in comparison form (falls back to the value). */
function separatorFreeCanonical(c: Stage1Candidate, value: string): string {
  return comparisonForm(c.canonical ?? value);
}

/** Pick a collision-free, consistent replacement for one value. */
function selectReplacement(
  c: Stage1Candidate,
  value: string,
  sourceDoc: string,
  vault: Vault,
  mode: SubstitutionMode,
  baseSeed: number,
  tokenOrdinals: Map<string, number>,
  forbiddenNeedles: readonly ForbiddenNeedle[],
): { replacement: string; fallback: boolean } {
  if (mode === 'token') {
    return { replacement: nextToken(c.type, vault, sourceDoc, tokenOrdinals), fallback: false };
  }

  const seedBase = baseSeed ^ hashString(c.canonical ?? value);
  for (let attempt = 0; attempt < MAX_SURROGATE_ATTEMPTS; attempt++) {
    const surrogate = chooseSurrogate(
      { type: c.type, text: value, ...(c.metadata !== undefined ? { metadata: c.metadata } : {}) },
      (seedBase + attempt * 0x9e37) & 0x7fffffff,
    );
    if (surrogate === null) break; // no surrogate for this type → token
    if (!collides(surrogate, sourceDoc, vault, forbiddenNeedles)) {
      return { replacement: surrogate, fallback: false };
    }
  }
  // Pool exhausted or no surrogate: fall back to a bracket token, recorded.
  return { replacement: nextToken(c.type, vault, sourceDoc, tokenOrdinals), fallback: true };
}

/**
 * A surrogate collides if it appears in the source text or the vault — or
 * if any of this document's sensitive values would be FOUND WITHIN IT under
 * the egress guard's comparisons (normalized case-folded substring, or the
 * ≥6-char separator-free canonical pass). Masker and guard sharing one
 * comparison space is what guarantees masked text passes its own guard.
 */
function collides(
  surrogate: string,
  sourceDoc: string,
  vault: Vault,
  forbiddenNeedles: readonly ForbiddenNeedle[],
): boolean {
  if (vault.wouldCollide(surrogate)) return true;
  // Case-insensitive appearance in the source, so the restorer's fuzzy pass
  // cannot later confuse the surrogate with pre-existing text.
  if (sourceDoc.toLowerCase().includes(surrogate.toLowerCase())) return true;

  const surrogateForm = comparisonForm(surrogate);
  const surrogateStrip = separatorFree(surrogateForm);
  for (const needle of forbiddenNeedles) {
    if (needle.form.length > 0 && surrogateForm.includes(needle.form)) return true;
    if (needle.strip.length >= 6 && surrogateStrip.includes(needle.strip)) return true;
  }
  return false;
}

/** The next unused bracket token for a type (unique in source and vault). */
function nextToken(type: string, vault: Vault, sourceDoc: string, tokenOrdinals: Map<string, number>): string {
  let ordinal = tokenOrdinals.get(type) ?? 1;
  let token = bracketToken(type, ordinal);
  while (vault.wouldCollide(token) || sourceDoc.includes(token)) {
    ordinal += 1;
    token = bracketToken(type, ordinal);
  }
  tokenOrdinals.set(type, ordinal + 1);
  return token;
}

/** Deterministic 31-bit string hash so a value's seed is stable per session. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h & 0x7fffffff;
}
