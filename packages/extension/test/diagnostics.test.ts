// @vitest-environment jsdom
/**
 * The diagnostic and its failure forensics.
 *
 * These matter more than they look. The diagnostic is the ONLY thing that
 * makes SPEC's "silent failure must be impossible" requirement checkable by a
 * human, and the forensics are the only thing that distinguishes three
 * failures that print identically: the composer moved, the composer is behind
 * a closed shadow root, or the composer is in a frame we cannot enter.
 *
 * A forensics block that reported the wrong reading would be worse than none —
 * it would send whoever is debugging in a confident wrong direction, which is
 * exactly what happened when a 4x latency anomaly was attributed to power
 * state (ARCHITECTURE.md D27).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { GeminiAdapter } from '../src/adapters/gemini.js';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { InputWitness } from '../src/adapters/binding.js';
import { buildDiagnostic } from '../src/diagnostics.js';
import { giveEverythingLayout, loadFixture, resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

function witness(): InputWitness {
  return new InputWitness(document);
}

describe('diagnostic on a healthy page', () => {
  it('names the winning strategy, tier and ambiguity count, and omits forensics', () => {
    loadFixture('claude/composer');
    const diagnostic = buildDiagnostic(new ClaudeAdapter(document, witness()), document);

    expect(diagnostic.composer.resolved).toBe(true);
    expect(diagnostic.composer.tier).toBe('attribute');
    expect(diagnostic.composer.strategyId).toBe('claude/composer-role-textbox');
    expect(diagnostic.composer.ambiguityCount).toBe(1);
    // Quiet on a healthy page: forensics are for failures.
    expect(diagnostic.forensics).toBeNull();
  });

  it('reports the ambiguity count when two candidates are admitted', () => {
    loadFixture('claude/composer-decoy');
    const diagnostic = buildDiagnostic(new ClaudeAdapter(document, witness()), document);

    expect(diagnostic.composer.resolved).toBe(false);
    expect(diagnostic.composer.failureKind).toBe('ambiguous');
    // The number a person needs in order to know it was a tie, not a miss.
    expect(diagnostic.composer.ambiguityCount).toBe(2);
  });

  it('reports which invariant rejected a candidate', () => {
    loadFixture('claude/composer-hidden-clone');
    const diagnostic = buildDiagnostic(new ClaudeAdapter(document, witness()), document);

    const strategy = diagnostic.composer.strategies.find(
      (s) => s.id === 'claude/composer-role-textbox',
    );
    expect(strategy).toBeDefined();
    expect(strategy?.matched).toBe(2);
    expect(strategy?.admitted).toBe(1);
    // Names the invariant that did the rejecting, so a false block is
    // diagnosable rather than mysterious.
    expect(Object.keys(strategy?.rejectedBy ?? {}).length).toBeGreaterThan(0);
  });
});

describe('failure forensics', () => {
  it('reads a CLOSED shadow root as unreachable, not stale', () => {
    // The Gemini hypothesis. If this reading is wrong, whoever is debugging
    // spends their time rewriting selectors that were never the problem.
    loadFixture('gemini/composer');
    const richTextarea = document.querySelector('rich-textarea');
    const host = document.createElement('closed-host');
    (richTextarea as Element).replaceWith(host);
    host.attachShadow({ mode: 'closed' }).append(richTextarea as Element);
    giveEverythingLayout();
    // A closed host renders but exposes nothing; give it a box explicitly.
    Object.defineProperty(host, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 640, height: 48, top: 0, left: 0, right: 640, bottom: 48, x: 0, y: 0 }),
    });

    const diagnostic = buildDiagnostic(new GeminiAdapter(document, witness()), document);
    expect(diagnostic.composer.resolved).toBe(false);
    expect(diagnostic.forensics).not.toBeNull();
    const f = diagnostic.forensics;
    if (f === null) return;

    expect(f.likelyClosedShadowHosts).toContain('closed-host');
    // No editable surface reachable anywhere.
    expect(f.probes['[contenteditable]']?.deep).toBe(0);
    expect(f.probes['textarea']?.deep).toBe(0);
  });

  it('distinguishes an OPEN shadow root, where the composer IS reachable', () => {
    loadFixture('gemini/composer');
    const richTextarea = document.querySelector('rich-textarea');
    const host = document.createElement('open-host');
    (richTextarea as Element).replaceWith(host);
    host.attachShadow({ mode: 'open' }).append(richTextarea as Element);
    giveEverythingLayout();

    const diagnostic = buildDiagnostic(new GeminiAdapter(document, witness()), document);
    const f = diagnostic.forensics;

    // Resolved through the shadow boundary, so no forensics are emitted.
    expect(diagnostic.composer.resolved).toBe(true);
    expect(f).toBeNull();
  });

  it('reads reachable-but-unmatched as STALE SELECTORS, not unreachable', () => {
    // The other direction, and the one that must not be mislabelled: an
    // editable surface exists in plain light DOM, but no strategy matched it.
    // Reporting "unreachable" here would send the fix in the wrong direction.
    resetDocument();
    document.body.innerHTML =
      '<main><div>lorem</div></main><div class="new-markup"><textarea></textarea></div>';
    giveEverythingLayout();

    const diagnostic = buildDiagnostic(new GeminiAdapter(document, witness()), document);
    expect(diagnostic.composer.resolved).toBe(false);
    const f = diagnostic.forensics;
    if (f === null) throw new Error('expected forensics');

    expect(f.likelyClosedShadowHosts).toHaveLength(0);
    expect(f.probes['textarea']?.deep).toBe(1);
  });

  it('counts frames the content script cannot enter', () => {
    // all_frames is false in the manifest, so a composer inside a frame is
    // invisible to us however good the selectors are.
    resetDocument();
    document.body.innerHTML = '<main><div>lorem</div></main><iframe></iframe><iframe></iframe>';
    giveEverythingLayout();

    const diagnostic = buildDiagnostic(new GeminiAdapter(document, witness()), document);
    expect(diagnostic.forensics?.iframes).toBe(2);
  });

  it('stamps every reading with timing and paint state', () => {
    // Without these, a "matched 0" from an un-painted SPA shell is
    // indistinguishable from a stale selector - which is exactly the ambiguity
    // that made the first live Gemini reading untrustworthy.
    resetDocument();
    document.body.innerHTML = '<main><div>lorem</div></main>';
    giveEverythingLayout();

    const f = buildDiagnostic(new GeminiAdapter(document, witness()), document).forensics;
    if (f === null) throw new Error('expected forensics');

    expect(typeof f.readyState).toBe('string');
    expect(f.domElementCount).toBeGreaterThan(0);
    expect(f.attempt).toBeGreaterThan(0);
  });

  it('describes each editable surface so a hidden field is not mistaken for the composer', () => {
    // A hidden form field and a real composer both count as 1 in the probe
    // table. This is what tells them apart.
    resetDocument();
    document.body.innerHTML =
      '<main><div>lorem</div></main>' +
      '<textarea id="real" aria-label="prompt"></textarea>' +
      '<div hidden><textarea id="hidden-field"></textarea></div>' +
      '<textarea id="disabled-field" disabled></textarea>';
    giveEverythingLayout();

    const f = buildDiagnostic(new GeminiAdapter(document, witness()), document).forensics;
    if (f === null) throw new Error('expected forensics');

    expect(f.editableCandidates).toHaveLength(3);
    const usable = f.editableCandidates.filter((c) => c.visible && c.editable);
    expect(usable).toHaveLength(1);

    const disabled = f.editableCandidates.find((c) => c.disabled);
    expect(disabled).toBeDefined();
    expect(disabled?.editable).toBe(false);

    // Attribute NAMES only - a value could carry user content.
    const real = f.editableCandidates.find((c) => c.attributes.includes('aria-label'));
    expect(real).toBeDefined();
    expect(real?.attributes).toContain('id');
    expect(JSON.stringify(f.editableCandidates)).not.toContain('prompt');
  });

  it('counts role="button" controls, not only <button> elements', () => {
    // "0 buttons on a page with a visible send control" must distinguish
    // "not painted" from "the controls are not <button>".
    resetDocument();
    document.body.innerHTML =
      '<main><div>lorem</div></main><div role="button">send</div><textarea></textarea>';
    giveEverythingLayout();

    const f = buildDiagnostic(new GeminiAdapter(document, witness()), document).forensics;
    if (f === null) throw new Error('expected forensics');

    expect(f.probes['button']?.deep).toBe(0);
    expect(f.probes['[role="button"]']?.deep).toBe(1);
  });

  it('never includes page text', () => {
    // The report is designed to be pasted into a bug report by someone with no
    // way to audit it first, so this is a safety property, not tidiness.
    resetDocument();
    document.body.innerHTML =
      '<main><p>my card is 4111 1111 1111 1111 and my email is a@b.com</p></main>' +
      '<textarea>secret draft text</textarea>';
    giveEverythingLayout();

    const diagnostic = buildDiagnostic(new GeminiAdapter(document, witness()), document);
    const serialised = JSON.stringify(diagnostic);
    expect(serialised).not.toContain('4111');
    expect(serialised).not.toContain('a@b.com');
    expect(serialised).not.toContain('secret draft');
  });
});
