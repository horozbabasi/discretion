/**
 * Submit-time identity binding — constructions #2 and #3 from types.ts, and
 * the reason a wrong getComposer() cannot cause a silent leak.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AND WHY IT IS SEPARATE FROM RESOLUTION
 *
 * Everything in resolve.ts is still, ultimately, selectors. Better selectors,
 * with an ambiguity rule and invariants — but a careful mistake in a selector
 * list produces a confident wrong answer, and no amount of care inside that
 * system can detect it, because the system has no second opinion.
 *
 * This module is the second opinion, and it is built on something no site
 * redesign can move: THE USER'S OWN EVENT. When someone presses Enter, the
 * event's composed path passes through the element they were actually typing
 * in. That element is not a guess. It cannot be stale, cannot be a hidden
 * template clone, and cannot be a decoy, because the user's keystroke
 * physically went into it.
 *
 * So the gate is an equality, not a heuristic:
 *
 *     the element detection ran on  ===  the element this event submits
 *
 * If getComposer() picked the wrong node, detection ran on the wrong node, and
 * this equality fails — so the send is blocked instead of leaking. The check
 * requires no knowledge of any site's markup, which is exactly why it survives
 * the redesigns that break selectors.
 *
 * THE BUTTON CASE is the one that needs care, because a click on Send does not
 * pass through the composer. Resolving it from a document-wide selector would
 * throw away the independence that makes this worth having, so instead the
 * composer is resolved WITHIN THE REGION CONTAINING THE CLICKED BUTTON, and
 * only if that region contains exactly one editable surface. The anchor is
 * still a real user event; the search is only scoped by it.
 *
 * THE INPUT WITNESS closes the remaining gap. A decoy could in principle sit
 * in the same region as the send button. But a decoy is, by definition, the
 * element the user did NOT type into — so requiring that the bound element has
 * actually received an input event during this page session rejects it. A
 * never-typed-in element holding text is not a composer; it is a bug or an
 * attack, and either way the send must not proceed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ComposerHandle, SubmitIntent } from './types.js';
import { isEditableSurface } from './invariants.js';

export type BindingVerdict =
  | { readonly ok: true; readonly node: HTMLElement }
  | { readonly ok: false; readonly code: BindingFailureCode; readonly detail: string };

export type BindingFailureCode =
  /** The event did not resolve to any editable element. */
  | 'undecidable'
  /** Detection ran on a different node than the one being submitted. */
  | 'identity-mismatch'
  /** The bound element has never received user input this session. */
  | 'no-input-witness'
  /** The bound element has left the document since detection. */
  | 'detached';

/**
 * Records which elements have actually received user input.
 *
 * Listens in the CAPTURE phase at the document root with `composed` events, so
 * it sees input inside shadow roots and cannot be prevented by a host page
 * handler that stops propagation. Holds elements weakly: the set must not keep
 * detached composers alive across SPA navigation.
 */
export class InputWitness {
  private readonly witnessed = new WeakSet<HTMLElement>();
  private readonly document: Document;
  private detach: (() => void) | null = null;

  constructor(doc: Document) {
    this.document = doc;
  }

  start(): void {
    if (this.detach !== null) return;
    const onInput = (event: Event): void => {
      // `composedPath()[0]` rather than `event.target`: for input originating
      // inside a shadow root, `target` is retargeted to the host and would
      // witness the wrong element.
      const origin = event.composedPath()[0];
      if (isEditableSurface(origin ?? null)) this.witnessed.add(origin as HTMLElement);
    };
    // `beforeinput` as well as `input`: composers that intercept and re-render
    // may never emit a plain `input` event on the element itself.
    this.document.addEventListener('beforeinput', onInput, { capture: true });
    this.document.addEventListener('input', onInput, { capture: true });
    this.detach = () => {
      this.document.removeEventListener('beforeinput', onInput, { capture: true });
      this.document.removeEventListener('input', onInput, { capture: true });
    };
  }

  stop(): void {
    this.detach?.();
    this.detach = null;
  }

  hasTyped(element: HTMLElement): boolean {
    return this.witnessed.has(element);
  }

  /**
   * Marks an element as witnessed because WE wrote to it.
   *
   * Needed because substitution replaces the composer's contents
   * programmatically, and a programmatic write may not raise a trusted input
   * event. Only ever called with a handle that already passed the binding
   * check, so it cannot be used to launder an unwitnessed element.
   */
  creditOwnWrite(element: HTMLElement): void {
    this.witnessed.add(element);
  }
}

/** The nearest editable element on an event's composed path, if any. */
function editableOnPath(event: Event): HTMLElement | null {
  for (const node of event.composedPath()) {
    if (isEditableSurface(node as Node)) return node as HTMLElement;
  }
  return null;
}

/**
 * The single editable surface inside the region containing a clicked control.
 *
 * Returns null when the region holds none or more than one — the same
 * ambiguity rule as resolve.ts, for the same reason. `region` is supplied by
 * the adapter as the container that holds both the composer and its send
 * button.
 */
export function editableWithinRegion(region: Element): HTMLElement | null {
  const editables: HTMLElement[] = [];
  for (const element of region.querySelectorAll<HTMLElement>('textarea, input, [contenteditable]')) {
    if (isEditableSurface(element)) editables.push(element);
  }
  return editables.length === 1 ? (editables[0] as HTMLElement) : null;
}

/** Derives the element a keyboard submit would send, from the event alone. */
export function originComposerOfKeyEvent(event: KeyboardEvent): HTMLElement | null {
  return editableOnPath(event);
}

/**
 * Derives the element a button submit would send.
 *
 * `findRegion` walks up from the clicked control to the container the adapter
 * declares as the composer region.
 */
export function originComposerOfButtonEvent(
  event: Event,
  findRegion: (from: Element) => Element | null,
): HTMLElement | null {
  const clicked = event.composedPath()[0];
  if (clicked === undefined || !(clicked instanceof Element)) return null;
  const region = findRegion(clicked);
  return region === null ? null : editableWithinRegion(region);
}

/**
 * THE GATE. Called immediately before a send is allowed to proceed.
 *
 * Fails closed on every path: an undecidable event, a mismatch, a missing
 * witness and a detached node all return `ok: false`, and there is no branch
 * that returns `ok: true` without the node identity having been compared.
 */
export function verifyBinding(
  detectedOn: ComposerHandle,
  intent: SubmitIntent,
  witness: InputWitness,
): BindingVerdict {
  const submitted = intent.originComposer;

  if (submitted === null) {
    return {
      ok: false,
      code: 'undecidable',
      detail:
        'The submit event did not resolve to exactly one editable element, so which text is about to be sent cannot be established.',
    };
  }

  if (detectedOn.node !== submitted) {
    return {
      ok: false,
      code: 'identity-mismatch',
      detail:
        'The text that was inspected belongs to a different element than the one this action submits. ' +
        `The composer was located by strategy '${detectedOn.strategyId}' at the '${detectedOn.tier}' tier, which is now known to be wrong.`,
    };
  }

  if (!submitted.isConnected) {
    return {
      ok: false,
      code: 'detached',
      detail: 'The composer was removed from the page between detection and send.',
    };
  }

  if (!witness.hasTyped(submitted)) {
    return {
      ok: false,
      code: 'no-input-witness',
      detail:
        'This element has never received input during this page session. An element holding text the user never typed is not the composer.',
    };
  }

  return { ok: true, node: submitted };
}
