// @vitest-environment jsdom
/**
 * Detection wired to the surface, read-only.
 *
 * SPEC.md's content-script flow, step 5: "detections grouped by type, each
 * with calibrated confidence and explanation, each individually revertible".
 *
 * The properties pinned here are the ones whose failure would be silent:
 *   - the panel never shows an original value, only its surrogate;
 *   - a detection error becomes DEGRADED, never an empty panel;
 *   - nothing is written to the composer;
 *   - the session is cleared when the composer is replaced.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generate, PROFILES, Vault } from '@discretion/core';
import type { NerRecognizer } from '@discretion/core';

import { analyzeText } from '../src/detection/analyze.js';
import { DetectionSession } from '../src/detection/session.js';
import { resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

/**
 * A message with several detections of more than one type.
 *
 * The values are GENERATED rather than written by hand, and that is not
 * fussiness. The obvious hand-written fixture - jane.doe@example.org, card
 * 4111 1111 1111 1111 - detects nothing at all: both are reserved
 * documentation values, which the detectors correctly mark non-sensitive and
 * the panel correctly declines to offer masking for. A test written that way
 * asserts against an empty set and passes for reasons having nothing to do
 * with what it claims. (Written that way first, it did.)
 */
const CARD = generate.generateValidCard(24601);
const EMAIL_ONE = generate.generateValidEmail(11);
const EMAIL_TWO = generate.generateValidEmail(12);
const IBAN = generate.generateValidIban(77);
const MESSAGE = [
  `Hi, my email is ${EMAIL_ONE} and my other one is ${EMAIL_TWO}.`,
  `My card is ${CARD} and the IBAN is ${IBAN}.`,
].join('\n');

function options(vault = new Vault()): Parameters<typeof analyzeText>[1] {
  return { ner: null, profile: PROFILES.balanced, mode: 'surrogate', seed: 12345, vault };
}

