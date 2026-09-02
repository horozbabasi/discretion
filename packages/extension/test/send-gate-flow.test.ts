// @vitest-environment jsdom
/**
 * The gate as it actually runs: a real adapter, a committed fixture, a real
 * input witness, and a real submit event.
 *
 * A fake adapter would define away the two things worth testing here - that
 * the page's own handler never runs, and that `verifyBinding` is called rather
 * than bypassed - so the flow is exercised through the same objects production
 * uses. Only the recognizer is a stand-in, because the alternative is loading
 * a 280 MB model into jsdom.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generate } from '@discretion/core';
import type { NerRecognizer } from '@discretion/core';

import { ClaudeAdapter } from '../src/adapters/claude.js';
import { InputWitness } from '../src/adapters/binding.js';
import { DetectionController } from '../src/detection/controller.js';
import {
  giveEverythingLayout,
  installInsertTextEmulation,
  loadFixture,
  resetDocument,
} from './dom-helpers.js';

const IBAN = generate.generateValidIban(31);

/** Mirrors DEGRADED_GRACE_MS in the controller. */
const DEGRADED_GRACE_MS = 2500;

beforeEach(resetDocument);

/** A recognizer that finds nothing but reports that Stage 2 ran. */
const SILENT_RECOGNIZER: NerRecognizer = {
  id: 'test-recognizer',
  warmup: () => Promise.resolve(),
  recognize: () => Promise.resolve([]),
};

interface Harness {
  controller: DetectionController;
  adapter: ClaudeAdapter;
  composer: HTMLElement;
  errors: unknown[];
  /** Every send the page would actually have performed. */
  pageSends: string[];
  state: () => string | null;
}

function harness(recognizer: NerRecognizer | null = SILENT_RECOGNIZER): Harness {
  loadFixture('claude/composer');
  installInsertTextEmulation();
  const witness = new InputWitness(document);
  witness.start();
  const adapter = new ClaudeAdapter(document, witness);
  const errors: unknown[] = [];

  const composer = document.querySelector<HTMLElement>('[contenteditable="true"]');
  if (composer === null) throw new Error('fixture has no composer');

  // Stands in for the site's own submit handler, in the BUBBLE phase, which is
  // where a real one lives. If the gate's capture-phase suppression works,
  // this never runs; if it is ever weakened, this records what would have
  // been sent.
  const pageSends: string[] = [];
  document.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter' && !(event as KeyboardEvent).shiftKey) {
      pageSends.push(composer.textContent ?? '');
    }
  });

  const controller = new DetectionController({
    adapter,
    document,
    witness,
    ner: recognizer,
    onError: (error) => errors.push(error),
  });
  controller.start();

  return {
    controller,
    adapter,
    composer,
    errors,
    pageSends,
    state: () => document.querySelector('discretion-surface')?.getAttribute('data-state') ?? null,
  };
}

/** Types text the way the witness and the adapter both see it. */
function type(node: HTMLElement, text: string): void {
  node.textContent = text;
  node.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  giveEverythingLayout();
}

function pressEnter(node: HTMLElement): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  node.dispatchEvent(event);
  return event;
}

