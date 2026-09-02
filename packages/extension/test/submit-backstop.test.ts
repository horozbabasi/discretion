// @vitest-environment jsdom
/**
 * The submit-event backstop.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT EXISTS. Before it, the extension listened for `click` and `keydown`
 * and nothing else — verified by enumerating every `addEventListener` in
 * `packages/extension/src`. A form submission raised any other way went
 * straight to the site with the user's ORIGINAL text.
 *
 * Demonstrated in a real browser before it was fixed
 * (`scripts/probe-submit-routes.py`, which serves a ChatGPT-shaped document at
 * https://chatgpt.com/ so the content script really runs): a
 * `form.requestSubmit()` reached the page carrying an unmasked IBAN, with an
 * ordinary Enter intercepted in the same run as the positive control.
 *
 * WHAT IT IS NOT. It is a backstop, not a third equal path:
 *
 *   - It cannot catch `form.submit()`, which by specification fires NO submit
 *     event. No listener architecture can. Confirmed by observation, not by
 *     reading the spec: the probe attaches its own capture-phase spy and sees
 *     nothing.
 *   - It does not fire in the ordinary case, because the click path calls
 *     `stopPropagation`, so the site never reaches its own submit.
 *   - It does not close the "unrecognised control" route, where the site sends
 *     from JavaScript without submitting a form at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ChatGptAdapter } from '../src/adapters/chatgpt.js';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { GeminiAdapter } from '../src/adapters/gemini.js';
import { InputWitness } from '../src/adapters/binding.js';
import type { SubmitIntent } from '../src/adapters/types.js';
import { giveEverythingLayout, resetDocument, witnessTyping } from './dom-helpers.js';

beforeEach(resetDocument);

/** A composer inside a form, plus an unrelated form elsewhere on the page. */
function pageWithComposerForm(): { composer: HTMLElement; form: HTMLFormElement } {
  document.body.innerHTML = `
    <main>
      <form data-type="unified-composer" id="composer-form">
        <div id="prompt-textarea" class="ProseMirror" contenteditable="true" role="textbox">Pay GB33BUKB20201555555555 today.</div>
        <button type="submit" data-testid="send-button" id="composer-submit-button">Send</button>
      </form>
      <form id="site-search">
        <input type="search" id="q" />
        <button type="submit">Search</button>
      </form>
    </main>
  `;
  giveEverythingLayout();
  const composer = document.querySelector<HTMLElement>('#prompt-textarea')!;
  witnessTyping(composer);
  return { composer, form: document.querySelector<HTMLFormElement>('#composer-form')! };
}

function captureFrom(
  adapter: { onSubmitIntent: (cb: (i: SubmitIntent) => void) => () => void },
  act: () => void,
): SubmitIntent | null {
  let captured: SubmitIntent | null = null;
  const off = adapter.onSubmitIntent((intent) => {
    captured = intent;
  });
  act();
  off();
  return captured;
}

describe('a form submission nothing else saw is caught', () => {
  for (const [name, make] of [
    ['chatgpt', (d: Document, w: InputWitness) => new ChatGptAdapter(d, w)],
    ['claude', (d: Document, w: InputWitness) => new ClaudeAdapter(d, w)],
    ['gemini', (d: Document, w: InputWitness) => new GeminiAdapter(d, w)],
  ] as const) {
    it(`${name}: a submit event on the composer form produces an intent`, () => {
      const { composer, form } = pageWithComposerForm();
      const witness = new InputWitness(document);
      witness.start();
      witnessTyping(composer);
      const adapter = make(document, witness);

      const intent = captureFrom(adapter, () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      witness.stop();

      expect(intent).not.toBeNull();
      const captured = intent as unknown as SubmitIntent;
      expect(captured.kind).toBe('submit');
      // The origin is resolved by the SAME admission rule the region walk and
      // the uniqueness test use, so a form full of decoys resolves the same
      // way everywhere (D50).
      expect(captured.originComposer).toBe(composer);
    });
  }

  it('suppressing the intent cancels the submission', () => {
    const { composer, form } = pageWithComposerForm();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ChatGptAdapter(document, witness);

    let defaultPrevented = false;
    const off = adapter.onSubmitIntent((intent) => {
      intent.suppress();
      defaultPrevented = intent.event.defaultPrevented;
    });
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    off();
    witness.stop();

    // Without this the backstop would see the send and let it go anyway.
    expect(defaultPrevented).toBe(true);
  });
});

describe('what the backstop deliberately ignores', () => {
  it('a form on the page that holds no composer', () => {
    // A site search box is a form too. Gating it would block the page for no
    // reason, and `editableWithinRegion` is what tells them apart: an
    // <input type="search"> is not an admissible composer.
    const { composer } = pageWithComposerForm();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ChatGptAdapter(document, witness);

    const search = document.querySelector<HTMLFormElement>('#site-search')!;
    const intent = captureFrom(adapter, () => {
      search.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    witness.stop();

    expect(intent).toBeNull();
  });

  it('does not double-fire when the click path already handled the send', () => {
    // The ordinary case. The click path suppresses with stopPropagation, so
    // the site never submits and no submit event is dispatched at all. This
    // pins that the backstop is not a second intent for one user action.
    const { composer } = pageWithComposerForm();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ChatGptAdapter(document, witness);

    const intents: SubmitIntent[] = [];
    const off = adapter.onSubmitIntent((intent) => {
      intents.push(intent);
      intent.suppress();
    });
    document
      .querySelector<HTMLElement>('[data-testid="send-button"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
    off();
    witness.stop();

    expect(intents.length).toBe(1);
    expect(intents[0]?.kind).toBe('button');
  });
});

describe('form.submit() cannot be caught, and that is a property of the platform', () => {
  it('fires no submit event for any listener to see', () => {
    // Not a limitation of this extension. `HTMLFormElement.submit()` is
    // specified to submit WITHOUT firing the event, which is exactly why the
    // backstop cannot close that route and why it is documented as open
    // (ARCHITECTURE.md D57b) rather than quietly assumed handled.
    const { form } = pageWithComposerForm();
    let saw = false;
    form.addEventListener('submit', () => {
      saw = true;
    }, true);

    // jsdom does not navigate, so this is safe to call directly here.
    try {
      form.submit();
    } catch {
      // jsdom may refuse to navigate; the assertion below is what matters.
    }

    expect(saw).toBe(false);
  });
});