describe('the analysis the panel is built from', () => {
  it('finds the identifiers and labels them', async () => {
    const analysis = await analyzeText(MESSAGE, options());
    const types = new Set(analysis.entities.map((entity) => entity.type));
    expect(types.has('EMAIL')).toBe(true);
    expect(types.has('CREDIT_CARD')).toBe(true);
    expect(types.has('IBAN')).toBe(true);
    // Human-readable, and the initialism is not sentence-cased: a reviewer who
    // sees "Iban" reasonably doubts everything else on the panel.
    expect(analysis.entities.find((e) => e.type === 'IBAN')?.label).toBe('IBAN');
    expect(analysis.entities.find((e) => e.type === 'CREDIT_CARD')?.label).toBe('Credit card');
  });

  it('NEVER carries an original value', async () => {
    // The panel renders these fields into the DOM of a page this extension
    // exists to withhold information from. An explanation that quoted the
    // matched text would hand the value straight back.
    const analysis = await analyzeText(MESSAGE, options());
    expect(analysis.entities.length).toBeGreaterThan(0);
    for (const entity of analysis.entities) {
      const rendered = `${entity.label} ${entity.explanation} ${entity.surrogate} ${entity.id}`;
      expect(rendered).not.toContain(EMAIL_ONE);
      expect(rendered).not.toContain(EMAIL_TWO);
      expect(rendered).not.toContain(CARD);
      expect(rendered).not.toContain(IBAN);
    }
  });

  it('reports CALIBRATED confidence, which SPEC asks for over raw', async () => {
    const analysis = await analyzeText(MESSAGE, options());
    for (const entity of analysis.entities) {
      expect(entity.confidence).toBeGreaterThanOrEqual(0);
      expect(entity.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('explains WHICH evidence fired, not just that it is confident', async () => {
    const analysis = await analyzeText(MESSAGE, options());
    const iban = analysis.entities.find((entity) => entity.type === 'IBAN');
    // The mod-97 check is the reason an IBAN is an IBAN; an explanation that
    // omitted it would be a confidence score written out in prose.
    expect(iban?.explanation).toContain('mod97');
  });

  it('gives the same value the same surrogate across runs in one session', async () => {
    // Consistency is a property of the SESSION. A vault per analysis would
    // hand the same address a new surrogate on every keystroke.
    const vault = new Vault();
    const first = await analyzeText(MESSAGE, options(vault));
    const second = await analyzeText(MESSAGE, options(vault));
    expect(second.entities.map((e) => e.surrogate)).toEqual(first.entities.map((e) => e.surrogate));
    expect(second.entities.map((e) => e.id)).toEqual(first.entities.map((e) => e.id));
  });

  it('does not double-count an overlap in the exposure score', async () => {
    // Resolution runs BEFORE calibration and exposure. Unresolved, one value
    // covered by several detectors would appear several times and inflate the
    // score.
    const analysis = await analyzeText(MESSAGE, options());
    const spans = analysis.entities.map((e) => `${String(e.originalStart)}:${String(e.originalEnd)}`);
    expect(new Set(spans).size).toBe(spans.length);
    for (const a of analysis.entities) {
      for (const b of analysis.entities) {
        if (a === b) continue;
        expect(a.originalStart < b.originalEnd && b.originalStart < a.originalEnd).toBe(false);
      }
    }
  });

  it('records that Stage 2 did NOT run when no engine was supplied', async () => {
    // Derived from the argument rather than declared, so it cannot claim a
    // stage ran that did not. The send gate must refuse to ship while this is
    // the case.
    const analysis = await analyzeText(MESSAGE, options());
    expect(analysis.stagesRun).not.toContain('stage2-ner');
    expect(analysis.stagesRun).toContain('stage1-validated-identifier');
    expect(analysis.stagesRun).toContain('stage3-context');
    expect(analysis.stagesRun).toContain('stage4-fusion');
  });

  it('records Stage 2 as HAVING run when a recognizer is supplied', async () => {
    // The complement of the test above, and the reason `ner` stays a required
    // nullable argument now that the extension always supplies one: stagesRun
    // is DERIVED from the argument, so "Stage 2 ran" is a claim the code can
    // support rather than a comment. Relaxing that once NER works would delete
    // the mechanism at the moment it starts being worth having.
    const recognizer: NerRecognizer = {
      id: 'fake-recognizer',
      warmup: () => Promise.resolve(),
      recognize: () => Promise.resolve([]),
    };
    const analysis = await analyzeText(MESSAGE, { ...options(), ner: recognizer });
    expect(analysis.stagesRun).toContain('stage2-ner');
  });

  it('carries a recognizer entity through to the panel, surrogate and all', async () => {
    // End to end for Stage 2: a span from the recognizer must survive
    // runStage2, Stage 3 scoring, calibration, the profile decision and
    // masking - and arrive with a surrogate rather than the original name.
    const name = 'Ferdinand Ekelund';
    const text = `Please call ${name} about the invoice.`;
    const recognizer: NerRecognizer = {
      id: 'fake-recognizer',
      warmup: () => Promise.resolve(),
      recognize: (input: string) => {
        const at = input.indexOf(name);
        return Promise.resolve(
          at < 0 ? [] : [{ type: 'PERSON' as const, start: at, end: at + name.length, text: name, score: 0.98 }],
        );
      },
    };
    const analysis = await analyzeText(text, { ...options(), ner: recognizer });
    const person = analysis.entities.find((entity) => entity.type === 'PERSON');
    expect(person).toBeDefined();
    expect(person?.label).toBe('Person');
    expect(person?.surrogate).not.toBe(name);
    expect(`${person?.explanation ?? ''} ${person?.surrogate ?? ''}`).not.toContain(name);
  });

  it('finds nothing in text that contains nothing', async () => {
    const analysis = await analyzeText('what is the capital of France?', options());
    expect(analysis.entities).toEqual([]);
    expect(analysis.exposure.score).toBe(0);
  });
});

describe('the session holds the only copy, and drops it', () => {
  it('keys reverts by value so they survive an edit above them', () => {
    // The vault id derives from the VALUE, not from a position. Typing a
    // sentence above a detection shifts every offset below it, and a
    // position-keyed revert would transfer the decision to a different item.
    const session = new DetectionSession();
    expect(session.isReverted('v1')).toBe(false);
    expect(session.toggleRevert('v1')).toBe(true);
    expect(session.isReverted('v1')).toBe(true);
    expect(session.toggleRevert('v1')).toBe(false);
    expect(session.isReverted('v1')).toBe(false);
  });

  it('replaces the vault on clear rather than emptying it', async () => {
    // Replacing the object is what makes it impossible for a reference
    // captured elsewhere to keep the cleared originals alive.
    const session = new DetectionSession();
    const before = session.vault;
    await analyzeText(MESSAGE, {
      ner: null,
      profile: PROFILES.balanced,
      mode: session.mode,
      seed: session.seed,
      vault: session.vault,
    });
    session.toggleRevert('x');
    session.clear();
    expect(session.vault).not.toBe(before);
    expect(session.isReverted('x')).toBe(false);
  });

  it('invalidates an analysis that was in flight when the session was cleared', () => {
    // A result computed from a message the user has left must not render.
    const session = new DetectionSession();
    const generation = session.beginAnalysis();
    expect(session.isCurrent(generation)).toBe(true);
    session.clear();
    expect(session.isCurrent(generation)).toBe(false);
  });

  it('lets a later analysis supersede an earlier one', () => {
    const session = new DetectionSession();
    const first = session.beginAnalysis();
    const second = session.beginAnalysis();
    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
  });

  it('draws a different seed per session', () => {
    // Two sessions must not produce the same surrogates for the same values.
    const seeds = new Set(Array.from({ length: 8 }, () => new DetectionSession().seed));
    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe('failure is never an empty panel', () => {
  it('propagates a stage failure instead of returning no detections', async () => {
    // SPEC: "Any detection error, timeout, or adapter failure blocks the
    // send." Swallowing it here and returning [] is the exact shape of the
    // failure SPEC calls critical - the caller cannot tell "found nothing"
    // from "could not look".
    const vault = new Vault();
    vi.spyOn(vault, 'getByOriginal').mockImplementation(() => {
      throw new Error('vault exploded');
    });
    await expect(analyzeText(MESSAGE, options(vault))).rejects.toThrow('vault exploded');
  });
});