/** Lets the gate's awaits settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

describe('the page never gets the send', () => {
  it('suppresses the submit before the page can act on it', async () => {
    const h = harness();
    type(h.composer, `my iban is ${IBAN}`);
    await settle();

    const event = pressEnter(h.composer);
    // Synchronous: preventDefault must have been called before any await, or
    // the microtask boundary is enough for the page's handler to send.
    expect(event.defaultPrevented).toBe(true);
    expect(h.pageSends).toEqual([]);
    await settle();
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });

  it('opens the review panel rather than sending', async () => {
    const h = harness();
    type(h.composer, `my iban is ${IBAN}`);
    await settle();
    pressEnter(h.composer);
    await settle();

    expect(h.state()).toBe('review');
    expect(h.composer.textContent).toContain(IBAN);
    h.controller.destroy();
  });
});

describe('refusals', () => {
  it('REFUSES when the recognizer did not run', async () => {
    // The null-NER refusal at the gate. A message that was only half-scanned
    // is not released, whatever the half found.
    const h = harness(null);
    type(h.composer, `my iban is ${IBAN}`);
    await settle();
    pressEnter(h.composer);
    await settle();

    expect(h.state()).toBe('degraded');
    expect(h.pageSends).toEqual([]);
    expect(h.composer.textContent).toContain(IBAN);
    h.controller.destroy();
  });

  it('REFUSES an identity mismatch outright, with no question asked', async () => {
    // D26 construction #2. Detection ran on a different node than the one this
    // event submits, so we do not know which text is about to be sent - and no
    // question to the user can establish that. Unlike the no-input-witness
    // case below, this one stays a refusal.
    const h = harness();
    type(h.composer, `my iban is ${IBAN}`);
    await settle();

    const decoy = document.createElement('div');
    decoy.setAttribute('contenteditable', 'true');
    document.body.append(decoy);
    giveEverythingLayout();
    // The submit resolves to the decoy; detection ran on the real composer.
    decoy.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    pressEnter(decoy);
    await settle();

    expect(h.pageSends).toEqual([]);
    expect(h.state()).not.toBe('review');
    h.controller.destroy();
  });

  it('REFUSES when detection throws', async () => {
    const exploding: NerRecognizer = {
      id: 'exploding',
      warmup: () => Promise.resolve(),
      recognize: () => Promise.reject(new Error('recognizer exploded')),
    };
    const h = harness(exploding);
    type(h.composer, `my iban is ${IBAN}`);
    await settle();
    pressEnter(h.composer);
    await settle();

    expect(h.state()).toBe('degraded');
    expect(h.pageSends).toEqual([]);
    expect(h.composer.textContent).toContain(IBAN);
    h.controller.destroy();
  });
});

describe('a message with nothing in it is not interrupted', () => {
  it('releases an empty composer without a panel', async () => {
    const h = harness();
    type(h.composer, '');
    await settle();
    pressEnter(h.composer);
    await settle();

    // Released: the page's handler ran, on the replay.
    expect(h.pageSends.length).toBeGreaterThan(0);
    h.controller.destroy();
  });

  it('releases text with nothing sensitive in it', async () => {
    const h = harness();
    type(h.composer, 'what is the capital of France?');
    await settle();
    pressEnter(h.composer);
    await settle();

    expect(h.pageSends.length).toBeGreaterThan(0);
    expect(h.state()).not.toBe('review');
    h.controller.destroy();
  });
});

/** Presses a button in the review panel by its visible text. */
function press(controller: DetectionController, label: string): void {
  const root = controller.panelRootForTesting();
  if (root === null) throw new Error('no panel');
  const button = Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label);
  if (button === undefined) {
    throw new Error(`no "${label}" button; panel has: ${Array.from(root.querySelectorAll('button')).map((b) => b.textContent ?? '').join(', ')}`);
  }
  button.click();
}

describe('the decision the panel exists to take', () => {
  it('CANCEL leaves the message untouched and unsent', async () => {
    // The composer must be exactly as the user left it. A cancel that
    // half-applied the masking would be worse than either outcome.
    const h = harness();
    const message = `my iban is ${IBAN}`;
    type(h.composer, message);
    await settle();
    pressEnter(h.composer);
    await settle();
    expect(h.state()).toBe('review');

    press(h.controller, 'Cancel');
    await settle();

    expect(h.composer.textContent).toBe(message);
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });

  it('CONFIRM masks the composer and only then releases the send', async () => {
    // The one behaviour the whole milestone is for: the value goes in, the
    // surrogate comes out, and what reaches the page is the masked version.
    const h = harness();
    type(h.composer, `my iban is ${IBAN}`);
    await settle();
    pressEnter(h.composer);
    await settle();
    expect(h.state()).toBe('review');

    press(h.controller, 'Mask and send');
    await settle();

    // The original is gone from the composer...
    expect(h.composer.textContent).not.toContain(IBAN);
    // ...the message is still a message...
    expect(h.composer.textContent).toContain('my iban is');
    // ...and the page's handler saw only the masked text.
    expect(h.pageSends.length).toBeGreaterThan(0);
    for (const sent of h.pageSends) expect(sent).not.toContain(IBAN);
    h.controller.destroy();
  });

  it('a REVERTED item is sent in the clear, deliberately', async () => {
    // The revert control has to actually mean something, and what it means is
    // that this value leaves unmasked. The egress guard would otherwise refuse
    // the message; reconciling its leaks against the reverts is what makes the
    // control honest rather than decorative.
    const h = harness();
    type(h.composer, `my iban is ${IBAN}`);
    await settle();
    pressEnter(h.composer);
    await settle();

    press(h.controller, 'Keep original');
    await settle();
    press(h.controller, 'Mask and send');
    await settle();

    expect(h.composer.textContent).toContain(IBAN);
    expect(h.pageSends.length).toBeGreaterThan(0);
    h.controller.destroy();
  });

  it('does not mask the surrogates again if the send has to be repeated', async () => {
    // A format-preserving surrogate is a VALID identifier by construction, so
    // a second pass over already-masked text would detect and re-mask it,
    // producing a surrogate for a surrogate.
    const h = harness();
    type(h.composer, `my iban is ${IBAN}`);
    await settle();
    pressEnter(h.composer);
    await settle();
    press(h.controller, 'Mask and send');
    await settle();

    const afterFirst = h.composer.textContent ?? '';
    expect(afterFirst).not.toContain(IBAN);

    // The user presses send again on the already-masked text.
    pressEnter(h.composer);
    await settle();

    expect(h.composer.textContent).toBe(afterFirst);
    expect(h.state()).not.toBe('review');
    h.controller.destroy();
  });
});

