/**
 * The SiteAdapter contract.
 *
 * SPEC.md: "Shared SiteAdapter interface: matches(url), isReady(),
 * getComposer(), getComposerText(), setComposerText(text), onSubmitIntent(cb),
 * getConversationId(), getResponseRoot(), observeResponseStream(cb),
 * healthCheck() -> { ok, failures[] }"
 *
 * SPEC.md: "Silent failure is the worst possible outcome and must be
 * impossible by construction."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE FAILURE THIS DESIGN IS AGAINST
 *
 * The dangerous case is NOT a selector that finds nothing. That is loud: the
 * resolution fails, healthCheck reports it, the extension degrades visibly and
 * blocks. It is the case everyone designs for.
 *
 * The dangerous case is a selector that finds the WRONG element — a
 * composer-shaped editable div that is not the one the site submits. Detection
 * runs on it and finds nothing, because the user's text is elsewhere. The
 * health check passes, because an element WAS found and it looks right. The
 * user presses Enter and the real composer's unmasked text is sent. Every
 * component reports success and the data leaks. A test cannot catch this,
 * because the test would have to already know which element is correct — which
 * is exactly the thing in question.
 *
 * FOUR INDEPENDENT CONSTRUCTIONS defend against it. They are independent on
 * purpose: an error in any one of them is caught by another, so no single
 * mistake produces a silent leak.
 *
 *   1. AMBIGUITY IS A FAILURE, NOT A CHOICE (resolve.ts). Within a strategy
 *      tier, matching two or more distinct nodes is a hard failure with no
 *      fall-through. A composer-shaped decoy almost always presents as a
 *      SECOND match, and the system that guesses between two candidates is
 *      precisely the system that eventually guesses wrong.
 *
 *   2. IDENTITY BINDING AT SUBMIT (binding.ts). The element detection ran on
 *      must be the same NODE (===) as the element the submit event resolves
 *      to. The submit element is derived from the real user event via
 *      composedPath(), never from a selector, so a wrong getComposer() yields
 *      a mismatch and blocks. This is the load-bearing one: it does not
 *      depend on any selector being right.
 *
 *   3. THE INPUT WITNESS (binding.ts). An element may only be bound if it has
 *      actually received user input during this page session. A decoy the user
 *      never typed into cannot be bound, however composer-shaped it looks.
 *
 *   4. VERIFIED WRITES (resolve.ts). setComposerText re-reads what it wrote
 *      and reports failure if it did not stick. Read/write asymmetry is the
 *      usual symptom of writing into the wrong node, or into a
 *      framework-controlled node the wrong way, and it cannot pass silently.
 *
 * Every operation that can fail returns a Resolution rather than a nullable
 * element, so a caller cannot reach the element without passing through the
 * failure case first.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type SiteId = 'chatgpt' | 'claude' | 'gemini';

/**
 * SPEC.md: "For every element define an ordered strategy list: stable
 * attributes first (data-testid, role, aria-label, contenteditable), then
 * structural heuristics, then class names last."
 *
 * Tiers are ordered by how likely they are to survive a redesign. Class names
 * come last because on all three target sites they are generated build
 * artefacts that change without any user-visible change.
 */
export type StrategyTier = 'attribute' | 'structural' | 'class';

/** Tier order, exported so the resolver and the health report cannot disagree. */
export const TIER_ORDER: readonly StrategyTier[] = ['attribute', 'structural', 'class'];

export interface ElementStrategy<E extends Element = Element> {
  readonly id: string;
  readonly tier: StrategyTier;
  /**
   * The page structure this strategy assumes, in prose. Read when it breaks: a
   * strategy whose assumption is undocumented cannot be repaired by anyone but
   * its original author, and site breakage is exactly when that author is not
   * available.
   */
  readonly assumes: string;
  find(root: ParentNode): readonly E[];
}

