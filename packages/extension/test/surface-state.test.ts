// @vitest-environment jsdom
/**
 * The "cannot find" versus "not applicable" distinction, and its safety
 * constraint.
 *
 * The constraint is the whole risk in this change: INACTIVE must be reachable
 * only from positive evidence that an element is absent BY DESIGN. If a bare
 * `not-found` could reach it, a missing composer would masquerade as an
 * inapplicable one and the extension would go quiet exactly when it had lost
 * track of the page — undoing fail-closed.
 *
 * So these tests pin the refusals at least as hard as the successes, and each
 * of the four ways adversarial review found to reach INACTIVE without having
 * observed anything has a test of its own below.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  composerTemporarilyDisabled,
  explainsEveryFailure,
  sendControlNotExpected,
  surfaceStateFor,
} from '../src/ui/surfaceState.js';
import type { Inapplicable } from '../src/ui/surfaceState.js';
import type { HealthReport, ResolutionFailure } from '../src/adapters/index.js';
import { resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

function failure(
  target: string,
  kind: ResolutionFailure['kind'] = 'not-found',
  rejectedCandidate?: Element,
): ResolutionFailure {
  const base = { kind, target, detail: 'x', triedStrategies: [] };
  return rejectedCandidate === undefined ? base : { ...base, rejectedCandidate };
}

/**
 * `checkedAt` defaults to now, because the evidence and the health report must
 * come from the same synchronous pass and the freshness check enforces it. A
 * fixed `0` here would make every test's evidence stale and every assertion
 * pass for the wrong reason.
 */
function health(failures: ResolutionFailure[], checkedAt = Date.now()): HealthReport {
  return { ok: failures.length === 0, failures, warnings: [], checkedAt };
}

/** The composer's text, read from the element, as production does. */
const readsEmpty = (): string => '';
const readsText = (): string => 'hello';

function connected(tag: string): HTMLElement {
  const element = document.createElement(tag);
  document.body.append(element);
  return element;
}

describe('evidence requires a live element', () => {
  it('refuses to call a MISSING composer "empty"', () => {
    // The central refusal. A composer that could not be resolved is a
    // not-found, and not-found must never become "not applicable".
    expect(sendControlNotExpected(null, readsEmpty)).toBeNull();
    expect(composerTemporarilyDisabled(failure('composer'))).toBeNull();
  });

  it('refuses a DETACHED composer, which is a stale handle rather than a state', () => {
    const composer = document.createElement('textarea');
    // Never appended: not connected.
    expect(sendControlNotExpected(composer, readsEmpty)).toBeNull();
    expect(composerTemporarilyDisabled(failure('composer', 'invariant', composer))).toBeNull();
  });

  it('accepts a connected, empty composer as evidence the send control is absent by design', () => {
    const found = sendControlNotExpected(connected('div'), readsEmpty);
    expect(found).not.toBeNull();
    expect(found?.target).toBe('send-button');
    expect(found?.reason).toBe('composer-empty');
  });

  it('refuses when the composer has text, because a send control IS then expected', () => {
    expect(sendControlNotExpected(connected('div'), readsText)).toBeNull();
  });

  it('READS the text rather than accepting it', () => {
    // Review finding 1: the predicate used to be asserted by the caller. The
    // observer verified the element and then trusted a separate `text`
    // argument with no established relationship to it, so a caller passing a
    // live composer and an empty string produced evidence about a composer
    // that actually had text. The reader is now called WITH the element, which
    // is what binds the condition to the thing observed.
    const composer = connected('div');
    let seen: HTMLElement | null = null;
    sendControlNotExpected(composer, (element) => {
      seen = element;
      return '';
    });
    expect(seen).toBe(composer);
  });

  it('accepts a disabled composer and refuses an enabled one', () => {
    const enabled = connected('textarea');
    expect(composerTemporarilyDisabled(failure('composer', 'invariant', enabled))).toBeNull();

    const disabled = connected('textarea') as HTMLTextAreaElement;
    disabled.disabled = true;
    expect(composerTemporarilyDisabled(failure('composer', 'invariant', disabled))?.reason).toBe(
      'composer-disabled',
    );

    const readonly = connected('textarea') as HTMLTextAreaElement;
    readonly.readOnly = true;
    expect(composerTemporarilyDisabled(failure('composer', 'invariant', readonly))).not.toBeNull();

    const ariaDisabled = connected('div');
    ariaDisabled.setAttribute('aria-disabled', 'true');
    expect(
      composerTemporarilyDisabled(failure('composer', 'invariant', ariaDisabled)),
    ).not.toBeNull();
  });

  it('is bound to the element the FAILURE was about, not one supplied alongside it', () => {
    // Review finding 2: the observer used to take a loose element, so it could
    // describe a different node than the one that failed — evidence about
    // something else entirely. It now reads `rejectedCandidate` off the
    // failure, and a failure carrying no candidate has nothing to observe.
    const disabled = connected('textarea') as HTMLTextAreaElement;
    disabled.disabled = true;
    expect(composerTemporarilyDisabled(failure('composer', 'invariant'))).toBeNull();
    expect(composerTemporarilyDisabled(failure('composer', 'invariant', disabled))).not.toBeNull();
  });

  it('refuses a not-found composer even when a disabled one is on the page', () => {
    // The shape that matters: the composer we lost is not the composer we can
    // see. `not-found` carries no candidate, so there is no path from it here.
    const decoy = connected('textarea') as HTMLTextAreaElement;
    decoy.disabled = true;
    expect(composerTemporarilyDisabled(failure('composer', 'not-found'))).toBeNull();
  });
});

