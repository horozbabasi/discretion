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
import { COMPOSER_INVARIANTS, isEditableSurface } from './invariants.js';

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
    // BOTH events are required, and the reason is measured rather than
    // defensive. `scripts/probe-input-events.py` establishes in a real browser
    // that on PASTE, `beforeinput` targets the inner paragraph of a
    // contenteditable while `input` targets the editing host; on typing, both
    // target the host. Listening to `beforeinput` alone — the more obvious
    // choice, since it fires first — would therefore never witness the
    // composer on a paste, and every paste-then-send would be blocked with
    // 'no-input-witness'. Listening to `input` alone would miss composers that
    // intercept and re-render without emitting one on the element itself.
    //
    // Do not drop either listener without re-running that probe.
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

  /**
   * Marks an element as witnessed because THE USER SAID SO.
   *
   * D29. A composer filled by a restored draft, a URL prefill or a suggestion
   * chip raises no editing event, so the witness never sees it and the send is
   * blocked - correct, and useless, on a path two of the three sites offer on
   * first run.
   *
   * The witness exists to reject an element the user never typed into, because
   * such an element might be a decoy holding text while the real composer
   * holds something else. That question is undecidable from the DOM. It is not
   * undecidable for the PERSON LOOKING AT THE SCREEN, who can see whether the
   * text in front of them is the message they mean to send. So the block
   * becomes a question, and this records the answer.
   *
   * DELIBERATELY NOT `creditOwnWrite`. That method's contract is that it is
   * only ever called after a binding check has already passed, which is what
   * makes it unable to launder an unwitnessed element. This one is called
   * precisely when that check did NOT pass, so reusing the other would have
   * made its comment false and its guarantee unenforceable.
   *
   * The caller must have shown the user what is about to be sent and received
   * an explicit confirmation. It is called from exactly one place.
   */
  creditUserConfirmation(element: HTMLElement): void {
    this.witnessed.add(element);
  }
}

/**
 * One entry of a submit event's composed path, described structurally.
 *
 * Tags, attribute NAMES and a yes/no - never text, never attribute values.
 * The same rule the rest of the diagnostics follow, for the same reason: this
 * reaches a console and a bug report.
 */
export interface SubmitPathEntry {
  readonly tag: string;
  readonly attributes: readonly string[];
  readonly editable: boolean;
}

let lastPath: readonly SubmitPathEntry[] = [];
let lastPathAt = 0;

/**
 * Every submit intent raised this session, newest last.
 *
 * Bounded to 8. Answers a question no snapshot could: WHICH path produced the
 * refusal. On claude.ai a keyboard send was reported refused as `undecidable`,
 * which the key path cannot produce - when `originComposerOfKeyEvent` returns
 * null the adapters do not call back at all, so the event is never
 * intercepted. Either a second, button-shaped intent is being raised, or that
 * reasoning is wrong; this says which.
 */
const intents: { kind: string; resolved: boolean; atMs: number }[] = [];

export function recordIntent(kind: string, resolved: boolean): void {
  intents.push({ kind, resolved, atMs: Date.now() });
  if (intents.length > 8) intents.shift();
}

export function recentIntents(): readonly { kind: string; resolved: boolean; atMs: number }[] {
  return intents;
}

/**
 * The composed path of the most recent submit attempt.
 *
 * Exists because `undecidable` - "the submit event did not resolve to exactly
 * one editable element" - is a refusal with no evidence attached. It says the
 * path held no editable and nothing about what it DID hold, which is the only
 * thing that would let anyone write the fix. Live on claude.ai, 2026-09-02,
 * that refusal appeared on a page where `getComposer()` had already succeeded,
 * and there was no way to see why.
 *
 * Bounded, structural, and overwritten each attempt: it is a snapshot for the
 * next diagnostic, not a log.
 */
export function lastSubmitPath(): { entries: readonly SubmitPathEntry[]; atMs: number } {
  return { entries: lastPath, atMs: lastPathAt };
}