describe('the paste guard: early warning, not a gate', () => {
  // SPEC line 288: "Submit-time remains the enforcement gate; paste guard is
  // early warning layered on top."

  function paste(node: HTMLElement, text: string): Event {
    // jsdom implements neither DataTransfer nor ClipboardEvent's
    // clipboardData, so the smallest thing the guard actually reads is
    // supplied: an object with getData. Simulating the platform rather than
    // reshaping the production code to suit the test environment - the same
    // rule the layout and insertText helpers follow.
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
    });
    node.dispatchEvent(event);
    // The paste itself still happens: the guard does not preventDefault.
    node.textContent = (node.textContent ?? '') + text;
    node.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    return event;
  }

  it('does NOT cancel the paste', async () => {
    const h = harness();
    const event = paste(h.composer, `my iban is ${IBAN}`);
    expect(event.defaultPrevented).toBe(false);
    await settle();
    h.controller.destroy();
  });

  it('warns with a count of what was pasted', async () => {
    const h = harness();
    paste(h.composer, `my iban is ${IBAN}`);
    await settle();

    expect(h.state()).toBe('paste');
    const root = h.controller.panelRootForTesting();
    expect(root?.textContent).toContain('in what you just pasted');
    expect(root?.textContent).toContain('1 IBAN');
    h.controller.destroy();
  });

  it('is dismissible, and the send gate still catches what it warned about', async () => {
    // The point of the notice being dismissible is that ignoring it is safe.
    const h = harness();
    paste(h.composer, `my iban is ${IBAN}`);
    await settle();
    press(h.controller, 'Dismiss');
    await settle();
    expect(h.state()).not.toBe('paste');

    pressEnter(h.composer);
    await settle();
    expect(h.state()).toBe('review');
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });

  it('MASK NOW masks the composer without sending it', async () => {
    const h = harness();
    paste(h.composer, `my iban is ${IBAN}`);
    await settle();

    press(h.controller, 'Mask now');
    await settle();

    expect(h.composer.textContent).not.toContain(IBAN);
    expect(h.composer.textContent).toContain('my iban is');
    // Masked, NOT sent: that is the whole distinction from the send gate.
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });

  it('does not mask the surrogates again when the masked text is then sent', async () => {
    // Mask now writes surrogates, which are valid identifiers by construction.
    // Without the already-masked guard the send would mask them a second time.
    const h = harness();
    paste(h.composer, `my iban is ${IBAN}`);
    await settle();
    press(h.controller, 'Mask now');
    await settle();
    const masked = h.composer.textContent ?? '';

    pressEnter(h.composer);
    await settle();

    expect(h.composer.textContent).toBe(masked);
    expect(h.pageSends.length).toBeGreaterThan(0);
    for (const sent of h.pageSends) expect(sent).not.toContain(IBAN);
    h.controller.destroy();
  });
});

