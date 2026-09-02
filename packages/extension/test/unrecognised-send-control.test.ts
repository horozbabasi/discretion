// @vitest-environment jsdom
/**
 * A KNOWN, OPEN GAP, pinned in executable form.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THESE TESTS ASSERT THE CURRENT BEHAVIOUR, WHICH IS NOT THE DESIRED ONE.
 *
 * Every adapter's click handler decides whether the click was on a send
 * control, and when the answer is no it RETURNS SILENTLY. That is right for an
 * ordinary click on the page. It is wrong when the send control could not be
 * found at all, because then "not a send control" and "a send control we
 * failed to recognise" are the same answer — and the second one lets the
 * page's own handler run with the user's ORIGINAL, unmasked text.
 *
 * That is a fail-OPEN path in a tool whose first rule is fail-closed. It is
 * not a locale bug, though locale is one way to reach it: any markup change
 * that breaks the selector reaches it too.
 *
 * WHY IT IS PINNED RATHER THAN FIXED HERE. The fix belongs in each adapter's
 * `onClick`, which is the fail-closed path of the send gate — the most
 * dangerous code in this repository — and it cannot be verified where it
 * matters: two of the three sites need a signed-in session to test against.
 * Scheduled for M11 (ARCHITECTURE.md D57).
 *
 * SO: when the fix lands, THESE TESTS MUST FAIL. That is the point. Rewrite
 * them to assert the refusal; do not delete them and do not relax them.
 *
 * The measured state as of 2026-09-02 (scripts/probe-send-locale.py, live,
 * signed-out gemini.google.com/app, en and tr):
 *
 *   tier                                        en    tr
 *   [data-test-id="send-button"]                 0     0
 *   [data-testid="send-button"]                  0     0
 *   .send-button                                 1     1   <- the only anchor
 *   mat-icon[fonticon="send"]                    0     0
 *   [aria-label="Send message" i]                1     0   <- English only
 *
 * So there is no live leak today, and a non-English user has ONE anchor where
 * an English user has two — and the one is a CSS class, the tier SPEC.md ranks
 * least durable.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ChatGptAdapter } from '../src/adapters/chatgpt.js';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { GeminiAdapter } from '../src/adapters/gemini.js';
import { InputWitness } from '../src/adapters/binding.js';
import type { SubmitIntent } from '../src/adapters/types.js';
import { giveEverythingLayout, resetDocument, witnessTyping } from './dom-helpers.js';

beforeEach(resetDocument);

/**
 * A composer with text, and a send control this adapter cannot recognise.
 *
 * The button carries a TURKISH accessible name and none of the structural
 * markers any adapter keys on — no test id, no `type="submit"`, no element id,
 * no Material icon. It is exactly what a re-skinned or differently-localised
 * send button looks like to these selectors: a plain button.
 */
function unrecognisableComposer(): { composer: HTMLElement; button: HTMLElement } {
  document.body.innerHTML = `
    <main>
      <div id="composer-region">
        <div class="ProseMirror" contenteditable="true" role="textbox">my IBAN is GB33BUKB20201555555555</div>
        <button aria-label="Gönder">↑</button>
      </div>
    </main>
  `;
  giveEverythingLayout();
  const composer = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
  const button = document.querySelector<HTMLElement>('button')!;
  witnessTyping(composer);
  return { composer, button };
}

/** Clicks the button and returns whatever intent the adapter emitted, if any. */
function intentFromClicking(
  adapter: { onSubmitIntent: (cb: (intent: SubmitIntent) => void) => () => void },
  button: HTMLElement,
): SubmitIntent | null {
  let captured: SubmitIntent | null = null;
  const off = adapter.onSubmitIntent((intent) => {
    captured = intent;
  });
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  off();
  return captured;
}

