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
 * Blocking in those states guards an action that is already impossible: a
 * disabled composer cannot send, and a page with no send control cannot send
 * by clicking one. The block buys zero safety and costs the entire
 * user-facing impression.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AND THE SAFETY CONSTRAINT, WHICH IS THE WHOLE RISK IN THIS CHANGE
 *
 * INACTIVE must be entered ONLY on positive evidence that the element is
 * absent BY DESIGN in this state. Never on a bare `not-found`. A missing
 * composer masquerading as an inapplicable one would undo fail-closed
 * entirely — the extension would go quiet exactly when it had lost track of
 * the page.
 *
 * That is enforced by construction rather than by discipline: `Inapplicable`
 * has no public constructor, and the only ways to make one each REQUIRE a
 * live element in hand plus the positive condition. You cannot reach this
 * state from a failure; you can only reach it from a successful observation
 * of something being deliberately unavailable.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { HealthReport, ResolutionFailure } from '../adapters/index.js';

declare const InapplicableBrand: unique symbol;

/**
 * Positive evidence that a target is absent by design.
 *
 * Branded so it cannot be constructed as an object literal. The brand is the
 * mechanism: a caller who wants to report INACTIVE must go through one of the
 * observers below, and each of those can only succeed by looking at a real
 * element.
 */
export interface Inapplicable {
  readonly [InapplicableBrand]: true;
  /** The health failure this evidence explains, e.g. 'send-button'. */
  readonly target: string;
  readonly reason: 'composer-empty' | 'composer-disabled';
  /** Operator-facing, never page text. */
  readonly detail: string;
  readonly observedAt: number;
}

function evidence(
  target: string,
  reason: Inapplicable['reason'],
  detail: string,
): Inapplicable {
  // The brand exists only in the type system - `declare const` emits nothing -
  // so it is asserted here rather than assigned. That is the point: the brand
  // is unforgeable precisely because no caller outside this module can write
  // the property, and this module only reaches this line after a positive
  // observation.
  return { target, reason, detail, observedAt: Date.now() } as unknown as Inapplicable;
}

/**
 * The send control is absent because the composer is empty.
 *
 * Gemini renders no send control until there is something to send. Requires
 * the composer element IN HAND and confirms it is both connected and empty —
 * so a composer that could not be resolved cannot produce this evidence.
 *
 * Returns null when the condition does not hold, which is the caller's signal
 * to fall through to DEGRADED rather than to invent a reason.
 */
export function sendControlNotExpected(
  composer: HTMLElement | null,
  composerText: string,
): Inapplicable | null {
  if (composer === null || !composer.isConnected) return null;
  if (composerText.length > 0) return null;
  return evidence(
    'send-button',
    'composer-empty',
    'The composer is present and empty, and this site renders no send control until there is text to send.',
  );
}

/**
 * The composer is present but not currently editable.
 *
 * ChatGPT disables it while a response streams. Requires the element in hand
 * and confirms it is genuinely disabled or read-only — "I could not find it"
 * cannot reach here, because there would be no element to pass.
 */
export function composerTemporarilyDisabled(composer: HTMLElement | null): Inapplicable | null {
  if (composer === null || !composer.isConnected) return null;
  const asControl = composer as Partial<HTMLTextAreaElement>;
  const disabled =
    asControl.disabled === true ||
    asControl.readOnly === true ||
    composer.getAttribute('aria-disabled') === 'true';
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
  /** Why this was flagged, in the user's words. */
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
  | { readonly kind: 'inactive'; readonly evidence: Inapplicable };

/**
 * Whether the evidence accounts for EVERY health failure.
 *
 * A partial explanation is not an explanation. If the composer is empty (so no
 * send control is expected) but the RESPONSE ROOT has also gone missing, the
 * adapter really has lost the page and the state is degraded. Requiring the
 * evidence to cover every failed target is what stops one legitimate
 * inapplicability from silencing an unrelated real failure.
 */
export function explainsEveryFailure(
  failures: readonly ResolutionFailure[],
  evidenceList: readonly Inapplicable[],
): boolean {
  if (failures.length === 0) return false;
  const explained = new Set(evidenceList.map((e) => e.target));
  return failures.every((failure) => explained.has(failure.target));
}

/**
 * The state the surface should be in.
 *
 * Deliberately takes the evidence as an argument rather than deriving it: the
 * observers above need adapter-specific knowledge (which element, what text),
 * and burying that here would make this function the third place that decides
 * what counts as inapplicable.
 */
export function surfaceStateFor(
  health: HealthReport,
  evidenceList: readonly Inapplicable[],
): SurfaceState {
  if (health.ok) return { kind: 'hidden' };
  if (explainsEveryFailure(health.failures, evidenceList)) {
    // Every failure is accounted for by a deliberate absence.
    const first = evidenceList[0];
    if (first !== undefined) return { kind: 'inactive', evidence: first };
  }
  return { kind: 'degraded', failures: health.failures };
}
