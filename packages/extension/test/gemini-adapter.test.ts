// @vitest-environment jsdom
/**
 * Gemini adapter, against committed fixtures.
 *
 * SPEC.md: "Adapter tests against committed HTML fixture snapshots; never
 * against live sites."
 *
 * The cases that earn their place here are the shadow-DOM ones and the
 * localisation one. Shadow roots are what make Gemini different from the other
 * two sites; localisation is what makes an adapter pass every test on a
 * developer's English machine and fail for most of its users.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { GeminiAdapter } from '../src/adapters/gemini.js';
import { InputWitness, verifyBinding } from '../src/adapters/binding.js';
import { deepQueryAll } from '../src/adapters/deep.js';
import type { SubmitIntent } from '../src/adapters/types.js';
import {
  giveEverythingLayout,
  loadFixture,
  moveIntoShadowRoot,
  resetDocument,
  witnessTyping,
} from './dom-helpers.js';

function makeAdapter(): { adapter: GeminiAdapter; witness: InputWitness } {
  const witness = new InputWitness(document);
  witness.start();
  return { adapter: new GeminiAdapter(document, witness), witness };
}

beforeEach(resetDocument);

describe('composer resolution in light DOM', () => {
  it('resolves at the strongest tier on the happy path', () => {
    loadFixture('gemini/composer');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.tier).toBe('attribute');

    const health = adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.warnings).toHaveLength(0);
  });

  it('REFUSES TO GUESS between the composer and an open Canvas editor', () => {
    // Both are real editors the user really types into. No property of either
    // says which one the send button submits.
    loadFixture('gemini/composer-canvas-decoy');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.kind).toBe('ambiguous');
  });

  it('does NOT block when an inert clone shares the composer region', () => {
    loadFixture('gemini/composer-region-clone');
    const { adapter, witness } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    witnessTyping(resolved.value.node);

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    document
      .querySelector<HTMLElement>('button.send-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    const intent = captured as unknown as SubmitIntent;
    expect(intent).not.toBeNull();
    expect(intent.originComposer).toBe(resolved.value.node);
    expect(verifyBinding(resolved.value, intent, witness).ok).toBe(true);
  });
});

describe('shadow DOM', () => {
  it('finds a composer that document.querySelectorAll cannot see', () => {
    // The whole reason deepQueryAll exists. Without it the composer is
    // invisible to the adapter while plainly on screen, and the extension
    // reports not-found and blocks a healthy page.
    loadFixture('gemini/composer');
    const richTextarea = document.querySelector('rich-textarea');
    expect(richTextarea).not.toBeNull();
    moveIntoShadowRoot(richTextarea as Element);

    // Precondition: a plain document query really is blind to it now.
    expect(document.querySelectorAll('[contenteditable][role="textbox"]')).toHaveLength(0);
    expect(deepQueryAll(document, '[contenteditable][role="textbox"]')).toHaveLength(1);

    const { adapter } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.tier).toBe('attribute');
  });

  it('still refuses to guess across a shadow boundary', () => {
    // Piercing shadow roots widens what a strategy can see, and widening a
    // search is normally how you acquire a decoy. It must not weaken the
    // ambiguity rule: one valid candidate in light DOM and one inside a shadow
    // root are still two candidates.
    loadFixture('gemini/composer-canvas-decoy');
    const canvas = document.querySelector('.canvas-panel');
    expect(canvas).not.toBeNull();
    moveIntoShadowRoot(canvas as Element);

    const { adapter } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.kind).toBe('ambiguous');
  });

  it('reports not-found — loudly — for a CLOSED shadow root', () => {
    // There is no supported way in. The correct behaviour is to fail visibly
    // and block, never to resolve some other element because the real one was
    // invisible to the query.
    loadFixture('gemini/composer');
    const richTextarea = document.querySelector('rich-textarea');
    expect(richTextarea).not.toBeNull();
    const host = document.createElement('div');
    (richTextarea as Element).replaceWith(host);
    const closed = host.attachShadow({ mode: 'closed' });
    closed.append(richTextarea as Element);
    giveEverythingLayout();

    const { adapter } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.kind).toBe('not-found');
    expect(adapter.healthCheck().ok).toBe(false);
  });

  it('binds a send button that lives inside a shadow root', () => {
    // closestAcrossShadow exists for this: Element.closest stops at a shadow
    // boundary, so the button would appear to have no composer region and
    // every pointer send would be reported undecidable.
    loadFixture('gemini/composer');
    const { adapter } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    witnessTyping(resolved.value.node);

    const button = document.querySelector('button.send-button');
    expect(button).not.toBeNull();
    const shadow = moveIntoShadowRoot(button as Element);
    const shadowButton = shadow.querySelector<HTMLElement>('button.send-button');
    expect(shadowButton).not.toBeNull();

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    shadowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    const intent = captured as unknown as SubmitIntent;
    expect(intent).not.toBeNull();
    expect(intent.originComposer).toBe(resolved.value.node);
  });
});

describe('localisation', () => {
  it('resolves on an Arabic RTL page with the send button first in its row', () => {
    // If any strategy depended on English text or on English DOM ordering,
    // this is where it breaks. Without this fixture the suite would pass
    // identically either way.
    loadFixture('gemini/composer-localised');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.tier).toBe('attribute');

    const health = adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.warnings).toHaveLength(0);
  });

  it('WARNS when the send control matches only by its English label', () => {
    // The adapter still works here — but only in English. On a non-English UI
    // in this same state nothing would match and pointer sends would be
    // undecidable. A silent pass is the defect this pins.
    loadFixture('gemini/composer-english-label-only');
    const { adapter } = makeAdapter();

    const health = adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.warnings.map((w) => w.target)).toContain('send-button');
    expect(health.warnings.some((w) => w.detail.includes('non-English'))).toBe(true);
  });
});

describe('conversation id', () => {
  it('reads a plain app path', () => {
    loadFixture('gemini/composer');
    const { adapter } = makeAdapter();
    window.history.replaceState({}, '', '/app/c_1a2b3c4d5e6f');
    expect(adapter.getConversationId()).toBe('c_1a2b3c4d5e6f');
  });

  it('reads a path behind Google multi-account routing', () => {
    // Without the /u/<n> prefix, every conversation in any account but the
    // first reports a null id.
    loadFixture('gemini/composer');
    const { adapter } = makeAdapter();
    window.history.replaceState({}, '', '/u/2/app/1a2b3c4d5e6f');
    expect(adapter.getConversationId()).toBe('1a2b3c4d5e6f');
  });
});

describe('adapter identity', () => {
  it('matches gemini and nothing else', () => {
    const { adapter } = makeAdapter();
    expect(adapter.matches('https://gemini.google.com/app')).toBe(true);
    expect(adapter.matches('https://chatgpt.com/')).toBe(false);
    expect(adapter.matches('https://gemini.google.com.evil.example/')).toBe(false);
    expect(adapter.matches('not a url')).toBe(false);
  });
});
