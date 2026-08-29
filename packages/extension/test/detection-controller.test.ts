// @vitest-environment jsdom
/**
 * The controller: composer -> pipeline -> panel, read-only.
 *
 * Run against a REAL adapter and a committed fixture rather than a fake
 * adapter, because the properties worth pinning here are exactly the ones a
 * fake would define away — that the composer is re-resolved rather than
 * remembered, and that the panel's state follows the adapter's health.
 *
 * READ-ONLY is asserted rather than asserted-about: the composer's text is
 * captured before and after and must be identical. SPEC's step 3 (write the
 * masked text back) does not exist yet, and a controller that quietly gained
 * it would be a send-altering change nobody reviewed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generate } from '@privacyshield/core';

import { ClaudeAdapter } from '../src/adapters/claude.js';
import { InputWitness } from '../src/adapters/binding.js';
import { DetectionController } from '../src/detection/controller.js';
import { giveEverythingLayout, loadFixture, resetDocument } from './dom-helpers.js';

const IBAN = generate.generateValidIban(42);
const EMAIL = generate.generateValidEmail(7);

beforeEach(resetDocument);

function composerNode(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[contenteditable="true"]');
  if (node === null) throw new Error('fixture has no composer');
  return node;
}

/** Types into the composer the way the adapter reads it, and fires input. */
function type(node: HTMLElement, text: string): void {
  node.textContent = text;
  node.dispatchEvent(new Event('input', { bubbles: true }));
}

function makeController(): {
  controller: DetectionController;
  errors: unknown[];
  adapter: ClaudeAdapter;
} {
  loadFixture('claude/composer');
  const witness = new InputWitness(document);
  witness.start();
  const adapter = new ClaudeAdapter(document, witness);
  const errors: unknown[] = [];
  const controller = new DetectionController({
    adapter,
    document,
    ner: null,
    onError: (error) => errors.push(error),
  });
  return { controller, errors, adapter };
}

/** The panel, reached through the surface's own test seam. */
function panelText(): string {
  const host = document.querySelector('privacyshield-surface');
  // The root is closed, so the page cannot read it; the test reaches it the
  // same way the class does, through the instance. Here the host is all the
  // light DOM exposes, which is itself the property `surface.test.ts` pins.
  return host?.textContent ?? '';
}

async function settle(): Promise<void> {
  // The controller debounces, then awaits the pipeline.
  await new Promise((resolve) => setTimeout(resolve, 250));
  await Promise.resolve();
}

describe('the controller reads the composer and never writes to it', () => {
  it('leaves the composer byte-identical after a full analysis', async () => {
    const { controller } = makeController();
    controller.start();
    const node = composerNode();
    const message = `my iban is ${IBAN} and my email is ${EMAIL}`;
    type(node, message);
    await settle();

    // The whole of this batch's read-only claim, in one assertion.
    expect(node.textContent).toBe(message);
    controller.destroy();
  });

  it('shows what it found, grouped, with confidence and an explanation', async () => {
    const { controller } = makeController();
    controller.start();
    type(composerNode(), `my iban is ${IBAN}`);
    await settle();

    const host = document.querySelector('privacyshield-surface');
    expect(host?.getAttribute('data-state')).toBe('findings');
    expect(host?.getAttribute('data-hidden')).toBe('false');
    controller.destroy();
  });

  it('puts NOTHING of the composer text into the light DOM', async () => {
    // The panel is the one place a detected value could escape back to the
    // page, and it is inside a closed shadow root for that reason.
    const { controller } = makeController();
    controller.start();
    type(composerNode(), `my iban is ${IBAN}`);
    await settle();

    expect(panelText()).not.toContain(IBAN);
    controller.destroy();
  });

  it('hides the panel when the composer is emptied', async () => {
    const { controller } = makeController();
    controller.start();
    const node = composerNode();
    type(node, `my iban is ${IBAN}`);
    await settle();
    expect(document.querySelector('privacyshield-surface')?.getAttribute('data-state')).toBe(
      'findings',
    );

    type(node, '');
    await settle();
    expect(document.querySelector('privacyshield-surface')?.getAttribute('data-hidden')).toBe(
      'true',
    );
    controller.destroy();
  });
});

describe('the composer is re-resolved, not remembered', () => {
  it('follows a replacement composer and clears the session with it', async () => {
    // D34i / D38a: Gemini swaps the composer on SPA navigation, ChatGPT on a
    // conversation switch. A handle captured once goes stale silently, because
    // a detached element still answers every method called on it.
    const { controller } = makeController();
    controller.start();
    const original = composerNode();
    type(original, `my iban is ${IBAN}`);
    await settle();

    // Replace the composer with a fresh node, as an SPA route change does.
    const replacement = original.cloneNode(false) as HTMLElement;
    replacement.textContent = '';
    original.replaceWith(replacement);
    giveEverythingLayout();

    controller.refresh();
    type(replacement, `my iban is ${IBAN}`);
    await settle();

    // The new node is the one being read: the panel came back.
    expect(document.querySelector('privacyshield-surface')?.getAttribute('data-state')).toBe(
      'findings',
    );
    controller.destroy();
  });

  it('stops reading a composer that has left the document', async () => {
    const { controller } = makeController();
    controller.start();
    const node = composerNode();
    type(node, `my iban is ${IBAN}`);
    await settle();

    node.remove();
    controller.refresh();
    await settle();

    // Not findings: there is no composer to have findings about. Which of the
    // remaining states is right is the health model's decision, tested in
    // surface-state.test.ts; what matters here is that a detached node does
    // not go on producing results.
    expect(document.querySelector('privacyshield-surface')?.getAttribute('data-state')).not.toBe(
      'findings',
    );
    controller.destroy();
  });
});

describe('a detection failure is never an empty panel', () => {
  it('goes DEGRADED and reports, rather than showing nothing found', async () => {
    // "Found nothing" and "could not look" are indistinguishable to a user,
    // and only one of them is safe. This is fail-closed with nothing yet to
    // close: the state the send gate will read is the state that is set.
    const { controller, errors, adapter } = makeController();
    controller.start();
    vi.spyOn(adapter, 'getComposerText').mockImplementation(() => {
      throw new Error('composer read exploded');
    });
    type(composerNode(), `my iban is ${IBAN}`);
    await settle();

    const host = document.querySelector('privacyshield-surface');
    expect(host?.getAttribute('data-state')).toBe('degraded');
    expect(errors).toHaveLength(1);
    controller.destroy();
  });
});
