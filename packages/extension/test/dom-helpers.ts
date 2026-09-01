/**
 * Shared jsdom scaffolding for adapter fixture tests.
 *
 * Centralised rather than copied into each adapter's suite so that the
 * layout simulation below has ONE definition. Three copies that drifted apart
 * would mean three different notions of "visible", and a test that passes for
 * a reason its author did not intend is worse than no test.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolved from the repo root rather than import.meta.url: under the jsdom
// environment import.meta.url is an http: URL and fileURLToPath rejects it.
const FIXTURES = join(process.cwd(), 'packages', 'extension', 'test', 'fixtures');

/**
 * jsdom performs no layout, so every getBoundingClientRect is 0x0 and the
 * 'rendered' invariant would reject every element including the real composer.
 *
 * Rather than weaken the invariant to suit the test environment — deleting a
 * real check to make a fake one pass — layout is simulated: elements get a
 * realistic box unless they are hidden or inside an aria-hidden subtree, which
 * is what a browser would produce.
 *
 * ADAPTER-VERIFICATION.md records the consequence: the invariant's numeric
 * thresholds are not verified offline, only its logic.
 */
export function giveEverythingLayout(root: ParentNode = document): void {
  const elements = [...Array.from(root.querySelectorAll('*'))];
  // Shadow roots are separate trees; their contents need boxes too.
  for (const element of Array.from(root.querySelectorAll('*'))) {
    if (element.shadowRoot !== null) {
      elements.push(...Array.from(element.shadowRoot.querySelectorAll('*')));
    }
  }
  for (const element of elements) {
    // Both checks walk ANCESTORS. `hidden` on a container hides everything
    // inside it in a real browser, so checking only the element itself would
    // report a hidden form field as visible - and the whole point of the
    // 'rendered' invariant is to reject exactly that.
    const inert =
      element.closest('[aria-hidden="true"]') !== null || element.closest('[hidden]') !== null;
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        inert
          ? { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 }
          : { width: 640, height: 48, top: 0, left: 0, right: 640, bottom: 48, x: 0, y: 0 },
    });
  }
}

/** Loads a committed fixture into the jsdom document. */
export function loadFixture(name: string): void {
  const html = readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html
    .replace(/^[\s\S]*?<html[^>]*>/iu, '')
    .replace(/<\/html>\s*$/iu, '');
  giveEverythingLayout();
}

/** Resets the document between tests. */
export function resetDocument(): void {
  document.documentElement.innerHTML = '<head></head><body></body>';
}

/**
 * Moves an element's subtree into an open shadow root on a new host.
 *
 * Shadow roots cannot be expressed in a plain HTML fixture without declarative
 * shadow DOM, which jsdom's innerHTML does not parse. Building them in the test
 * keeps the fixtures readable and makes the shadow boundary explicit at the
 * point it matters.
 */
export function moveIntoShadowRoot(element: Element): ShadowRoot {
  const host = element.ownerDocument.createElement('div');
  element.replaceWith(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.append(element);
  giveEverythingLayout();
  return shadow;
}

/** Dispatches the input event the witness listens for. */
export function witnessTyping(element: Element): void {
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
}

/**
 * jsdom implements no `document.execCommand`, so every write into a
 * contenteditable throws and the send gate correctly refuses.
 *
 * That refusal is the RIGHT behaviour - it is fail-closed doing its job - but
 * it means the confirm path cannot be exercised offline at all, and the
 * masked write-back is the single most important thing the gate does.
 *
 * So `insertText` is emulated, in the same spirit as `giveEverythingLayout`:
 * simulate what a browser would do rather than weaken the production code to
 * suit the test environment. `execCommand('insertText', false, text)` replaces
 * the current selection, and the selection the writer sets is the element's
 * whole contents - so replacing all of it with one text node is what a browser
 * produces here.
 *
 * WHAT THIS DOES NOT ESTABLISH, stated because it would otherwise be assumed:
 * that a real browser's `insertText` produces the `beforeinput`/`input` events
 * ProseMirror, Quill and Lexical need in order to accept the change, and that
 * those editors do not revert it on their next reconciliation. Nothing offline
 * can establish that. It is what the live verification is for, and
 * ADAPTER-VERIFICATION.md records the result.
 */
export function installInsertTextEmulation(): void {
  const doc = document as Document & {
    execCommand?: (command: string, showUi?: boolean, value?: string) => boolean;
  };
  doc.execCommand = (command, _showUi, value) => {
    if (command !== 'insertText') return false;
    const selection = document.defaultView?.getSelection();
    const range = selection?.rangeCount === 1 ? selection.getRangeAt(0) : null;
    const host = range?.commonAncestorContainer;
    const element =
      host instanceof HTMLElement ? host : (host?.parentElement ?? null);
    if (element === null) return false;
    element.textContent = value ?? '';
    // A real insertText raises input on the editing host, which is what the
    // input witness and every framework listener key on.
    element.dispatchEvent(
      new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText' }),
    );
    return true;
  };
}