describe('an unrecognised send control is NOT intercepted (open gap, not desired)', () => {
  it('claude: a click on a button the selector does not match passes through', () => {
    const { composer, button } = unrecognisableComposer();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ClaudeAdapter(document, witness);

    // No test id, no type=submit, and a Turkish label — so none of
    // SEND_BUTTON_SELECTOR's clauses match.
    expect(button.matches('[data-testid="send-button"], [type="submit"]')).toBe(false);

    // TODAY: nothing is emitted, so nothing is suppressed, so the page sends.
    // AFTER THE M11 FIX: this must be a refusal, and this expectation flips.
    expect(intentFromClicking(adapter, button)).toBeNull();
    witness.stop();
  });

  it('chatgpt: same, and chatgpt has no English clause to lose in the first place', () => {
    const { composer, button } = unrecognisableComposer();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ChatGptAdapter(document, witness);

    expect(intentFromClicking(adapter, button)).toBeNull();
    witness.stop();
  });

  it('gemini: same, through the tiered resolver rather than a flat selector', () => {
    const { composer, button } = unrecognisableComposer();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new GeminiAdapter(document, witness);

    expect(intentFromClicking(adapter, button)).toBeNull();
    witness.stop();
  });
});

describe('what still protects the user while the gap is open', () => {
  it('the ENTER path does not depend on resolving the send control', () => {
    // This is why the gap is latent rather than catastrophic: a user who
    // presses Enter is protected on any locale, because the keydown handler
    // works from the composer alone. Only a POINTER send is exposed, which
    // makes the failure asymmetric and easy to miss - the extension looks like
    // it is working right up until someone clicks instead of pressing Enter.
    const { composer } = unrecognisableComposer();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ClaudeAdapter(document, witness);

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    composer.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    off();
    witness.stop();

    expect(captured).not.toBeNull();
    expect((captured as unknown as SubmitIntent).kind).toBe('key');
  });

  it('a RECOGNISED send control is still intercepted, so the gap is narrow', () => {
    // The guard against reading the tests above as "clicks are never
    // intercepted". They are, whenever the selector matches - which on every
    // page measured so far, in every locale measured so far, it does.
    document.body.innerHTML = `
      <main>
        <div id="composer-region">
          <div class="ProseMirror" contenteditable="true" role="textbox">hello</div>
          <button type="button" data-testid="send-button" aria-label="Gönder">↑</button>
        </div>
      </main>
    `;
    giveEverythingLayout();
    const composer = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
    const button = document.querySelector<HTMLElement>('button')!;
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ClaudeAdapter(document, witness);

    // A TURKISH label and a test id: the locale-independent clause carries it,
    // which is exactly the situation measured live on Gemini.
    const intent = intentFromClicking(adapter, button);
    witness.stop();

    expect(intent).not.toBeNull();
    expect((intent as unknown as SubmitIntent).kind).toBe('button');
  });
});

