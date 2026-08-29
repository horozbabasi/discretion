/**
 * What the injected surface is showing, and what it takes to get there.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE DISTINCTION THIS TYPE EXISTS TO ENFORCE
 *
 * Three of the four M9 blockers need the health model to tell two things
 * apart that currently both produce `not-found`:
 *
 *   "I cannot find this element"        -> DEGRADED. Visible, blocks sends.
 *   "this element is not applicable
 *    in the current state"              -> INACTIVE. Silent, blocks nothing.
 *
 * Measured, both happen constantly. ChatGPT disables its composer while a
 * response streams. Gemini renders no send control at all until the composer
 * has text — and an empty composer is the default state of every page load, so
 * treating that as DEGRADED means reporting a broken extension to every user
 * on every visit until they type.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SAFETY CONSTRAINT, AND THE FOUR WAYS IT WAS NEARLY WRONG
 *
 * INACTIVE must be entered ONLY on positive evidence that the element is
 * absent BY DESIGN. Never on a bare `not-found`. A missing composer
 * masquerading as an inapplicable one would undo fail-closed entirely.
 *
 * Adversarial review found four ways the first version fell short of that,
 * each of which allowed a caller to reach INACTIVE without having observed
 * what it claimed:
 *
 *   1. The emptiness predicate was ASSERTED BY THE CALLER, not observed:
 *      the observer verified the element, then trusted a separate `text`
 *      argument with no established relationship to it. It now reads the
 *      text from the same node whose liveness it just checked.
 *
 *   2. The disabled observer took an element from nowhere in particular, so
 *      it could describe a different element than the one that failed. It
 *      now takes the FAILURE and inspects the candidate that failure
 *      rejected — evidence bound to the thing it explains.
 *
 *   3. Coverage was decided on the target string alone, so evidence would
 *      explain failure KINDS it flatly contradicts: "no send control is
 *      rendered" would have explained an AMBIGUOUS send control, which
 *      asserts the opposite. Each reason now whitelists the kinds it can
 *      legitimately explain.
 *
 *   4. Nothing related the evidence to the health report in TIME. Evidence
 *      gathered before the check it explains describes a page that may since
 *      have changed. They must now come from the same synchronous pass.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { HealthReport, ResolutionFailure, ResolutionFailureKind } from '../adapters/index.js';

declare const InapplicableBrand: unique symbol;

export type InapplicableReason = 'composer-empty' | 'composer-disabled';

/**
 * Positive evidence that a target is absent by design.
 *
 * Branded, so it cannot be written as an object literal. The brand is not the
 * whole guarantee — it is what forces a caller through the observers below,
 * and each observer can only succeed by looking at a real element.
 */
export interface Inapplicable {
  readonly [InapplicableBrand]: true;
  /** The health failure this evidence explains, e.g. 'send-button'. */
  readonly target: string;
  readonly reason: InapplicableReason;
  /** Operator-facing, never page text. */
  readonly detail: string;
  readonly observedAt: number;
}

/**
 * Which failure kinds each reason may explain.
 *
 * Target alone is not enough. "This site renders no send control while the
 * composer is empty" explains a `not-found` send control and CONTRADICTS an
 * `ambiguous` one — two send controls were found, so they plainly exist.
 * Letting one explain the other would silence a real ambiguity, which is the
 * failure the whole adapter layer is built to make loud.
 */
const EXPLAINABLE: Readonly<Record<InapplicableReason, readonly ResolutionFailureKind[]>> = {
  'composer-empty': ['not-found'],
  // 'invariant' only: the composer was FOUND and rejected for being
  // uneditable. A `not-found` composer is a composer we lost, never a
  // disabled one.
  'composer-disabled': ['invariant'],
};

function evidence(target: string, reason: InapplicableReason, detail: string): Inapplicable {
  // The brand exists only in the type system - `declare const` emits nothing -
  // so it is asserted rather than assigned. That is the point: no caller
  // outside this module can write the property, and this module only reaches
  // here after a positive observation.
  return { target, reason, detail, observedAt: Date.now() } as unknown as Inapplicable;
}

/**
 * The send control is absent because the composer is empty.
 *
 * Gemini renders no send control until there is something to send.
 *
 * READS THE TEXT ITSELF rather than accepting it. The first version took the
 * composer's text as a separate argument, which meant the caller asserted the
 * condition and the observer only checked the element — so a caller passing a
 * live composer and an empty string would produce evidence for a composer that
 * actually had text. A predicate whose input the caller controls is not an
 * observation.
 */
export function sendControlNotExpected(
  composer: HTMLElement | null,
  readText: (element: HTMLElement) => string,
): Inapplicable | null {
  if (composer === null || !composer.isConnected) return null;
  if (readText(composer).length > 0) return null;
  return evidence(
    'send-button',
    'composer-empty',
    'The composer is present and empty, and this site renders no send control until there is text to send.',
  );
}

