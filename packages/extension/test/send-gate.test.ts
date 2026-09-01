// @vitest-environment jsdom
/**
 * The send gate's decisions.
 *
 * SPEC.md: "Any detection error, timeout, or adapter failure blocks the send.
 * Fail-open is a critical bug, not a degraded mode."
 *
 * Every test here is about a REFUSAL, because a gate that lets the right
 * messages through and also lets the wrong ones through is not a gate. The
 * successes are pinned too, but they are the cheap half: a gate that refused
 * everything would pass a suite that only tested refusals, and would also be
 * useless.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { generate, Vault } from '@privacyshield/core';
import type { DetectionStage } from '@privacyshield/core';

import type { AnalyzedEntity } from '../src/detection/analyze.js';
import {
  applyMasking,
  certifyForRelease,
  missingStages,
  PassThrough,
  REQUIRED_STAGES,
} from '../src/detection/sendGate.js';
import { resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

function entity(over: Partial<AnalyzedEntity> & Pick<AnalyzedEntity, 'id' | 'originalStart' | 'originalEnd' | 'surrogate'>): AnalyzedEntity {
  return {
    type: 'EMAIL',
    label: 'Email',
    confidence: 0.9,
    explanation: 'passed a check.',
    ...over,
  };
}

describe('a scan missing a stage is not a scan', () => {
  it('names Stage 2 as missing when the recognizer did not run', () => {
    // The null-NER refusal, made enforceable. `stagesRun` is DERIVED from the
    // recognizer argument, so this is a fact about what ran rather than a
    // claim about what was configured.
    const ran: DetectionStage[] = ['stage1-validated-identifier', 'stage3-context', 'stage4-fusion'];
    expect(missingStages(ran)).toEqual(['stage2-ner']);
  });

  it('requires Stage 2, which is the one that finds names', () => {
    // Stated as its own test because it is the requirement most likely to be
    // relaxed for convenience later: it is the only stage that needs a 280 MB
    // model in another document to be reachable.
    expect(REQUIRED_STAGES).toContain('stage2-ner');
  });

  it('is satisfied only by a complete run', () => {
    expect(missingStages(REQUIRED_STAGES)).toEqual([]);
    expect(missingStages([])).toEqual([...REQUIRED_STAGES]);
  });
});

describe('masking applies what the panel showed', () => {
  it('substitutes surrogates by span, back to front', () => {
    const text = 'mail a@b.co then c@d.co';
    const plan = applyMasking(
      text,
      [
        entity({ id: '1', originalStart: 5, originalEnd: 11, surrogate: 'X@X.xx' }),
        entity({ id: '2', originalStart: 17, originalEnd: 23, surrogate: 'YYYY@YY.yyy' }),
      ],
      () => false,
    );
    expect(plan.maskedText).toBe('mail X@X.xx then YYYY@YY.yyy');
    expect(plan.applied).toHaveLength(2);
    expect(plan.kept).toHaveLength(0);
  });

  it('applies a LATER, LONGER surrogate without corrupting an earlier span', () => {
    // Front-to-back substitution shifts every subsequent offset by the length
    // difference. This is the case that catches it: the second surrogate is
    // longer than what it replaces, so a forward pass would splice the third
    // one into the middle of it.
    const text = 'a@b.co c@d.co e@f.co';
    const plan = applyMasking(
      text,
      [
        entity({ id: '1', originalStart: 0, originalEnd: 6, surrogate: 'ONE' }),
        entity({ id: '2', originalStart: 7, originalEnd: 13, surrogate: 'TWO-IS-MUCH-LONGER' }),
        entity({ id: '3', originalStart: 14, originalEnd: 20, surrogate: 'THREE' }),
      ],
      () => false,
    );
    expect(plan.maskedText).toBe('ONE TWO-IS-MUCH-LONGER THREE');
  });

  it('leaves a reverted value exactly where it was', () => {
    const text = 'mail a@b.co then c@d.co';
    const plan = applyMasking(
      text,
      [
        entity({ id: '1', originalStart: 5, originalEnd: 11, surrogate: 'X@X.xx' }),
        entity({ id: '2', originalStart: 17, originalEnd: 23, surrogate: 'Y@Y.yy' }),
      ],
      (id) => id === '2',
    );
    expect(plan.maskedText).toBe('mail X@X.xx then c@d.co');
    expect(plan.applied.map((e) => e.id)).toEqual(['1']);
    expect(plan.kept.map((e) => e.id)).toEqual(['2']);
  });

  it('THROWS on overlapping entities rather than corrupting the message', () => {
    // Stage 4 resolves overlaps before anything reaches the panel. If that
    // ever stops holding, splicing two overlapping spans produces a message
    // that is neither the original nor the masked one - silently.
    expect(() =>
      applyMasking(
        'aaaaaaaaaa',
        [
          entity({ id: '1', originalStart: 0, originalEnd: 6, surrogate: 'X' }),
          entity({ id: '2', originalStart: 4, originalEnd: 9, surrogate: 'Y' }),
        ],
        () => false,
      ),
    ).toThrow(/overlapping/u);
  });

  it('is a no-op when everything is reverted', () => {
    const text = 'mail a@b.co';
    const plan = applyMasking(
      text,
      [entity({ id: '1', originalStart: 5, originalEnd: 11, surrogate: 'X@X.xx' })],
      () => true,
    );
    expect(plan.maskedText).toBe(text);
    expect(plan.applied).toHaveLength(0);
  });
});

describe('certification is the last look before the network', () => {
  function vaultWith(original: string): { vault: Vault; id: string } {
    const vault = new Vault();
    const entry = vault.register({ type: 'EMAIL', original, replacement: 'SUR@ROGATE.xx' });
    return { vault, id: entry.id };
  }

  it('passes text the masking actually cleaned', () => {
    const { vault } = vaultWith(generate.generateValidEmail(3));
    expect(certifyForRelease('nothing sensitive here', vault, () => false).ok).toBe(true);
  });

  it('REFUSES text still carrying a value nobody chose to keep', () => {
    // A missed span, an off-by-one offset, a surrogate that failed to splice -
    // each shows up here, and each would otherwise be invisible until after
    // the message had been sent.
    const secret = generate.generateValidEmail(4);
    const { vault } = vaultWith(secret);
    const verdict = certifyForRelease(`please email ${secret}`, vault, () => false);
    expect(verdict.ok).toBe(false);
    expect(verdict.unaccountedLeaks.map((l) => l.type)).toContain('EMAIL');
  });

  it('accepts a value the user explicitly reverted', () => {
    // The guard scans for EVERY original the vault holds, including the ones a
    // revert deliberately left in place. Without reconciliation the gate would
    // refuse every message containing a revert - which is to say, it would
    // make the revert control a lie.
    const secret = generate.generateValidEmail(5);
    const { vault, id } = vaultWith(secret);
    const verdict = certifyForRelease(`please email ${secret}`, vault, (candidate) => candidate === id);
    expect(verdict.ok).toBe(true);
  });

  it('still refuses a DIFFERENT value when one revert is present', () => {
    // The reconciliation must be per-entry. A single revert must not excuse
    // every leak in the message.
    const kept = generate.generateValidEmail(6);
    const leaked = generate.generateValidEmail(7);
    const vault = new Vault();
    const keptEntry = vault.register({ type: 'EMAIL', original: kept, replacement: 'A@A.aa' });
    vault.register({ type: 'EMAIL', original: leaked, replacement: 'B@B.bb' });

    const verdict = certifyForRelease(
      `${kept} and ${leaked}`,
      vault,
      (candidate) => candidate === keptEntry.id,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.unaccountedLeaks).toHaveLength(1);
  });
});

describe('the pass-through token cannot be left armed', () => {
  it('is consumed by the first read', () => {
    const token = new PassThrough();
    token.arm();
    expect(token.consume()).toBe(true);
    // A second event must NOT ride the same token: that is the fail-open this
    // object exists to make impossible.
    expect(token.consume()).toBe(false);
  });

  it('expires, so a replay that never dispatches leaves nothing behind', () => {
    let now = 1000;
    const token = new PassThrough(2000, () => now);
    token.arm();
    now += 2001;
    expect(token.armed).toBe(false);
    expect(token.consume()).toBe(false);
  });

  it('is disarmed explicitly', () => {
    const token = new PassThrough();
    token.arm();
    token.disarm();
    expect(token.consume()).toBe(false);
  });

  it('is not armed before anything arms it', () => {
    expect(new PassThrough().consume()).toBe(false);
  });
});