describe('two more instances of the same shape, found by adversarial review', () => {
  /**
   * INSTANCE 2: the key path is NOT locale-blind after all.
   *
   * This corrects a claim made in the first version of this file and in
   * ARCHITECTURE.md: that a user who presses Enter is protected on every
   * locale because the keydown handler never consults the send control.
   *
   * True of the SEND CONTROL, false of the handler. Every adapter opens with
   *
   *   if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
   *
   * and `isComposing` can only ever be true for someone typing through an
   * INPUT METHOD EDITOR - Japanese, Chinese, Korean. It is a silent return
   * with no callback and no suppression: the same shape as the click hole, on
   * the path that was supposed to be the safe one.
   *
   * Whether it LEAKS depends on whether the site's own Enter handler also
   * consults `isComposing`. If it does, both sides agree the keystroke is a
   * composition commit and nothing is sent - correct. If it does not, the site
   * sends and the extension has already decided not to look. That is a
   * question about someone else's code and is NOT claimed here either way.
   *
   * What IS claimed, and asserted below: the branch is live, it is
   * locale-correlated, and until now no test on any adapter exercised it -
   * `grep -rn isComposing packages/extension/test` returned nothing.
   */
  it('an IME composition Enter is dropped silently on chatgpt', () => {
    const { composer } = unrecognisableComposer();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ChatGptAdapter(document, witness);

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    composer.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        composed: true,
      }),
    );
    off();
    witness.stop();

    // Dropped. Correct IF chatgpt.com agrees this keystroke is a commit.
    expect(captured).toBeNull();
  });

  it('the same Enter WITHOUT composition is intercepted, so the branch is live', () => {
    // The control that turns the assertion above from "nothing happens here"
    // into "the isComposing clause is what stopped it".
    const { composer } = unrecognisableComposer();
    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ChatGptAdapter(document, witness);

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    composer.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }),
    );
    off();
    witness.stop();

    expect(captured).not.toBeNull();
  });

  it('claude RECORDS the composing Enter; chatgpt and gemini do not', () => {
    // claude.ts:347-352 calls recordIntent BEFORE its guard, with the comment
    // "Without this the absence of a record is silent." That is the right
    // pattern and only one of the three adapters has it - so on the other two
    // an IME-related miss would leave no trace at all to diagnose it by.
    const chatgpt = readFileSync(
      join(process.cwd(), 'packages', 'extension', 'src', 'adapters', 'chatgpt.ts'),
      'utf8',
    );
    const claude = readFileSync(
      join(process.cwd(), 'packages', 'extension', 'src', 'adapters', 'claude.ts'),
      'utf8',
    );
    expect(claude).toContain('+composing');
    expect(chatgpt).not.toContain('+composing');
  });

  /**
   * INSTANCE 3: `closest()` cannot cross a shadow boundary.
   *
   * `event.composedPath()[0]` deliberately returns the node INSIDE a shadow
   * tree, and `target.closest(SEND_BUTTON_SELECTOR)` then searches only that
   * node's own tree. So a send button carrying EVERY marker the adapter looks
   * for - test id, element id, type=submit - is invisible to the click path
   * once it is inside a shadow root.
   *
   * Only gemini.ts imports `closestAcrossShadow`; claude.ts and chatgpt.ts use
   * the plain DOM method. Nothing about this is locale-related, which is the
   * point: it is a third independent route to the same silent fall-through.
   */
  it('an icon in a nested shadow root INSIDE the button is not intercepted', () => {
    // THE CORRECT CONSTRUCTION, and it took a failed attempt to find it.
    //
    // An adversarial reviewer reported this by moving the whole button into a
    // shadow root. That does NOT reproduce: `closest` starts at the element
    // itself, so a click on the button matches the button, boundary or not.
    // Written that way the test passed and the claim looked refuted.
    //
    // The real case is the other way round - the BUTTON stays in the light DOM
    // and the click lands on something inside a shadow root WITHIN it, which
    // is what a web-component icon produces. `composedPath()[0]` hands back
    // the inner node by design, and `closest` then stops at the boundary
    // below the button and never sees it.
    document.body.innerHTML = `
      <main>
        <div id="composer-region">
          <div class="ProseMirror" contenteditable="true" role="textbox">hello</div>
          <button type="submit" id="composer-submit-button" data-testid="send-button">
            <span id="icon"></span>
          </button>
        </div>
      </main>
    `;
    giveEverythingLayout();
    const composer = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
    const button = document.querySelector<HTMLElement>('button')!;
    const iconHost = document.querySelector<HTMLElement>('#icon')!;

    // The icon lives in the host's shadow tree; the button is above it.
    const shadow = iconHost.attachShadow({ mode: 'open' });
    const glyph = document.createElement('i');
    shadow.append(glyph);
    giveEverythingLayout();

    // Every marker the adapter looks for is present on the button.
    expect(button.matches('button[data-testid="send-button"]')).toBe(true);
    // And `closest` from the glyph cannot see it.
    expect(glyph.closest('button[data-testid="send-button"]')).toBeNull();

    const witness = new InputWitness(document);
    witness.start();
    witnessTyping(composer);
    const adapter = new ChatGptAdapter(document, witness);

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    glyph.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();
    witness.stop();

    // Not intercepted, with three correct markers on the button.
    // gemini.ts is the only adapter that imports `closestAcrossShadow`.
    expect(captured).toBeNull();
  });
});
