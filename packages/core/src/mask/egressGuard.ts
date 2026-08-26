/**
 * egressGuard.ts — the assertion that makes the guarantee real.
 *
 * Before any send is permitted, the outgoing payload is scanned for every
 * plaintext original currently in the vault. Any hit blocks the send and
 * reports WHICH entity leaked — by vault id and type only; the report never
 * carries the plaintext itself, because reports get logged and displayed
 * and must not become a second leak.
 *
 * Comparison is deliberately paranoid, in the fail-closed direction:
 *
 *  1. NORMALIZED + CASE-FOLDED substring search: payload and originals both
 *     go through Stage 0 normalization (stripping zero-width obfuscation,
 *     folding homoglyphs, canonicalizing punctuation variants) and are
 *     case-folded. Catches raw leaks, case variants, ZWSP-stuffed and
 *     confusable-substituted forms.
 *
 *  2. SEPARATOR-INSENSITIVE canonical search: for entries whose canonical
 *     (the detector's separator-stripped form) differs from the original,
 *     the payload is additionally searched with spacing/hyphen/dot
 *     separators removed — so "4111-1111-1111-1111" is caught when the
 *     vault holds "4111 1111 1111 1111".
 *
 * No word-boundary requirement: a plaintext original appearing INSIDE a
 * longer token is still a leak. Over-blocking is a usability bug;
 * under-blocking is the critical failure. SPEC.md: fail closed.
 */

import { normalize } from '../normalization.js';
import type { EntityType } from '../types.js';
import type { EgressAuditor } from './vault.js';

export interface EgressLeak {
  /** Vault entry id — never the value. */
  readonly entryId: string;
  readonly type: EntityType;
  /** Which comparison caught it (for diagnostics/UI copy). */
  readonly via: 'normalized' | 'separator-insensitive';
}

export interface EgressVerdict {
  /** True = safe to send. False = BLOCK; SPEC.md forbids fail-open. */
  readonly ok: boolean;
  readonly leaks: readonly EgressLeak[];
}

/** Case-folded Stage 0 normalization — the guard's comparison space. */
function comparisonForm(text: string): string {
  return normalize(text).normalizedText.toLowerCase();
}

/** Additionally remove the separators identifiers are grouped with. */
function separatorFree(text: string): string {
  return text.replace(/[ \t.\-/]/g, '');
}

/**
 * Scan `payload` for every plaintext original in the vault. The auditor is
 * the vault's single plaintext door (`vault.createEgressAuditor()`); this
 * function is its intended sole consumer.
 */
export function guardEgress(payload: string, auditor: EgressAuditor): EgressVerdict {
  const leaks: EgressLeak[] = [];
  if (payload.length === 0) return { ok: true, leaks };

  const haystack = comparisonForm(payload);
  const haystackNoSep = separatorFree(haystack);

  for (const entry of auditor.auditEntries()) {
    const needle = comparisonForm(entry.original);
    if (needle.length > 0 && haystack.includes(needle)) {
      leaks.push({ entryId: entry.id, type: entry.type, via: 'normalized' });
      continue;
    }
    const canonicalNeedle = separatorFree(comparisonForm(entry.canonical));
    if (canonicalNeedle.length >= 6 && haystackNoSep.includes(canonicalNeedle)) {
      // The ≥6 floor keeps the separator-stripped pass from degenerating on
      // very short canonicals, where stripped-substring hits stop meaning
      // anything (any 4-digit run would "leak"). The normalized pass above
      // still covers those entries in full.
      leaks.push({ entryId: entry.id, type: entry.type, via: 'separator-insensitive' });
    }
  }

  return { ok: leaks.length === 0, leaks };
}