describe('D29: a composer the user never typed into', () => {
  // A restored draft, a URL prefill, or a suggestion chip. Before this, the
  // gate refused these outright: correct, and useless, on a path two of the
  // three sites offer on first run.

  /** Fills the composer the way a prefill does: no editing event, ever. */
  function prefill(node: HTMLElement, text: string): void {
    node.textContent = text;
    giveEverythingLayout();
  }

  it('ASKS instead of refusing, and says why', async () => {
    const h = harness();
    prefill(h.composer, `my iban is ${IBAN}`);
    pressEnter(h.composer);
    await settle();

    expect(h.state()).toBe('review');
    const root = h.controller.panelRootForTesting();
    expect(root?.textContent).toContain('Check this is your message');
    expect(root?.textContent).toContain('did not see you type it');
    h.controller.destroy();
  });

  it('labels the action "Protect and send", not the routine one', async () => {
    // The label is the answer to the question above it. "Mask and send" would
    // read as the same confirmation as every other send, which is what this is
    // not.
    const h = harness();
    prefill(h.composer, `my iban is ${IBAN}`);
    pressEnter(h.composer);
    await settle();

    const labels = Array.from(
      h.controller.panelRootForTesting()?.querySelectorAll('button') ?? [],
    ).map((b) => b.textContent);
    expect(labels).toContain('Protect and send');
    expect(labels).not.toContain('Mask and send');
    h.controller.destroy();
  });

  it('still sends nothing until the user answers', async () => {
    const h = harness();
    prefill(h.composer, `my iban is ${IBAN}`);
    pressEnter(h.composer);
    await settle();
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });

  it('CANCEL leaves the prefilled message untouched and unsent', async () => {
    const h = harness();
    const message = `my iban is ${IBAN}`;
    prefill(h.composer, message);
    pressEnter(h.composer);
    await settle();

    press(h.controller, 'Cancel');
    await settle();
    expect(h.composer.textContent).toBe(message);
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });

  it('CONFIRM masks it and releases, exactly like a typed message', async () => {
    const h = harness();
    prefill(h.composer, `my iban is ${IBAN}`);
    pressEnter(h.composer);
    await settle();

    press(h.controller, 'Protect and send');
    await settle();

    expect(h.composer.textContent).not.toContain(IBAN);
    expect(h.pageSends.length).toBeGreaterThan(0);
    for (const sent of h.pageSends) expect(sent).not.toContain(IBAN);
    h.controller.destroy();
  });

  it('does not ask twice about the same element', async () => {
    // The user answered. Asking again on every send would make the
    // confirmation a nag rather than a decision.
    const h = harness();
    prefill(h.composer, `my iban is ${IBAN}`);
    pressEnter(h.composer);
    await settle();
    press(h.controller, 'Protect and send');
    await settle();

    prefill(h.composer, `another iban ${IBAN}`);
    pressEnter(h.composer);
    await settle();

    const root = h.controller.panelRootForTesting();
    expect(root?.textContent).not.toContain('Check this is your message');
    h.controller.destroy();
  });

  it('asks even when there is NOTHING sensitive to mask', async () => {
    // "Is this your message" is a different question from "is there anything
    // in it". Releasing because the answer to the second is no would skip the
    // first entirely - which is the whole hole D29 describes.
    const h = harness();
    prefill(h.composer, 'what is the capital of France?');
    pressEnter(h.composer);
    await settle();

    expect(h.state()).toBe('review');
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });
});

describe('a transient health failure is not announced, and is still enforced', () => {
  // Measured live on claude.ai: within one page load, composer not-found at
  // 7ms, invariant-rejected at 434ms, resolved at 2325ms. Both failures were
  // real readings of a page still assembling itself, and announcing either
  // says "Discretion is not protecting this page" about a page that is fine.

  it('does NOT show degraded for a failure that has just started', async () => {
    const h = harness();
    vi.spyOn(h.adapter, 'healthCheck').mockReturnValue({
      ok: false,
      failures: [{ kind: 'not-found', target: 'composer', detail: 'x', triedStrategies: [] }],
      warnings: [],
      checkedAt: Date.now(),
    });
    h.controller.refresh();
    await settle();
    expect(h.state()).not.toBe('degraded');
    h.controller.destroy();
  });

  it('DOES show degraded once the failure has persisted', async () => {
    // Driven against the REAL clock rather than a counter: the grace period is
    // about elapsed time, and a mock that hands out timestamps is testing the
    // mock's arithmetic. The wait is real, which is why this test is slow.
    const h = harness();
    vi.spyOn(h.adapter, 'healthCheck').mockImplementation(() => ({
      ok: false,
      failures: [{ kind: 'not-found', target: 'composer', detail: 'x', triedStrategies: [] }],
      warnings: [],
      checkedAt: Date.now(),
    }));
    h.controller.refresh();
    await settle();
    expect(h.state()).not.toBe('degraded');

    await new Promise((resolve) => setTimeout(resolve, DEGRADED_GRACE_MS + 300));
    h.controller.refresh();
    await settle();
    expect(h.state()).toBe('degraded');
    h.controller.destroy();
  }, 15_000);

  it('STILL REFUSES A SEND during the grace window', async () => {
    // The property the whole change rests on: the grace period suppresses the
    // MESSAGE, never the enforcement. The gate resolves independently at
    // submit and does not consult the surface state.
    const h = harness();
    type(h.composer, `my iban is ${IBAN}`);
    await settle();

    vi.spyOn(h.adapter, 'getComposer').mockReturnValue({
      ok: false,
      failure: { kind: 'not-found', target: 'composer', detail: 'gone', triedStrategies: [] },
    });
    vi.spyOn(h.adapter, 'healthCheck').mockReturnValue({
      ok: false,
      failures: [{ kind: 'not-found', target: 'composer', detail: 'gone', triedStrategies: [] }],
      warnings: [],
      checkedAt: Date.now(),
    });

    pressEnter(h.composer);
    await settle();

    // Nothing sent, whatever the panel is or is not saying.
    expect(h.pageSends).toEqual([]);
    h.controller.destroy();
  });
});