describe('evidence may only explain the failure KINDS it is about', () => {
  it('does not let "no send control is rendered" explain an AMBIGUOUS send control', () => {
    // Review finding 3: coverage used to be decided on the target alone, so
    // this evidence would have explained a failure it flatly contradicts —
    // two send controls were found, so they plainly exist. Silencing that
    // would silence the ambiguity the whole adapter layer exists to make loud.
    const evidence = sendControlNotExpected(connected('div'), readsEmpty) as Inapplicable;
    const at = evidence.observedAt;
    expect(surfaceStateFor(health([failure('send-button', 'ambiguous')], at), [evidence]).kind).toBe(
      'degraded',
    );
    expect(surfaceStateFor(health([failure('send-button', 'not-found')], at), [evidence]).kind).toBe(
      'inactive',
    );
  });

  it('does not let "the composer is disabled" explain a MISSING composer', () => {
    const disabled = connected('textarea') as HTMLTextAreaElement;
    disabled.disabled = true;
    const evidence = composerTemporarilyDisabled(
      failure('composer', 'invariant', disabled),
    ) as Inapplicable;
    const at = evidence.observedAt;
    expect(surfaceStateFor(health([failure('composer', 'not-found')], at), [evidence]).kind).toBe(
      'degraded',
    );
    expect(surfaceStateFor(health([failure('composer', 'invariant')], at), [evidence]).kind).toBe(
      'inactive',
    );
  });
});

describe('evidence must be contemporaneous with the check it explains', () => {
  it('rejects evidence observed long before the health check', () => {
    // Review finding 4: nothing related the two in time, so evidence gathered
    // at page load could explain a failure detected minutes later — about a
    // page that has since changed completely.
    const evidence = sendControlNotExpected(connected('div'), readsEmpty) as Inapplicable;
    const muchLater = evidence.observedAt + 5000;
    expect(surfaceStateFor(health([failure('send-button')], muchLater), [evidence]).kind).toBe(
      'degraded',
    );
  });

  it('rejects evidence observed AFTER the check, which cannot have informed it', () => {
    const evidence = sendControlNotExpected(connected('div'), readsEmpty) as Inapplicable;
    const afterwards = evidence.observedAt + 1;
    expect(surfaceStateFor(health([failure('send-button')], afterwards), [evidence]).kind).toBe(
      'degraded',
    );
  });

  it('accepts evidence from the same pass', () => {
    const evidence = sendControlNotExpected(connected('div'), readsEmpty) as Inapplicable;
    expect(surfaceStateFor(health([failure('send-button')], evidence.observedAt), [evidence]).kind).toBe(
      'inactive',
    );
  });
});