/**
 * A property that must hold of a resolved element.
 *
 * Invariants turn "an element was found" into "the right KIND of element was
 * found". They are checked after resolution; a candidate failing any invariant
 * is discarded rather than used.
 */
export interface Invariant<E extends Element = Element> {
  readonly id: string;
  readonly requirement: string;
  holds(element: E): boolean;
}

export type ResolutionFailureKind =
  /** No tier produced any candidate. The site changed, or the page is not ready. */
  | 'not-found'
  /** A tier matched two or more distinct nodes. Never guess between them. */
  | 'ambiguous'
  /** Candidates were found but none satisfied the invariants. */
  | 'invariant'
  /** Resolved earlier, but the node has since left the document. */
  | 'detached';

export interface ResolutionFailure {
  readonly kind: ResolutionFailureKind;
  /** Which element was being looked for, e.g. 'composer'. */
  readonly target: string;
  /**
   * Operator-facing explanation. Never contains page text: a failure report
   * that quotes the composer would leak the very content this extension
   * exists to protect, and these strings reach logs and the UI.
   */
  readonly detail: string;
  readonly triedStrategies: readonly string[];
}

export type Resolution<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ResolutionFailure };

/**
 * A resolved element plus the provenance of its resolution.
 *
 * Handles are opaque by convention rather than by type: `node` is readable
 * because the content script must position UI relative to it. The guarantee
 * this type carries is not "you cannot touch the node" but "you cannot have
 * obtained this node without passing an ambiguity check and an invariant
 * check, and we recorded which strategy produced it".
 */
export interface ElementHandle<E extends Element = Element> {
  readonly node: E;
  readonly target: string;
  readonly tier: StrategyTier;
  readonly strategyId: string;
}

export type ComposerHandle = ElementHandle<HTMLElement>;

export type WriteFailureReason =
  /** The handle's node is no longer in the document. */
  | 'detached'
  /** The write completed but reading the value back did not return it. */
  | 'readback-mismatch'
  /** The element rejected the write outright. */
  | 'rejected';

export type WriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: WriteFailureReason; readonly detail: string };

/**
 * A user action that would send the composer's contents.
 *
 * `originComposer` is derived from the event — from composedPath() for key
 * events, from the clicked control's own composer region for pointer events —
 * and never from a document-wide selector. That independence is what makes it
 * usable as a check ON getComposer() rather than a restatement of it.
 */
export interface SubmitIntent {
  readonly kind: 'key' | 'button';
  readonly event: Event;
  /** The editable node this event would actually submit, or null if undecidable. */
  readonly originComposer: HTMLElement | null;
  /** Prevents the host page from acting on the event. */
  suppress(): void;
}

export interface ResponseStreamEvent {
  readonly root: Element;
  /** Text nodes added or mutated since the previous event. */
  readonly changedTextNodes: readonly Text[];
}

/** Resolved, but only by a tier weaker than the strongest one declared. */
export interface HealthWarning {
  readonly target: string;
  readonly tier: StrategyTier;
  readonly detail: string;
}

/** SPEC.md: "healthCheck() -> { ok, failures[] }" */
export interface HealthReport {
  readonly ok: boolean;
  readonly failures: readonly ResolutionFailure[];
  readonly warnings: readonly HealthWarning[];
  readonly checkedAt: number;
}

export interface SiteAdapter {
  readonly id: SiteId;
  readonly displayName: string;

  matches(url: string): boolean;
  isReady(): boolean;

  getComposer(): Resolution<ComposerHandle>;
  getComposerText(handle: ComposerHandle): string;
  setComposerText(handle: ComposerHandle, text: string): WriteResult;

  /** Returns an unsubscribe function. */
  onSubmitIntent(callback: (intent: SubmitIntent) => void): () => void;

  getConversationId(): string | null;
  getResponseRoot(): Resolution<ElementHandle>;
  /** Returns an unsubscribe function. */
  observeResponseStream(callback: (event: ResponseStreamEvent) => void): () => void;

  healthCheck(): HealthReport;
}
