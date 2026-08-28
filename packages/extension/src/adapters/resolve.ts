/**
 * Tiered element resolution — construction #1 (ambiguity is a failure) and
 * construction #4 (verified writes) from types.ts.
 *
 * SPEC.md: "For every element define an ordered strategy list: stable
 * attributes first (data-testid, role, aria-label, contenteditable), then
 * structural heuristics, then class names last."
 */

import type {
  ComposerHandle,
  ElementHandle,
  ElementStrategy,
  Invariant,
  Resolution,
  ResolutionFailure,
  StrategyTier,
  WriteResult,
} from './types.js';
import { TIER_ORDER } from './types.js';

interface Candidate<E extends Element> {
  readonly node: E;
  readonly strategyId: string;
}

/**
 * Collects the distinct nodes matched by every strategy in one tier.
 *
 * Distinct by NODE IDENTITY, not by selector: two strategies agreeing on the
 * same node is corroboration, not ambiguity, and should not be punished.
 */
function collectTier<E extends Element>(
  strategies: readonly ElementStrategy<E>[],
  tier: StrategyTier,
  root: ParentNode,
): Candidate<E>[] {
  const found: Candidate<E>[] = [];
  for (const strategy of strategies) {
    if (strategy.tier !== tier) continue;
    for (const node of strategy.find(root)) {
      if (found.some((c) => c.node === node)) continue;
      found.push({ node, strategyId: strategy.id });
    }
  }
  return found;
}

/**
 * Resolves exactly one element, or fails.
 *
 * THE AMBIGUITY RULE, which is the whole point of this function: if a tier
 * matches two or more DISTINCT nodes, that is a hard failure with no
 * fall-through to a weaker tier. There is no tie-break, no "first match wins",
 * no scoring. The reasoning is that a composer-shaped decoy presents as a
 * second match, and any rule for choosing between two candidates is a rule
 * that will eventually choose the decoy — silently, because the caller cannot
 * tell a confident answer from a guess. Blocking the send and reporting a
 * broken adapter is the correct outcome; picking one is not.
 *
 * Falling through to a weaker tier IS allowed when a tier's matches all fail
 * their invariants. That is a different situation: the tier gave a definite
 * answer and the answer was demonstrably the wrong KIND of element, so trying
 * a weaker tier is a second opinion rather than a guess between rivals.
 *
 * See the ordering note inside the loop for why invariants are applied before
 * the ambiguity count rather than after it. That ordering was wrong in the
 * first version of this function, and the composer-hidden-clone fixture is
 * what caught it.
 */
export function resolveUnique<E extends Element>(
  target: string,
  root: ParentNode,
  strategies: readonly ElementStrategy<E>[],
  invariants: readonly Invariant<E>[],
): Resolution<ElementHandle<E>> {
  const triedStrategies = strategies.map((s) => s.id);
  const invariantFailures: string[] = [];

  for (const tier of TIER_ORDER) {
    const matched = collectTier(strategies, tier, root);
    if (matched.length === 0) continue;

    // ORDER MATTERS: invariants are applied BEFORE the uniqueness count.
    //
    // Invariants decide what is a candidate at all; the ambiguity rule then
    // adjudicates between candidates. Counting first and filtering second
    // looks equivalent and is not: sites keep hidden measurement clones and
    // aria-hidden duplicates of the composer, and counting those as rivals
    // would report ambiguity — and so block every send — on a page that is
    // working perfectly. An extension that blocks a healthy page gets
    // uninstalled, and an uninstalled extension protects nobody.
    //
    // This does not weaken the ambiguity rule. Two elements that both satisfy
    // every invariant are two real candidates, and those still fail hard.
    const candidates: Candidate<E>[] = [];
    for (const candidate of matched) {
      const broken = invariants.filter((inv) => !inv.holds(candidate.node));
      if (broken.length === 0) candidates.push(candidate);
      else invariantFailures.push(`${tier}/${candidate.strategyId}: ${broken.map((b) => b.id).join(', ')}`);
    }
    if (candidates.length === 0) continue;

    if (candidates.length > 1) {
      return {
        ok: false,
        failure: {
          kind: 'ambiguous',
          target,
          detail:
            `${candidates.length} distinct elements matched at the '${tier}' tier ` +
            `(${candidates.map((c) => c.strategyId).join(', ')}). Refusing to guess between them.`,
          triedStrategies,
        },
      };
    }

    const candidate = candidates[0] as Candidate<E>;
    return {
      ok: true,
      value: { node: candidate.node, target, tier, strategyId: candidate.strategyId },
    };
  }

  if (invariantFailures.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'invariant',
        target,
        detail: `Every candidate failed its invariants (${invariantFailures.join('; ')}).`,
        triedStrategies,
      },
    };
  }

  return {
    ok: false,
    failure: {
      kind: 'not-found',
      target,
      detail: 'No strategy at any tier matched an element.',
      triedStrategies,
    },
  };
}