describe('a partial explanation is not an explanation', () => {
  it('stays DEGRADED when evidence covers only some failures', () => {
    // The composer being empty explains a missing send control. It explains
    // nothing about a missing response root, and one legitimate
    // inapplicability must not silence an unrelated real failure.
    const evidence = sendControlNotExpected(connected('div'), readsEmpty) as Inapplicable;
    const state = surfaceStateFor(
      health([failure('send-button'), failure('response-root')], evidence.observedAt),
      [evidence],
    );
    expect(state.kind).toBe('degraded');
  });

  it('goes INACTIVE only when every failure is accounted for', () => {
    const evidence = sendControlNotExpected(connected('div'), readsEmpty) as Inapplicable;
    const state = surfaceStateFor(health([failure('send-button')], evidence.observedAt), [evidence]);
    expect(state.kind).toBe('inactive');
  });

  it('carries EVERY item that did explanatory work', () => {
    // Not just the first. Which evidence justified the silence is the thing a
    // reader needs, and indexing would report an item that explained nothing.
    const composer = connected('div');
    const disabled = connected('textarea') as HTMLTextAreaElement;
    disabled.disabled = true;

    const empty = sendControlNotExpected(composer, readsEmpty) as Inapplicable;
    const stopped = composerTemporarilyDisabled(
      failure('composer', 'invariant', disabled),
    ) as Inapplicable;

    const state = surfaceStateFor(
      health([failure('send-button'), failure('composer', 'invariant')], empty.observedAt),
      [empty, stopped],
    );
    expect(state.kind).toBe('inactive');
    if (state.kind !== 'inactive') return;
    expect(state.evidence.map((item) => item.reason).sort()).toEqual([
      'composer-disabled',
      'composer-empty',
    ]);
  });

  it('treats an empty failure list as unexplainable rather than explained', () => {
    // Vacuous truth would make `every` return true over no failures and
    // report INACTIVE for a healthy page.
    expect(explainsEveryFailure([], [])).toBe(false);
  });

  it('is HIDDEN when health is ok, regardless of evidence', () => {
    expect(surfaceStateFor(health([]), []).kind).toBe('hidden');
  });

  it('is DEGRADED when there is no evidence at all', () => {
    // The default. Nothing was observed to be deliberately absent, so the
    // failure is a failure.
    expect(surfaceStateFor(health([failure('composer')]), []).kind).toBe('degraded');
  });

  it('is DEGRADED when the report contradicts itself', () => {
    // Nothing in HealthReport constrains `ok` and `failures` to agree. A
    // report saying not-ok while listing no failures is a report to stop
    // trusting, and it resolves to the safe state rather than to whichever
    // field happens to be consulted first.
    const contradictory: HealthReport = {
      ok: false,
      failures: [],
      warnings: [],
      checkedAt: Date.now(),
    };
    expect(surfaceStateFor(contradictory, []).kind).toBe('degraded');
  });
});

describe('evidence cannot be forged', () => {
  it('the branded type has no structural escape hatch', () => {
    // A compile-time assertion, not a runtime one. The fields are taken from
    // REAL evidence so each has exactly the declared type: the brand is then
    // the only thing the literal is missing, and the @ts-expect-error below
    // can only be satisfied by the brand. Written the obvious way — with
    // literal field values — the assignment failed because `reason` widened to
    // `string`, so the test passed just as well with the brand removed.
    const real = sendControlNotExpected(connected('div'), readsEmpty) as Inapplicable;
    const forged: {
      target: string;
      reason: typeof real.reason;
      detail: string;
      observedAt: number;
    } = {
      target: real.target,
      reason: real.reason,
      detail: real.detail,
      observedAt: real.observedAt,
    };
    // @ts-expect-error - a plain object is not Inapplicable: the brand is required.
    const asEvidence: Inapplicable = forged;
    expect(asEvidence).toBeDefined();
  });
});
