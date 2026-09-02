/**
 * Quick Redact.
 *
 * The whole point of this file is the refusal. Quick Redact hands the user a
 * string and invites them to paste it into Slack, an email, a ticket — with
 * the extension's assurance behind it and no review panel in between. So
 * under-masking here is worse than at the send gate, not better, and "some
 * masking is better than none" is the reasoning that would ship it.
 */

import { describe, expect, it } from 'vitest';

import { PROFILES } from '@discretion/core';
import type { NerRecognizer, NerSpan } from '@discretion/core';

import { QuickRedactSession } from '../src/popup/quickRedact.js';

/** A recognizer that finds nothing but IS present, so Stage 2 counts as run. */
const silentNer: NerRecognizer = {
  id: 'test-ner',
  warmup: (): Promise<void> => Promise.resolve(),
  recognize: (): Promise<NerSpan[]> => Promise.resolve([]),
};

const options = { ner: silentNer, profile: PROFILES.balanced, mode: 'surrogate' as const };

describe('Quick Redact masks', () => {
  it('replaces a value and does not leave it in the output', async () => {
    const session = new QuickRedactSession();
    const result = await session.mask('Pay GB33BUKB20201555555555 today.', options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.maskedText).not.toContain('GB33BUKB20201555555555');
    expect(result.applied.length).toBeGreaterThan(0);
  });

  it('gives the same value the same surrogate twice in one popup session', async () => {
    // The vault is per session, so a value masked in two separate pastes is
    // recognisably the same value - which is what makes a restored reply
    // readable.
    const session = new QuickRedactSession();
    const first = await session.mask('Pay GB33BUKB20201555555555 now.', options);
    const second = await session.mask('Confirm GB33BUKB20201555555555 please.', options);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.applied[0]?.surrogate).toBe(second.applied[0]?.surrogate);
  });

  it('round-trips through restore', async () => {
    const session = new QuickRedactSession();
    const masked = await session.mask('Write to GB33BUKB20201555555555 about it.', options);
    expect(masked.ok).toBe(true);
    if (!masked.ok) return;
    const restored = session.restore(masked.maskedText);
    expect(restored.text).toContain('GB33BUKB20201555555555');
    expect(restored.count).toBeGreaterThan(0);
  });

  it('treats empty input as nothing to do, not as an error', async () => {
    const session = new QuickRedactSession();
    const result = await session.mask('   ', options);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.maskedText).toBe('');
    expect(result.applied).toEqual([]);
  });
});

describe('Quick Redact refuses rather than under-masks', () => {
  it('REFUSES when Stage 2 did not run', async () => {
    // The failure this guards: with no recognizer, Stage 1 still finds the
    // IBAN, so a partly-masked string would look like a success. It would also
    // be missing every PERSON and ORG the model would have caught, and the
    // user would paste it believing it was clean.
    const session = new QuickRedactSession();
    const result = await session.mask('Pay GB33BUKB20201555555555 today.', {
      ...options,
      ner: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('stages');
    expect(result.detail).toContain('stage2-ner');
  });

  it('names the missing stage rather than saying something went wrong', async () => {
    const session = new QuickRedactSession();
    const result = await session.mask('Pay GB33BUKB20201555555555 today.', {
      ...options,
      ner: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it('does NOT carry an error message that quotes the input', async () => {
    // The realistic shape of the leak: the tokenizer or the ONNX runtime -
    // neither of which this project authors - throwing an error whose message
    // includes the text it choked on. `detail` reaches a DOM node, so an
    // error message copied verbatim would put the value back on screen
    // through the failure path, which is the path nobody inspects.
    const secret = 'GB33BUKB20201555555555';
    const exploding: NerRecognizer = {
      id: 'exploding',
      warmup: () => Promise.resolve(),
      recognize: () => Promise.reject(new Error(`the model died holding: ${secret}`)),
    };
    const session = new QuickRedactSession();
    const result = await session.mask(`Pay ${secret} today.`, { ...options, ner: exploding });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('error');
    expect(result.detail).not.toContain(secret);
    // Still useful: the name distinguishes a timeout from an unavailable
    // model from a bug.
    expect(result.detail).toBe('Error');
  });
});