/** Re-checks that a previously resolved handle is still usable. */
export function stillValid<E extends Element>(
  handle: ElementHandle<E>,
  invariants: readonly Invariant<E>[],
): Resolution<ElementHandle<E>> {
  if (!handle.node.isConnected) {
    return {
      ok: false,
      failure: {
        kind: 'detached',
        target: handle.target,
        detail: 'The resolved element has been removed from the document.',
        triedStrategies: [handle.strategyId],
      },
    };
  }
  const broken = invariants.filter((inv) => !inv.holds(handle.node));
  if (broken.length > 0) {
    return {
      ok: false,
      failure: {
        kind: 'invariant',
        target: handle.target,
        detail: `The element no longer satisfies: ${broken.map((b) => b.id).join(', ')}.`,
        triedStrategies: [handle.strategyId],
      },
    };
  }
  return { ok: true, value: handle };
}

/**
 * Whitespace-only differences between what was written and what reads back.
 *
 * Composers legitimately normalise: contenteditable hosts append a trailing
 * newline, some sites convert CRLF. Those differences are safe, because the
 * property that matters is that no ORIGINAL sensitive text survives the write.
 * Nothing beyond line-ending form and trailing whitespace is forgiven — a
 * readback differing in any actual character is treated as a failed write.
 */
function equivalentAfterWrite(written: string, readBack: string): boolean {
  const normalise = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\s+$/u, '');
  return normalise(written) === normalise(readBack);
}

/**
 * Re-checks that a previously written value is STILL in the composer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY writeAndVerify ALONE IS NOT ENOUGH, which was a real hole.
 *
 * `writeAndVerify` reads back SYNCHRONOUSLY, in the same task as the write.
 * That catches a framework that rejects or ignores the write. It does NOT
 * catch a framework that ACCEPTS the write and reverts it on a later render
 * tick — and React does exactly that when its value tracker was not updated,
 * which is the common case for a controlled input.
 *
 * So construction #4 could report success and the composer could hold the
 * user's ORIGINAL, unmasked text microseconds later. A construction meant to
 * make silent failure impossible could itself silently pass. That is the worst
 * shape a defect can take in this codebase.
 *
 * The write path is now two checks, not one:
 *   1. writeAndVerify, immediately   — did the write land at all?
 *   2. reverifyBeforeSend, at the gate — is it STILL there?
 *
 * The second must be called as late as possible, in the same task as the
 * decision to allow the send, so nothing can re-render between the check and
 * the send. Any await between them reopens the hole.
 * ─────────────────────────────────────────────────────────────────────────
 */
export function reverifyBeforeSend(
  handle: ComposerHandle,
  expected: string,
  read: (node: HTMLElement) => string,
): WriteResult {
  if (!handle.node.isConnected) {
    return {
      ok: false,
      reason: 'detached',
      detail: 'The composer left the document between the write and the send.',
    };
  }
  const current = read(handle.node);
  if (!equivalentAfterWrite(expected, current)) {
    return {
      ok: false,
      reason: 'readback-mismatch',
      detail:
        `The composer held ${expected.length} characters after masking but holds ${current.length} now. ` +
        'Its contents changed between masking and send, so what would be sent is not what was checked.',
    };
  }
  return { ok: true };
}

/**
 * Writes text and proves it landed — construction #4.
 *
 * A write that appears to succeed but does not stick is the signature of
 * writing into the wrong node, or into a framework-controlled node without the
 * event the framework listens for. React-controlled inputs are the common
 * case: assigning `.value` updates the DOM and is then reverted on the next
 * render, so the composer still holds the user's ORIGINAL text at send time.
 * Reading back is the only way to tell those apart from a real write, and
 * failing closed on a mismatch is the only safe response.
 */
export function writeAndVerify(
  handle: ComposerHandle,
  text: string,
  write: (node: HTMLElement, value: string) => void,
  read: (node: HTMLElement) => string,
): WriteResult {
  if (!handle.node.isConnected) {
    return {
      ok: false,
      reason: 'detached',
      detail: 'The composer left the document before the write.',
    };
  }

  try {
    write(handle.node, text);
  } catch (error) {
    return {
      ok: false,
      reason: 'rejected',
      detail: `The composer rejected the write: ${error instanceof Error ? error.name : 'unknown error'}.`,
    };
  }

  const readBack = read(handle.node);
  if (!equivalentAfterWrite(text, readBack)) {
    // Deliberately reports LENGTHS, never content: this string reaches logs
    // and the degraded-state UI, and the value being written is by definition
    // adjacent to sensitive text.
    return {
      ok: false,
      reason: 'readback-mismatch',
      detail:
        `Wrote ${text.length} characters but read back ${readBack.length}. ` +
        'The composer did not accept the substituted text.',
    };
  }

  return { ok: true };
}

/** Convenience for callers that only need the failure to report it. */
export function failureOf<T>(resolution: Resolution<T>): ResolutionFailure | null {
  return resolution.ok ? null : resolution.failure;
}
