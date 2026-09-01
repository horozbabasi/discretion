/**
 * The send gate: the decisions that stand between a message and the network.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SPEC.md's content-script flow, steps 2-4. Everything here is a REFUSAL
 * unless a positive condition holds, because that is what fail-closed means
 * in the one place it is load-bearing: "Any detection error, timeout, or
 * adapter failure blocks the send. Fail-open is a critical bug, not a
 * degraded mode."
 *
 * The functions live apart from the controller so each is testable against
 * its own counterexamples. The controller sequences them; it decides nothing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE MASKED TEXT IS BUILT FROM WHAT THE PANEL SHOWED
 *
 * `applyMasking` does not re-run the pipeline. It takes the entities the
 * review panel displayed and splices their surrogates into the original text
 * by span.
 *
 * Re-masking would be the obvious implementation and it breaks a property
 * that matters more than the tidiness: WHAT THE USER SAW IS WHAT GETS SENT.
 * A second pipeline run can legitimately differ from the first - Stage 3
 * scoring depends on the whole document, and a re-run after a revert changes
 * the document - so the user would be approving one set of substitutions and
 * sending another. The panel is a consent surface, and consent has to be about
 * the thing that actually happens.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { guardEgress } from '@privacyshield/core';
import type { DetectionStage, Vault } from '@privacyshield/core';

import type { AnalyzedEntity } from './analyze.js';

/**
 * Stages that must have run before a message may be released.
 *
 * This is the null-NER refusal, made enforceable. `stagesRun` is DERIVED from
 * the recognizer argument rather than declared, so requiring `stage2-ner` here
 * is a check the code can actually fail: if the offscreen document is
 * unavailable, or a future edit makes the recognizer optional again, the gate
 * blocks instead of certifying a message it only half-scanned.
 *
 * Stage 2 is in this list for a reason no other stage needs stated: it is the
 * only stage that finds NAMES, and a person's name is the most common
 * sensitive thing in a chat message. A pipeline missing Stage 2 does not
 * degrade gracefully - it silently stops looking for the commonest case.
 */
export const REQUIRED_STAGES: readonly DetectionStage[] = [
  'stage1-validated-identifier',
  'stage2-ner',
  'stage3-context',
  'stage4-fusion',
];

export type GateRefusal =
  /** The pipeline did not run every stage a release requires. */
  | { readonly kind: 'incomplete-scan'; readonly missing: readonly DetectionStage[] }
  /** Masked text still contains a value the user did not choose to keep. */
  | { readonly kind: 'egress-leak'; readonly leakedTypes: readonly string[] }
  /** The write to the composer did not stick. */
  | { readonly kind: 'write-failed'; readonly detail: string }
  /** Identity binding failed: see binding.ts. */
  | { readonly kind: 'binding'; readonly code: string; readonly detail: string };

/**
 * Whether every required stage ran.
 *
 * Returns the MISSING stages rather than a boolean so the refusal can name
 * what was skipped. "Detection did not complete" is not something a user can
 * act on; "the name recogniser is unavailable" is.
 */
export function missingStages(ran: readonly DetectionStage[]): DetectionStage[] {
  return REQUIRED_STAGES.filter((stage) => !ran.includes(stage));
}

export interface MaskingPlan {
  readonly maskedText: string;
  /** Entities whose surrogate was substituted. */
  readonly applied: readonly AnalyzedEntity[];
  /** Entities the user chose to keep in the clear. */
  readonly kept: readonly AnalyzedEntity[];
}

/**
 * Splice surrogates into the original text, honouring the user's reverts.
 *
 * Applied back to front so an earlier substitution cannot shift a later
 * span's offsets. The entities are non-overlapping by construction - Stage 4
 * resolves overlaps before anything reaches the panel - and that is asserted
 * rather than assumed, because a violated assumption here corrupts the message
 * silently.
 */
export function applyMasking(
  original: string,
  entities: readonly AnalyzedEntity[],
  isReverted: (id: string) => boolean,
): MaskingPlan {
  const ordered = [...entities].sort((a, b) => a.originalStart - b.originalStart);
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (previous !== undefined && current !== undefined && current.originalStart < previous.originalEnd) {
      throw new Error('overlapping entities reached the send gate; Stage 4 resolution did not hold');
    }
  }

  const applied: AnalyzedEntity[] = [];
  const kept: AnalyzedEntity[] = [];
  let masked = original;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const entity = ordered[i];
    if (entity === undefined) continue;
    if (isReverted(entity.id)) {
      kept.push(entity);
      continue;
    }
    masked = masked.slice(0, entity.originalStart) + entity.surrogate + masked.slice(entity.originalEnd);
    applied.push(entity);
  }
  return { maskedText: masked, applied: applied.reverse(), kept: kept.reverse() };
}

export interface CertifyResult {
  readonly ok: boolean;
  /** Vault entry ids found in the payload that no revert accounts for. */
  readonly unaccountedLeaks: readonly { readonly entryId: string; readonly type: string }[];
}

/**
 * The last check before release: does the masked text still contain a value
 * the user did not choose to keep?
 *
 * `guardEgress` scans for EVERY original the vault holds, which includes the
 * ones a revert deliberately left in place - so a raw verdict would refuse
 * every message containing a revert. The leaks are therefore RECONCILED
 * against the reverts: a leak the user asked for is intended, and anything
 * else is a masking defect that must not reach the network.
 *
 * That reconciliation is the whole value of running the guard here. A missed
 * span, an off-by-one offset, a surrogate that failed to splice - each shows
 * up as an unaccounted leak, and each would otherwise be invisible until the
 * message had already been sent.
 */
export function certifyForRelease(
  maskedText: string,
  vault: Vault,
  isReverted: (id: string) => boolean,
): CertifyResult {
  const verdict = guardEgress(maskedText, vault.createEgressAuditor());
  const unaccounted = verdict.leaks
    .filter((leak) => !isReverted(leak.entryId))
    .map((leak) => ({ entryId: leak.entryId, type: leak.type }));
  return { ok: unaccounted.length === 0, unaccountedLeaks: unaccounted };
}

/**
 * A one-shot, time-bounded permission for the gate to replay the user's own
 * send action without intercepting it again.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS THE MOST DANGEROUS OBJECT IN THE EXTENSION, so its limits are
 * mechanical rather than a matter of care at the call site.
 *
 * A pass-through that stayed armed would let the NEXT genuine send through
 * unexamined - fail-open, arrived at by way of a convenience. So:
 *
 *   - `consume()` disarms on the first call, whatever it returns.
 *   - It expires on a deadline, so a replay that never dispatches (the site
 *     ignored the synthetic event, the button vanished) cannot leave a token
 *     lying armed for a later send to find.
 *   - It is armed only immediately before a replay the gate itself performs,
 *     and disarmed in a `finally`.
 * ─────────────────────────────────────────────────────────────────────────
 */
export class PassThrough {
  private expiresAt = 0;
  private readonly now: () => number;
  private readonly windowMs: number;

  constructor(windowMs = 2000, now: () => number = Date.now) {
    this.windowMs = windowMs;
    this.now = now;
  }

  arm(): void {
    this.expiresAt = this.now() + this.windowMs;
  }

  disarm(): void {
    this.expiresAt = 0;
  }

  /** True at most once per arming, and never after the window closes. */
  consume(): boolean {
    const live = this.expiresAt > this.now();
    this.expiresAt = 0;
    return live;
  }

  get armed(): boolean {
    return this.expiresAt > this.now();
  }
}