/**
 * The composer is present but not currently editable.
 *
 * ChatGPT disables it while a response streams.
 *
 * TAKES THE FAILURE, not a loose element. The evidence must be about the
 * element the failing resolution was actually about; an element fetched
 * separately could be a different node entirely, and then this would be
 * evidence about something else. `rejectedCandidate` is only populated for an
 * `invariant` failure, which is exactly the found-then-rejected case this
 * reason describes.
 *
 * A consequence worth naming: an adapter whose strategies filter uneditable
 * nodes out INSIDE `find()` reports `not-found` rather than `invariant`, so no
 * candidate is carried and this observer correctly refuses. Gemini's
 * strategies do that; ChatGPT's do not. The refusal is right — without a
 * rejected candidate there is nothing to have observed.
 */
export function composerTemporarilyDisabled(failure: ResolutionFailure): Inapplicable | null {
  if (failure.target !== 'composer' || failure.kind !== 'invariant') return null;
  const node = failure.rejectedCandidate;
  if (!(node instanceof HTMLElement) || !node.isConnected) return null;

  const asControl = node as Partial<HTMLTextAreaElement>;
  const disabled =
    asControl.disabled === true ||
    asControl.readOnly === true ||
    node.getAttribute('aria-disabled') === 'true';
  if (!disabled) return null;

  return evidence(
    'composer',
    'composer-disabled',
    'The composer is present but disabled or read-only, which usually means a response is generating.',
  );
}

/** One detection as the review panel shows it. SPEC's step 5. */
export interface ReviewItem {
  readonly id: string;
  readonly entityType: string;
  /** Calibrated, 0–1. */
  readonly confidence: number;
  readonly explanation: string;
  /** What will replace it. Shown; the original never is. */
  readonly surrogate: string;
  /** Individually revertible, per SPEC. */
  readonly reverted: boolean;
}

export interface ReviewContent {
  readonly items: readonly ReviewItem[];
  /** 0–100. */
  readonly exposureScore: number;
}

export type SurfaceState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'review'; readonly content: ReviewContent }
  | { readonly kind: 'degraded'; readonly failures: readonly ResolutionFailure[] }
  | { readonly kind: 'inactive'; readonly evidence: readonly Inapplicable[] };

/** Whether one piece of evidence may explain one failure. */
function explains(item: Inapplicable, failure: ResolutionFailure): boolean {
  if (item.target !== failure.target) return false;
  return EXPLAINABLE[item.reason].includes(failure.kind);
}

/**
 * Whether the evidence accounts for EVERY health failure.
 *
 * A partial explanation is not an explanation. If the composer is empty (so no
 * send control is expected) but the RESPONSE ROOT has also gone missing, the
 * adapter really has lost the page. Requiring the evidence to cover every
 * failed target — and to be permitted for that failure's KIND — is what stops
 * one legitimate inapplicability from silencing an unrelated real failure.
 */
export function explainsEveryFailure(
  failures: readonly ResolutionFailure[],
  evidenceList: readonly Inapplicable[],
): boolean {
  if (failures.length === 0) return false;
  return failures.every((failure) => evidenceList.some((item) => explains(item, failure)));
}

/**
 * How far apart the evidence and the health report may be, in milliseconds.
 *
 * They should be produced in one synchronous pass; anything more means the
 * caller cached one of them, and evidence gathered before a check describes a
 * page that may since have changed. Generous enough to survive a slow layout
 * pass, far too small to survive a cache.
 */
const MAX_EVIDENCE_AGE_MS = 250;

export function surfaceStateFor(
  health: HealthReport,
  evidenceList: readonly Inapplicable[],
): SurfaceState {
  // Branch on the failures, not on `ok`. Nothing in HealthReport constrains
  // the two to agree, and a report that contradicts itself is a report to
  // stop trusting - so a disagreement resolves to DEGRADED rather than to
  // whichever field was consulted first.
  if (health.failures.length === 0) {
    return health.ok ? { kind: 'hidden' } : { kind: 'degraded', failures: [] };
  }

  // Stale evidence describes a page that may no longer exist.
  const fresh = evidenceList.filter(
    (item) =>
      item.observedAt >= health.checkedAt && item.observedAt - health.checkedAt <= MAX_EVIDENCE_AGE_MS,
  );

  if (explainsEveryFailure(health.failures, fresh)) {
    // Carry every item that did explanatory work, not just the first: which
    // evidence justified the silence is the thing a reader needs, and picking
    // by index would report an item that may have explained nothing.
    const used = fresh.filter((item) => health.failures.some((failure) => explains(item, failure)));
    return { kind: 'inactive', evidence: used };
  }
  return { kind: 'degraded', failures: health.failures };
}
