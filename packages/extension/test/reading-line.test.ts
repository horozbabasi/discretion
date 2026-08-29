// @vitest-environment jsdom
/**
 * The READING line must only assert what it actually checked.
 *
 * It once announced "visible editable surfaces ARE reachable but no strategy
 * matched one — THE SELECTORS ARE STALE" on a page where the composer had
 * resolved perfectly and only the send control had failed. It had never
 * consulted the resolver; the text fired whenever forensics fired.
 *
 * That is worse than a wrong gate on data, because a summary is a GATE ON
 * ATTENTION. A wrong number can be checked against other numbers. A wrong
 * verdict stops the reader looking, and is likelier to be believed because it
 * reads as the instrument's considered conclusion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeAdapter } from '../src/adapters/claude.js';
import { GeminiAdapter } from '../src/adapters/gemini.js';
import { ChatGptAdapter } from '../src/adapters/chatgpt.js';
import { InputWitness, pickAdapter } from '../src/adapters/index.js';
import { buildDiagnostic } from '../src/diagnostics.js';
import { renderDiagnostic } from '../src/debug.js';
import { giveEverythingLayout, loadFixture, resetDocument } from './dom-helpers.js';

let warnings: string[] = [];
let logs: string[] = [];

beforeEach(() => {
  resetDocument();
  warnings = [];
  logs = [];
  // Debug output is gated on an UNPACKED load, detected by the absence of
  // `update_url` in the manifest Chrome returns. Stubbing the real gate rather
  // than bypassing it keeps the test honest: if that detection breaks, these
  // tests go silent too, which is the correct signal.
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { getManifest: () => ({ name: 'PrivacyShield' }) },
    storage: { local: { get: async () => ({}) } },
  };
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
    warnings.push(a.map(String).join(' '));
  });
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logs.push(a.map(String).join(' '));
  });
  vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined);
  vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined);
  vi.spyOn(console, 'table').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

function witness(): InputWitness {
  return new InputWitness(document);
}

describe('READING line', () => {
  it('does NOT claim stale selectors when the composer RESOLVED', () => {
    // The exact contradiction. Composer resolves; the send control is gone, so
    // health fails and forensics fire. The reading must talk about the send
    // control, never about the composer's selectors.
    loadFixture('gemini/composer');
    document.querySelector('button.send-button')?.remove();
    giveEverythingLayout();

    const adapter = new GeminiAdapter(document, witness());
    const diagnostic = buildDiagnostic(adapter, document);
    expect(diagnostic.composer.resolved).toBe(true);
    expect(diagnostic.health.ok).toBe(false);

    renderDiagnostic(diagnostic);
    const reading = warnings.filter((w) => w.startsWith('READING:'));
    expect(reading).toHaveLength(1);
    expect(reading[0]).toContain('composer RESOLVED');
    expect(reading[0]).not.toContain('SELECTORS ARE STALE');
  });

  it('names the element that actually failed', () => {
    loadFixture('gemini/composer');
    document.querySelector('button.send-button')?.remove();
    giveEverythingLayout();

    renderDiagnostic(buildDiagnostic(new GeminiAdapter(document, witness()), document));
    expect(warnings.some((w) => w.includes('send-button'))).toBe(true);
  });

  it('DOES claim stale selectors when the composer genuinely did not resolve', () => {
    // The other direction: the fix must not make the instrument mute.
    // Markup no Gemini strategy matches: a bare contenteditable with no
    // role/aria-multiline, no rich-textarea, no .ql-editor, and no send control
    // to anchor the structural strategy on.
    resetDocument();
    document.body.innerHTML =
      '<main><div>lorem</div></main><div class="new-markup">' +
      '<div contenteditable="true">x</div>' +
      // A control exists, so the "no controls at all" guard does not fire -
      // but it carries no send marker, so no send strategy matches it either.
      '<button class="unrelated">menu</button></div>';
    giveEverythingLayout();

    const diagnostic = buildDiagnostic(new GeminiAdapter(document, witness()), document);
    expect(diagnostic.composer.resolved).toBe(false);

    renderDiagnostic(diagnostic);
    const reading = warnings.filter((w) => w.startsWith('READING:'));
    expect(reading[0]).toContain('SELECTORS ARE STALE');
  });

  it('reports ambiguity as ambiguity, not as staleness', () => {
    loadFixture('gemini/composer-canvas-decoy');
    const diagnostic = buildDiagnostic(new GeminiAdapter(document, witness()), document);
    expect(diagnostic.composer.failureKind).toBe('ambiguous');

    renderDiagnostic(diagnostic);
    const reading = warnings.filter((w) => w.startsWith('READING:'));
    expect(reading[0]).toContain('AMBIGUOUS');
    expect(reading[0]).not.toContain('SELECTORS ARE STALE');
  });

  it('prints the resolver results the reading is based on', () => {
    // The strategy summary must appear in the same block as the reading, so
    // the claim can be checked where it is made.
    loadFixture('gemini/composer');
    document.querySelector('button.send-button')?.remove();
    giveEverythingLayout();

    renderDiagnostic(buildDiagnostic(new GeminiAdapter(document, witness()), document));
    expect(logs.some((l) => l.includes('resolver results this reading is based on'))).toBe(true);
    expect(logs.some((l) => l.includes('gemini/composer-role-textbox'))).toBe(true);
  });
});

describe('every registered adapter has strategies in the diagnostic', () => {
  // An empty strategy list prints an empty table, which looks like "no table
  // was printed" - and would silently make every reading uncheckable.
  it.each([
    ['https://claude.ai/chat/x', ClaudeAdapter],
    ['https://chatgpt.com/c/x', ChatGptAdapter],
    ['https://gemini.google.com/app/x', GeminiAdapter],
  ])('%s', (url, Adapter) => {
    const adapter = pickAdapter(url, document, witness());
    expect(adapter).not.toBeNull();
    if (adapter === null) return;
    // The table pairs a URL with the adapter it must select. Taking only the
    // URL left the second column asserting nothing, which typechecking the
    // tests surfaced as an arity mismatch.
    expect(adapter).toBeInstanceOf(Adapter);
    const diagnostic = buildDiagnostic(adapter, document);
    expect(diagnostic.composer.strategies.length).toBeGreaterThan(0);
    expect(diagnostic.responseRoot.strategies.length).toBeGreaterThan(0);
  });
});

describe('disabled composer is not selector rot', () => {
  it('reads a found-but-disabled composer as page state', () => {
    // Selector rot cannot produce "matched 1, admitted 0". A candidate that was
    // FOUND and then rejected means the selector still describes something and
    // the element's STATE disqualified it. Rewriting the selector against this
    // reading would break a selector that was working.
    resetDocument();
    document.body.innerHTML =
      '<main><article data-message-author-role="assistant"><p>lorem</p></article></main>' +
      '<form data-type="unified-composer">' +
      '<textarea id="prompt-textarea" disabled></textarea>' +
      '<input type="file">' +
      '<button id="composer-submit-button" data-testid="stop-button">stop</button>' +
      '</form>';
    giveEverythingLayout();

    const diagnostic = buildDiagnostic(new ChatGptAdapter(document, witness()), document);
    expect(diagnostic.composer.resolved).toBe(false);
    expect(diagnostic.composer.failureKind).toBe('invariant');

    const strategy = diagnostic.composer.strategies.find(
      (st) => st.id === 'chatgpt/composer-in-composer-form',
    );
    expect(strategy?.matched).toBe(1);
    expect(strategy?.admitted).toBe(0);
    expect(strategy?.rejectedBy['editable']).toBe(1);

    renderDiagnostic(diagnostic);
    const reading = warnings.filter((w) => w.startsWith('READING:'));
    expect(reading[0]).toContain('PAGE STATE, NOT');
    expect(reading[0]).not.toContain('STALE');
  });

  it('still reads a genuinely absent composer as rot', () => {
    // The fix must not turn every failure into "page state".
    resetDocument();
    document.body.innerHTML =
      '<main><article data-message-author-role="assistant"><p>lorem</p></article></main>' +
      '<div class="renamed"><div contenteditable="true">x</div>' +
      '<button class="unrelated">menu</button></div>';
    giveEverythingLayout();

    const diagnostic = buildDiagnostic(new ChatGptAdapter(document, witness()), document);
    expect(diagnostic.composer.failureKind).toBe('not-found');

    renderDiagnostic(diagnostic);
    const reading = warnings.filter((w) => w.startsWith('READING:'));
    expect(reading[0]).toContain('STALE');
  });
});
