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
 * So these tests pin the refusals at least as hard as the successes.
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

function failure(target: string, kind: ResolutionFailure['kind'] = 'not-found'): ResolutionFailure {
  return { kind, target, detail: 'x', triedStrategies: [] };
}

function health(failures: ResolutionFailure[]): HealthReport {
  return { ok: failures.length === 0, failures, warnings: [], checkedAt: 0 };
}

describe('evidence requires a live element', () => {
  it('refuses to call a MISSING composer "empty"', () => {
    // The central refusal. A composer that could not be resolved is a
    // not-found, and not-found must never become "not applicable".
    expect(sendControlNotExpected(null, '')).toBeNull();
    expect(composerTemporarilyDisabled(null)).toBeNull();
  });

  it('refuses a DETACHED composer, which is a stale handle rather than a state', () => {
    const composer = document.createElement('textarea');
    // Never appended: not connected.
    expect(sendControlNotExpected(composer, '')).toBeNull();
    expect(composerTemporarilyDisabled(composer)).toBeNull();
  });

  it('accepts a connected, empty composer as evidence the send control is absent by design', () => {
    const composer = document.createElement('div');
    document.body.append(composer);
    const found = sendControlNotExpected(composer, '');
    expect(found).not.toBeNull();
    expect(found?.target).toBe('send-button');
    expect(found?.reason).toBe('composer-empty');
  });

  it('refuses when the composer has text, because a send control IS then expected', () => {
    const composer = document.createElement('div');
    document.body.append(composer);
    expect(sendControlNotExpected(composer, 'hello')).toBeNull();
  });

  it('accepts a disabled composer and refuses an enabled one', () => {
    const enabled = document.createElement('textarea');
    document.body.append(enabled);
    expect(composerTemporarilyDisabled(enabled)).toBeNull();

    const disabled = document.createElement('textarea');
    disabled.disabled = true;
    document.body.append(disabled);
    expect(composerTemporarilyDisabled(disabled)?.reason).toBe('composer-disabled');

    const readonly = document.createElement('textarea');
    readonly.readOnly = true;
    document.body.append(readonly);
    expect(composerTemporarilyDisabled(readonly)).not.toBeNull();

    const ariaDisabled = document.createElement('div');
    ariaDisabled.setAttribute('aria-disabled', 'true');
    document.body.append(ariaDisabled);
    expect(composerTemporarilyDisabled(ariaDisabled)).not.toBeNull();
  });
});

describe('a partial explanation is not an explanation', () => {
  it('stays DEGRADED when evidence covers only some failures', () => {
    // The composer being empty explains a missing send control. It explains
    // nothing about a missing response root, and one legitimate
    // inapplicability must not silence an unrelated real failure.
    const composer = document.createElement('div');
    document.body.append(composer);
    const evidence = sendControlNotExpected(composer, '') as Inapplicable;

    const state = surfaceStateFor(
      health([failure('send-button'), failure('response-root')]),
      [evidence],
    );
    expect(state.kind).toBe('degraded');
  });

  it('goes INACTIVE only when every failure is accounted for', () => {
    const composer = document.createElement('div');
    document.body.append(composer);
    const evidence = sendControlNotExpected(composer, '') as Inapplicable;

    const state = surfaceStateFor(health([failure('send-button')]), [evidence]);
    expect(state.kind).toBe('inactive');
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
});

describe('evidence cannot be forged', () => {
  it('the branded type has no structural escape hatch', () => {
    // Not a runtime assertion — a compile-time one. If the brand were
    // removable, an object literal would satisfy `Inapplicable` and any
    // caller could declare a failure inapplicable without observing anything.
    // This test documents the intent and fails to compile if the brand goes.
    const forged = { target: 'composer', reason: 'composer-empty', detail: '', observedAt: 0 };
    // @ts-expect-error - a plain object is not Inapplicable: the brand is required.
    const asEvidence: Inapplicable = forged;
    expect(asEvidence).toBeDefined();
  });
});