/** The nearest editable element on an event's composed path, if any. */
function editableOnPath(event: Event): HTMLElement | null {
  const path = event.composedPath();
  lastPathAt = Date.now();
  lastPath = path.slice(0, 14).map((node) => ({
    tag: node instanceof Element ? node.tagName.toLowerCase() : String((node as object).constructor.name),
    attributes: node instanceof Element ? Array.from(node.attributes).map((a) => a.name) : [],
    editable: isEditableSurface(node as Node),
  }));

  for (const node of path) {
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
 *
 * IT APPLIES THE FULL COMPOSER INVARIANTS, not merely `isEditableSurface`, and
 * that is load-bearing rather than tidiness. resolveUnique admits a candidate
 * only if it satisfies every invariant, so an aria-hidden measurement clone is
 * not a candidate there. If this function used a laxer rule it would see that
 * clone as a rival, return null, and the send would be blocked as
 * 'undecidable' — on a page where the resolver had just found the composer
 * without difficulty.
 *
 * The two admission rules must be the SAME rule. A divergence between them
 * does not fail loudly; it fails as a healthy page that cannot send, which
 * reads to a user as the extension being broken. Pinned by
 * `composer-region-clone` in both directions: an inert clone must not block,
 * and two genuine editables still must.
 */
/**
 * THE ONE ADMISSION RULE for "is this a composer candidate".
 *
 * Exported and named because it was being applied in one place and not
 * another, which is the defect this exists to prevent recurring.
 *
 * `isEditableSurface` alone is NOT this rule: it answers "can text be typed
 * here", which a zero-size `aria-hidden` decoy input satisfies perfectly well.
 * claude.ai carries five of them next to its real composer. Any code deciding
 * whether a region CONTAINS a composer must use this, or it will disagree with
 * the code that then tries to pick the composer out of that region.
 */
export function isAdmissibleComposer(element: Element): boolean {
  // Narrowed rather than cast: the invariants are declared over HTMLElement,
  // and a non-HTML element cannot be a composer anyway.
  if (!(element instanceof HTMLElement)) return false;
  return COMPOSER_INVARIANTS.every((invariant) => invariant.holds(element));
}

/**
 * What the uniqueness test saw, the last time it ran.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE THING THAT WAS NEVER CAPTURED. Every reading so far was taken
 * BEFORE or AFTER a refusal - a forced diagnostic run afterwards showed the
 * composer resolving perfectly, from both strategies, with healthCheck ok,
 * while the submit in between was refused for finding "not exactly one
 * editable element". Snapshots either side of the moment cannot explain the
 * moment.
 *
 * This records the decision AS IT IS MADE: how many candidates the region
 * held, how many were admissible, and for each rejection, which invariant
 * said no. Structure only - tags, attribute NAMES, invariant ids - never text
 * and never attribute values.
 * ─────────────────────────────────────────────────────────────────────────
 */
export interface RegionAdmissionTrace {
  readonly regionTag: string;
  readonly examined: number;
  readonly admitted: number;
  readonly rejected: readonly {
    readonly tag: string;
    readonly attributes: readonly string[];
    readonly failedInvariants: readonly string[];
  }[];
  readonly atMs: number;
}

let regionTrace: RegionAdmissionTrace | null = null;

/** The most recent region uniqueness decision. */
export function lastRegionAdmission(): RegionAdmissionTrace | null {
  return regionTrace;
}

export function editableWithinRegion(region: Element): HTMLElement | null {
  const editables: HTMLElement[] = [];
  const rejected: RegionAdmissionTrace['rejected'][number][] = [];
  const candidates = region.querySelectorAll<HTMLElement>('textarea, input, [contenteditable]');

  for (const element of candidates) {
    if (isAdmissibleComposer(element)) {
      editables.push(element);
      continue;
    }
    rejected.push({
      tag: element.tagName.toLowerCase(),
      attributes: Array.from(element.attributes).map((a) => a.name),
      failedInvariants: COMPOSER_INVARIANTS.filter((inv) => !inv.holds(element)).map((inv) => inv.id),
    });
  }

  regionTrace = {
    regionTag: region.tagName.toLowerCase(),
    examined: candidates.length,
    admitted: editables.length,
    rejected,
    atMs: Date.now(),
  };
  return editables.length === 1 ? (editables[0] as HTMLElement) : null;
}

/**
 * Derives the element a keyboard submit would send, from the event alone.
 *
 * DELIBERATELY USES THE LOOSE TEST, and this is not the inconsistency that
 * `isAdmissibleComposer` was introduced to fix. The two are different
 * questions:
 *
 *   - `composerRegionOf` / `editableWithinRegion` ask "which element IS the
 *     composer", and must agree with each other.
 *   - this asks "is this keystroke plausibly a send at all", and its answer
 *     decides whether the event is INTERCEPTED.
 *
 * Tightening this would be actively dangerous. When it returns null the
 * adapters do not call back at all, so the keystroke is never intercepted and
 * the PAGE SENDS - the one place in this system where a stricter check fails
 * OPEN rather than closed. A composer transiently failing an invariant must
 * still have its Enter intercepted; whether the send is then allowed is
 * `verifyBinding`'s decision, made with the strict rule.
 */
export function originComposerOfKeyEvent(event: KeyboardEvent): HTMLElement | null {
  const found = editableOnPath(event);
  recordIntent('key', found !== null);
  return found;
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
  if (clicked === undefined || !(clicked instanceof Element)) {
    recordIntent('button:no-target', false);
    return null;
  }
  const region = findRegion(clicked);
  if (region === null) {
    // No trace from editableWithinRegion in this case, because it never ran.
    // Distinguishing "no region" from "a region with the wrong contents" is
    // the whole point of recording it here.
    recordIntent('button:no-region', false);
    return null;
  }
  const found = editableWithinRegion(region);
  recordIntent('button', found !== null);
  return found;
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
