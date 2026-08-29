/**
 * Per-tab-session detection state.
 *
 * SPEC.md: "Originals live in memory only, per-tab-session, cleared on
 * nav-away/close. Never storage.local / localStorage / IndexedDB."
 *
 * Everything that could hold an original value lives here, in one object with
 * one `clear()`, so "what has to be cleared on navigation" is answerable by
 * reading a single file rather than by auditing every module that touched the
 * composer. The vault is the only thing in the extension that maps a surrogate
 * back to a value; nothing else may keep one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE VAULT IS PER SESSION AND NOT PER ANALYSIS
 *
 * Analysis re-runs on every edit. A vault created per run would hand the same
 * email address a different surrogate on every keystroke — the masked text
 * would churn, a user watching the panel would see values dance, and a value
 * masked once would not be recognisable as the same value masked again.
 * Consistency is a property of the session, so the vault is too.
 *
 * WHY REVERTS ARE KEYED BY VAULT ID
 *
 * The vault id derives from the VALUE, not from its position. Typing a
 * sentence above a detection shifts every offset below it, so a
 * position-keyed revert would silently transfer the user's decision to a
 * different detection. Keyed by value, the decision follows the thing it was
 * made about.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Vault } from '@privacyshield/core';
import type { SubstitutionMode } from '@privacyshield/core';

/** One random seed per session, so two sessions produce different surrogates. */
function sessionSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 1) & 0x7fffffff;
}

export class DetectionSession {
  readonly seed = sessionSeed();
  readonly mode: SubstitutionMode = 'surrogate';
  private vaultInstance = new Vault();
  private reverted = new Set<string>();
  /**
   * Increments on every analysis start.
   *
   * Analysis is asynchronous, so two runs can be in flight at once and the
   * slower one can finish last. Without this, a result computed from text the
   * user has already replaced would overwrite the result computed from what
   * they are actually looking at — the panel would describe a message that no
   * longer exists.
   */
  private generation = 0;

  get vault(): Vault {
    return this.vaultInstance;
  }

  /** Claims the next generation. Pass it back to `isCurrent` when done. */
  beginAnalysis(): number {
    this.generation += 1;
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  isReverted(id: string): boolean {
    return this.reverted.has(id);
  }

  /** Returns the new state, so a caller need not re-query to re-render. */
  toggleRevert(id: string): boolean {
    if (this.reverted.has(id)) {
      this.reverted.delete(id);
      return false;
    }
    this.reverted.add(id);
    return true;
  }

  /**
   * Drops every original.
   *
   * A fresh Vault rather than a mutating method on the old one: replacing the
   * object is what makes it impossible for a reference captured elsewhere to
   * keep the cleared entries alive. Reverts go too — a decision about a value
   * in the previous conversation is not a decision about this one.
   */
  clear(): void {
    this.vaultInstance = new Vault();
    this.reverted = new Set();
    // Any analysis still in flight is now about a session that no longer
    // exists, and must not be allowed to render.
    this.generation += 1;
  }
}
