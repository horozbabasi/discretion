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

import {
  GEMINI_COMPOSER_STRATEGIES,
  GeminiAdapter,
  describeSendSearch,
} from '../src/adapters/gemini.js';
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

describe('the send control does not have to be a <button>', () => {
  it('finds a div[role="button"] send control', () => {
    // The shape that defeated every send-control selector in all three
    // adapters at once: eleven clauses, one shared `button` tag assumption.
    loadFixture('gemini/composer-nonbutton-send');
    const { adapter } = makeAdapter();

    const health = adapter.healthCheck();
    expect(health.failures.map((f) => f.target)).not.toContain('send-button');
    expect(health.ok).toBe(true);
  });

  it('recovers composer-in-send-region with it', () => {
    // That strategy is anchored on findSendButtons, so it returns nothing
    // whenever the send control cannot be found. Fixing the control is what
    // brings it back - which is exactly why it is not independent coverage.
    loadFixture('gemini/composer-nonbutton-send');
    const region = GEMINI_COMPOSER_STRATEGIES.find(
      (s) => s.id === 'gemini/composer-in-send-region',
    );
    expect(region).toBeDefined();
    expect(region?.find(document).length).toBeGreaterThan(0);
  });

  it('binds a submit intent through the non-button control', () => {
    loadFixture('gemini/composer-nonbutton-send');
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
      .querySelector<HTMLElement>('[role="button"].send-button')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    const intent = captured as unknown as SubmitIntent;
    expect(intent).not.toBeNull();
    expect(intent.originComposer).toBe(resolved.value.node);
    expect(verifyBinding(resolved.value, intent, witness).ok).toBe(true);
  });

  it('REFUSES when two distinct send controls match the same tier', () => {
    // The ambiguity rule now genuinely applies to the send control, not just
    // to the composer. It has to: binding the wrong control means a send that
    // is never intercepted, which is unmasked text leaving the machine - the
    // same consequence as resolving the wrong composer.
    loadFixture('gemini/composer-nonbutton-send');
    const extra = document.createElement('div');
    extra.setAttribute('role', 'button');
    extra.className = 'send-button';
    document.querySelector('.input-area')?.append(extra);
    giveEverythingLayout();

    const { adapter } = makeAdapter();
    const health = adapter.healthCheck();
    const sendFailure = health.failures.find((f) => f.target === 'send-button');
    expect(sendFailure?.kind).toBe('ambiguous');

    // And the composer strategy anchored on it yields nothing rather than
    // anchoring on a guess - which is why it is a corroborator, not a fallback.
    const region = GEMINI_COMPOSER_STRATEGIES.find(
      (s) => s.id === 'gemini/composer-in-send-region',
    );
    expect(region?.find(document).length).toBe(0);

    // The composer itself still resolves, by strategies that do not depend on
    // the send control at all.
    expect(adapter.getComposer().ok).toBe(true);
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

describe('ligature-form send icons', () => {
  it('resolves a <mat-icon>send</mat-icon> control and binds a click on it', () => {
    // The more common Material form, and the one the adapter missed. Every
    // other send marker is absent in this fixture.
    loadFixture('gemini/composer-ligature-send');
    const { adapter, witness } = makeAdapter();

    const health = adapter.healthCheck();
    expect(health.failures.map((f) => f.target)).not.toContain('send-button');

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    witnessTyping(resolved.value.node);

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    document
      .querySelector<HTMLElement>('[role="button"].c-1a2b3c')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    // Identifying the control is not enough - the click path must BIND, which
    // is a separate question and was broken when this clause was first added.
    const intent = captured as unknown as SubmitIntent;
    expect(intent).not.toBeNull();
    expect(intent.originComposer).toBe(resolved.value.node);
    expect(verifyBinding(resolved.value, intent, witness).ok).toBe(true);
  });

  it('WARNS that a ligature-only match is locale-fragile', () => {
    // It lives in a text node, and page-level machine translation rewrites
    // text nodes. The adapter may use it; it may not use it silently.
    loadFixture('gemini/composer-ligature-send');
    const { adapter } = makeAdapter();
    const health = adapter.healthCheck();
    expect(health.warnings.map((w) => w.target)).toContain('send-button');
    expect(health.warnings.some((w) => w.detail.includes('LIGATURE'))).toBe(true);
  });

  it('declines when the ligature name has been translated', () => {
    // The fragility made concrete. The clause must not match a translated
    // name, and the adapter must fail loudly rather than binding something else.
    loadFixture('gemini/composer-ligature-translated');
    const { adapter } = makeAdapter();

    // The composer still resolves - only the send control is affected.
    expect(adapter.getComposer().ok).toBe(true);

    const health = adapter.healthCheck();
    const sendFailure = health.failures.find((f) => f.target === 'send-button');
    const sendWarning = health.warnings.find((w) => w.target === 'send-button');
    // Either it could not be found at all, or it fell through to the weakest
    // positional tier - both must be reported, neither may be silent.
    expect(sendFailure !== undefined || sendWarning !== undefined).toBe(true);
  });

  it('ignores bidi and format characters around the ligature name', () => {
    // trim() removes whitespace only. RTL builds and templating pipelines
    // insert LRM/RLM/ZWSP around inline text, and packages/core strips the
    // same class of character in Stage 0 for the same reason.
    loadFixture('gemini/composer-ligature-send');
    const icon = document.querySelector('mat-icon');
    if (icon !== null) icon.textContent = '‎ send ‏';
    giveEverythingLayout();

    const { adapter } = makeAdapter();
    expect(adapter.healthCheck().failures.map((f) => f.target)).not.toContain('send-button');
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

describe('the region walk is traced, so its two failure modes are distinguishable', () => {
  it('reports ZERO CONTROLS when the composer has no toolbar beside it', () => {
    // One of the two ways the composer-anchored path returns nothing. Without
    // the trace this is indistinguishable from the other, and they need
    // opposite fixes.
    loadFixture('gemini/composer');
    document.querySelector('button.send-button')?.remove();
    giveEverythingLayout();

    const trace = describeSendSearch(document);
    expect(trace.composerResolved).toBe(true);
    expect(trace.outcome).toBe('no-region');
    expect(trace.regionControls).toBe(0);
    // The hop table names every element it climbed through, so "the bound was
    // too tight" is visible rather than inferred.
    expect(trace.steps.length).toBeGreaterThan(0);
  });

  it('reports AMBIGUOUS when the region genuinely holds several controls', () => {
    // The other way. This one needs a discriminator, never a wider walk -
    // widening only adds more controls.
    loadFixture('gemini/composer');
    const area = document.querySelector('.input-area');
    for (const label of ['attach', 'mic']) {
      const extra = document.createElement('button');
      extra.className = `tool-${label}`;
      area?.append(extra);
    }
    giveEverythingLayout();

    const trace = describeSendSearch(document);
    expect(trace.outcome).toBe('ambiguous');
    expect(trace.regionControls).toBeGreaterThan(1);
    expect(trace.stoppedBecause).toBe('found-region');
  });

  it('climbs past several wrapper levels to reach the real toolbar container', () => {
    // The regression the previous bound caused: an Angular composer sits five
    // or six levels below its toolbar, and a hop limit of 4 terminated before
    // reaching it - returning nothing, indistinguishable from "no controls".
    loadFixture('gemini/composer');
    const richTextarea = document.querySelector('rich-textarea');
    let wrapper = richTextarea as Element;
    for (let depth = 0; depth < 5; depth += 1) {
      const layer = document.createElement('div');
      layer.className = `layer-${depth}`;
      wrapper.replaceWith(layer);
      layer.append(wrapper);
      wrapper = layer;
    }
    giveEverythingLayout();

    const trace = describeSendSearch(document);
    expect(trace.outcome).toBe('unique');
    expect(trace.steps.length).toBeGreaterThan(4);
  });

  it('still refuses to climb into <body>', () => {
    // The bound that DOES safety work. Raising the hop limit must not
    // reintroduce the sidebar-button binding the review found.
    resetDocument();
    document.body.innerHTML =
      '<button class="sidebar-new-chat">new</button>' +
      '<main><chat-window></chat-window></main>' +
      '<div><div><rich-textarea><div class="ql-editor" contenteditable="true" ' +
      'role="textbox" aria-multiline="true" aria-label="x"></div></rich-textarea></div></div>';
    giveEverythingLayout();

    const trace = describeSendSearch(document);
    expect(trace.stoppedBecause).toBe('reached-body');
    expect(trace.outcome).toBe('no-region');
  });
});
