/**
 * The injected in-page surface.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE SURFACE, THREE CONTENTS — built that way on purpose.
 *
 * The review panel, the degraded state and the not-applicable state are the
 * same host with different contents, and all four M9 blockers close against
 * it. Building it around whichever landed first would have meant retrofitting
 * the other two into a shape chosen without them, so the state model
 * (surfaceState.ts) was written before any rendering.
 *
 * WHERE IT ATTACHES, and why not next to the composer. SPEC calls for "a
 * compact panel above the composer", which suggests inserting it into the
 * composer's parent. That is exactly where it would be destroyed: ProseMirror,
 * Quill and Angular all own those subtrees and reconcile foreign nodes away —
 * usually not immediately, which is worse, because it would work in testing
 * and vanish mid-session. So the host attaches to <body> and is POSITIONED
 * over the composer from its bounding rect.
 *
 * The host is also watched: if the page removes it anyway, it is re-attached —
 * a bounded number of times, and the surface reports when it gives up. A panel
 * that silently disappears leaves the extension believing it warned the user,
 * which is fail-open.
 *
 * THE ANCHOR IS BORROWED, NOT OWNED. The panel is positioned from an element
 * that belongs to the page, and on all three sites that element is replaced
 * out from under us — Gemini's SPA navigation and ChatGPT's conversation
 * switch both swap the composer for a fresh node. The surface therefore treats
 * the anchor as something that can die at any moment: it checks liveness
 * before every measurement, and reports the loss rather than silently
 * measuring a corpse. See `reposition`.
 *
 * SHADOW MODE IS CLOSED. Open would let the host page read the panel through
 * `element.shadowRoot`. The panel lists which ENTITY TYPES were found in the
 * user's text — never the values, but the classification is itself something
 * the page should not have, and the page is the party this extension exists to
 * withhold information from. Closed costs nothing: this class holds the root
 * reference, and assistive technology traverses closed roots regardless.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReviewContent, ReviewGroup, SurfaceState } from './surfaceState.js';
import { itemCount } from './surfaceState.js';
import { PANEL_STYLES } from './styles.js';
import { detectTheme, onSystemThemeChange } from './theme.js';

const HOST_TAG = 'privacyshield-surface';

/**
 * How many times the host may be re-attached after the page removes it.
 *
 * Unbounded re-attachment turns a page that removes unknown children on a
 * schedule into a mutation loop that never settles. Bounded, with the give-up
 * reported, the failure is loud instead.
 */
const MAX_REATTACHMENTS = 20;

/**
 * The narrowest the panel may be, whatever the composer's width.
 *
 * The panel carries a blocking decision. Matching a very narrow composer
 * exactly would produce a panel too narrow to read that decision in, which is
 * worse than a panel slightly wider than the thing it points at.
 */
const MIN_PANEL_WIDTH_PX = 240;

/** Gap between the panel and the composer, and the viewport inset. */
const MARGIN_PX = 8;

export interface SurfaceCallbacks {
  /** The user accepted the masking and wants the send to proceed. */
  readonly onConfirm: () => void;
  /** The user cancelled. The send must not proceed. */
  readonly onCancel: () => void;
  /** One detection was reverted or un-reverted. */
  readonly onToggleItem: (id: string) => void;
  /**
   * The anchor element left the document.
   *
   * The surface cannot re-resolve it — resolution belongs to the adapter — so
   * it reports the loss and the owner re-resolves and calls `setAnchor` again.
   * Meanwhile the panel stays visible at its fallback position: hiding a
   * blocking panel because its anchor moved would be fail-open.
   */
  readonly onAnchorLost?: () => void;
  /**
   * The host could not be kept in the document.
   *
   * The surface can no longer show anything. Whatever it was displaying — a
   * review decision, or a degraded warning — is now invisible to the user, so
   * the owner must treat this as a blocking failure.
   */
  readonly onSurfaceLost?: () => void;
}

export class Surface {
  private readonly document: Document;
  private readonly callbacks: SurfaceCallbacks;
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private panel: HTMLElement | null = null;
  private anchor: Element | null = null;
  private state: SurfaceState = { kind: 'hidden' };
  /** The kind rendered last, so focus moves on TRANSITIONS rather than paints. */
  private renderedKind: SurfaceState['kind'] = 'hidden';
  private detach: (() => void)[] = [];
  /** Restored when a blocking panel closes, so focus is not stranded. */
  private focusBeforeOpen: Element | null = null;
  private reattachments = 0;
  private frame: number | null = null;
  private usingTopLayer = false;

  constructor(doc: Document, callbacks: SurfaceCallbacks) {
    this.document = doc;
    this.callbacks = callbacks;
  }

  /** Creates the host and shadow root. Idempotent. */
  mount(): void {
    if (this.host !== null) return;

    const host = this.document.createElement(HOST_TAG);
    host.setAttribute('data-hidden', 'true');
    host.setAttribute('data-state', 'hidden');
    // Manual popover, so the panel renders in the TOP LAYER. Two things this
    // buys that a z-index cannot:
    //   - The containing block for a top-layer box is the viewport, so
    //     `position: fixed` keeps working even if the page puts a transform,
    //     filter, backdrop-filter, contain or will-change on <body> or <html>
    //     — any of which would otherwise make that ancestor the containing
    //     block and slide the panel away from the composer.
    //   - Top-layer boxes paint above every stacking context in the document,
    //     so a site modal cannot cover a blocking warning however high its
    //     z-index. 2147483000 loses to 2147483647; the top layer loses to
    //     nothing.
    // "manual" rather than "auto": auto popovers light-dismiss on an outside
    // click and close one another, and a panel that is blocking a send must
    // not disappear because the user clicked the page behind it.
    host.setAttribute('popover', 'manual');
    const root = host.attachShadow({ mode: 'closed' });

    const style = this.document.createElement('style');
    style.textContent = PANEL_STYLES;
    root.append(style);

    const panel = this.document.createElement('div');
    panel.className = 'panel';
    root.append(panel);

    this.document.body.append(host);
    this.host = host;
    this.root = root;
    this.panel = panel;

    this.listen();
  }

  /** Positions the panel relative to this element. */
  setAnchor(anchor: Element | null): void {
    // A detached element is not an anchor. Accepting one would defer the
    // discovery to the next measurement and then report the loss as if it had
    // just happened, when in fact the caller handed over a dead node.
    this.anchor = anchor !== null && anchor.isConnected ? anchor : null;
    this.reposition();
  }

  setState(next: SurfaceState): void {
    this.state = next;
    this.render();
  }

  destroy(): void {
    for (const off of this.detach) off();
    this.detach = [];
    const view = this.document.defaultView;
    if (this.frame !== null) view?.cancelAnimationFrame(this.frame);
    this.frame = null;
    // Focus must not be stranded inside a panel that is about to be removed:
    // if the host goes while the panel holds focus, the active element becomes
    // <body> and a keyboard user loses their place with no way back.
    this.restoreFocus();
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.panel = null;
    this.renderedKind = 'hidden';
    this.usingTopLayer = false;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private listen(): void {
    const schedule = (): void => this.scheduleReposition();
    // `capture` on scroll so a scrolling container inside the page still
    // moves the panel; scroll does not bubble.
    this.document.addEventListener('scroll', schedule, { capture: true, passive: true });
    const view = this.document.defaultView;
    view?.addEventListener('resize', schedule, { passive: true });
    this.detach.push(() => {
      this.document.removeEventListener('scroll', schedule, { capture: true });
      view?.removeEventListener('resize', schedule);
    });

    this.detach.push(onSystemThemeChange(this.document, () => this.applyTheme()));

    // Escape cancels a blocking panel. Bound on the shadow root so it only
    // fires while focus is inside the panel — a global Escape handler would
    // steal the key from the page.
    const onKeyDown = (event: Event): void => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Escape' && this.state.kind === 'review') {
        event.stopPropagation();
        this.callbacks.onCancel();
      }
    };
    this.root?.addEventListener('keydown', onKeyDown);
    this.detach.push(() => this.root?.removeEventListener('keydown', onKeyDown));

    const observer = new MutationObserver(() => this.ensureAttached());
    observer.observe(this.document.body, { childList: true });
    this.detach.push(() => observer.disconnect());
  }

  /** Re-attaches the host if the page removed it, up to the bound. */
  private ensureAttached(): void {
    const host = this.host;
    if (host === null || host.isConnected) return;

    if (this.reattachments >= MAX_REATTACHMENTS) {
      // Reported once, at the bound. Past this the surface is showing nothing
      // and cannot claim to have warned anyone.
      if (this.reattachments === MAX_REATTACHMENTS) {
        this.reattachments += 1;
        this.callbacks.onSurfaceLost?.();
      }
      return;
    }
    this.reattachments += 1;
    this.document.body.append(host);
    // Removal drops the element from the top layer, and re-inserting it does
    // not put it back. Without this the panel returns rendering BEHIND the
    // page it is warning about.
    this.usingTopLayer = false;
    if (this.isVisible()) this.showInTopLayer();
  }

  private isVisible(): boolean {
    const kind = this.state.kind;
    return kind === 'review' || kind === 'degraded' || kind === 'findings';
  }

  private applyTheme(): void {
    // A detached anchor has no computed style to sample, so pass null and let
    // the sampler start from <body> rather than walk a tree that is not in the
    // document.
    const anchor = this.anchor !== null && this.anchor.isConnected ? this.anchor : null;
    this.host?.setAttribute('data-theme', detectTheme(anchor, this.document));
  }

  /**
   * Coalesces repositions into one per frame.
   *
   * `reposition` reads two bounding rects, and a captured scroll listener
   * fires for every scrolling container on the page — on a chat log that is a
   * great many events per gesture, each forcing a synchronous layout of a page
   * we do not own. One measurement per frame is all a paint can use anyway.
   */
  private scheduleReposition(): void {
    if (this.frame !== null || !this.isVisible()) return;
    const view = this.document.defaultView;
    if (view === null) {
      this.reposition();
      return;
    }
    this.frame = view.requestAnimationFrame(() => {
      this.frame = null;
      this.reposition();
    });
  }

  private reposition(): void {
    const host = this.host;
    // Nothing is painted in `hidden` or `inactive`, and measuring for an
    // invisible panel is pure cost — the earlier version guarded only on
    // `hidden`, so every scroll event on an inactive page forced a layout.
    if (host === null || !this.isVisible()) return;

    // ── the borrowed anchor ──
    // The composer belongs to the page and the page replaces it: Gemini swaps
    // it on SPA navigation, ChatGPT on a conversation switch. A detached node
    // still answers getBoundingClientRect() — with all zeros — so measuring it
    // neither throws nor looks like an error. It quietly pins the panel to the
    // fallback position and keeps doing so forever, because nothing else would
    // ever notice the anchor had died.
    const anchor = this.anchor;
    if (anchor !== null && !anchor.isConnected) {
      this.anchor = null;
      this.callbacks.onAnchorLost?.();
    }

    const rect = this.anchor?.getBoundingClientRect();
    if (rect === undefined || (rect.width === 0 && rect.height === 0)) {
      // No usable anchor: bottom-centre of the viewport rather than 0,0 where
      // it would cover the page's own controls. The panel STAYS VISIBLE — it
      // may be blocking a send, and hiding it because we lost track of an
      // element would be fail-open.
      host.style.left = '50%';
      host.style.right = '';
      host.style.bottom = '16px';
      host.style.top = '';
      host.style.transform = 'translateX(-50%)';
      host.style.width = 'min(560px, calc(100vw - 32px))';
      return;
    }

    const view = this.document.defaultView;
    const viewportWidth = view?.innerWidth ?? rect.right;
    const viewportHeight = view?.innerHeight ?? rect.bottom;
    const margin = MARGIN_PX;

    host.style.transform = '';
    host.style.bottom = '';
    host.style.right = '';

    // Clamped to the viewport. A composer can be wider than the window (a
    // horizontally scrolled page) or start off its left edge, and a panel
    // positioned faithfully to it would then be partly unreachable — with no
    // scrollbar to reach it, because the host is fixed.
    const width = Math.max(MIN_PANEL_WIDTH_PX, Math.min(rect.width, viewportWidth - margin * 2));
    const left = Math.max(margin, Math.min(rect.left, viewportWidth - width - margin));
    host.style.left = `${Math.round(left)}px`;
    host.style.width = `${Math.round(width)}px`;

    // Above the composer, per SPEC, unless there is no room — then below, and
    // clamped so a tall panel below a composer near the fold is not pushed off
    // the bottom of the screen entirely.
    const panelHeight = this.panel?.getBoundingClientRect().height ?? 0;
    const above = rect.top - panelHeight - margin;
    const below = Math.min(rect.bottom + margin, Math.max(margin, viewportHeight - panelHeight - margin));
    host.style.top = `${Math.round(above >= margin ? above : below)}px`;
  }

  private render(): void {
    const host = this.host;
    const panel = this.panel;
    if (host === null || panel === null) return;

    // Captured so TypeScript can narrow it: `this.state` is mutable, so a
    // discriminant check on it does not survive to the next statement.
    const state = this.state;
    const previousKind = this.renderedKind;
    this.renderedKind = state.kind;

    panel.replaceChildren();
    // Semantics are RESET before the branch, not merely overwritten by it.
    // Each renderer used to set only the attributes it cared about, so
    // review -> degraded left `aria-label` and `role="dialog"` behind and the
    // alert was announced as the dialog's label, while review -> hidden left
    // `role="dialog"` on a display:none panel. An attribute the incoming state
    // does not set must not survive from the outgoing one.
    this.resetSemantics(panel);

    const hidden = state.kind === 'hidden' || state.kind === 'inactive';
    host.setAttribute('data-hidden', hidden ? 'true' : 'false');
    host.setAttribute('data-state', state.kind);

    // Focus is returned whenever the panel STOPS being the thing that took it,
    // not only when it hides. review -> degraded is a real transition out of a
    // blocking panel, and leaving focus on a panel whose contents were just
    // replaced by an alert strands the user inside a live region.
    if (previousKind === 'review' && state.kind !== 'review') this.restoreFocus();

    if (hidden) {
      // INACTIVE renders nothing at all, deliberately. The element is absent
      // by design; there is no problem to report and no action to offer, and
      // a badge saying "waiting" on every page load would be noise the user
      // learns to ignore — which is how a real warning gets missed later.
      this.hideFromTopLayer();
      return;
    }

    this.applyTheme();
    if (state.kind === 'review') this.renderReview(panel, state.content);
    else if (state.kind === 'findings') this.renderFindings(panel, state.content);
    else if (state.kind === 'degraded') {
      this.renderDegraded(panel, state.failures.map((failure) => failure.target));
    }
    this.showInTopLayer();
    this.reposition();
    // Only on the transition INTO review. Re-rendering after a toggle would
    // otherwise pull focus off the button the user just pressed, back to the
    // panel — so every revert would cost them their place in the list.
    if (state.kind === 'review' && previousKind !== 'review') this.takeFocus();
  }

  /**
   * Clears every ARIA attribute either renderer can set.
   *
   * Listed explicitly rather than derived from the element: a loop over
   * `panel.attributes` would also strip `class`, and "remove everything
   * beginning with aria-" is a rule that silently stops covering `role`.
   */
  private resetSemantics(panel: HTMLElement): void {
    for (const name of ['role', 'aria-modal', 'aria-label', 'aria-live', 'aria-atomic']) {
      panel.removeAttribute(name);
    }
    panel.removeAttribute('tabindex');
  }

  /**
   * Promotes the host into the top layer, and records whether it worked.
   *
   * Feature-detected AND verified: `showPopover` throws if the element is not
   * connected or is already showing, and `popover` is unsupported before
   * Chrome 114. The manifest's `minimum_chrome_version` is 116, so support is
   * the expected case — but the flag records what actually happened rather
   * than what should have, because the fallback (an ordinary fixed element at
   * a high z-index) is a real difference in behaviour.
   */
  private showInTopLayer(): void {
    const host = this.host as (HTMLElement & { showPopover?: () => void }) | null;
    if (host === null || this.usingTopLayer || typeof host.showPopover !== 'function') return;
    try {
      host.showPopover();
      this.usingTopLayer = true;
    } catch {
      // Already open, or not connected. Either way the stylesheet still
      // positions it; only the stacking guarantee is lost.
      this.usingTopLayer = false;
    }
  }

  private hideFromTopLayer(): void {
    const host = this.host as (HTMLElement & { hidePopover?: () => void }) | null;
    if (host === null || !this.usingTopLayer || typeof host.hidePopover !== 'function') return;
    try {
      host.hidePopover();
    } catch {
      // Not open. Nothing to undo.
    }
    this.usingTopLayer = false;
  }

  private renderReview(panel: HTMLElement, content: ReviewContent): void {
    // A blocking decision the user must answer, so it is a dialog. `aria-modal`
    // is false: focus is not trapped, because trapping it inside a panel
    // floating over someone's chat would take the page away from them.
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'PrivacyShield: review what will be masked before sending');
    panel.tabIndex = -1;

    const count = itemCount(content);
    panel.append(
      this.head(
        `${String(count)} item${count === 1 ? '' : 's'} to mask`,
        `exposure ${String(Math.round(content.exposureScore))}/100`,
      ),
    );
    this.appendGroups(panel, content);

    const actions = this.el('div', 'actions');
    const cancel = this.el('button', '') as HTMLButtonElement;
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => this.callbacks.onCancel());

    const send = this.el('button', 'primary') as HTMLButtonElement;
    send.type = 'button';
    send.textContent = 'Mask and send';
    send.addEventListener('click', () => this.callbacks.onConfirm());

    actions.append(cancel, send);
    panel.append(actions);
  }

  /**
   * What detection found, shown while the user types.
   *
   * NOT a dialog and NOT a live region. It appears and updates as someone
   * writes a message: `role="alert"` would interrupt them on every keystroke
   * that changed the count, and `role="dialog"` would announce a question that
   * is not being asked. A labelled region is what it is - content the user can
   * navigate to when they want it, announced when they get there.
   *
   * It does not take focus for the same reason. The user is mid-sentence.
   */
  private renderFindings(panel: HTMLElement, content: ReviewContent): void {
    const count = itemCount(content);
    panel.setAttribute('role', 'region');
    panel.setAttribute(
      'aria-label',
      `PrivacyShield: ${String(count)} sensitive item${count === 1 ? '' : 's'} detected in this message`,
    );

    panel.append(
      this.head(
        `${String(count)} item${count === 1 ? '' : 's'} detected`,
        `exposure ${String(Math.round(content.exposureScore))}/100`,
      ),
    );
    this.appendGroups(panel, content);

    // What this panel promises is now true, and the wording changed with the
    // gate rather than after it. It previously said sends were NOT
    // intercepted, which was the honest thing to say while that was the case;
    // leaving it there once the gate landed would have been the same failure
    // in the opposite direction - a panel whose text no longer describes what
    // the software does.
    const note = this.el('div', 'note');
    note.append(
      this.text(
        'div',
        'why',
        'When you send, these will be replaced and you will be asked to confirm first.',
      ),
    );
    panel.append(note);
  }

  private head(title: string, sub: string): HTMLElement {
    const head = this.el('div', 'head');
    head.append(this.text('span', 'title', title), this.text('span', 'sub', sub));
    return head;
  }

  /**
   * The grouped detection list. SPEC.md: "grouped by type".
   *
   * One list per group with its own heading, rather than one flat list with a
   * type column: a screen-reader user tabbing the panel hears the group name
   * once per group instead of once per row, and the count in each heading is
   * the thing that answers "how much of this is credentials".
   */
  private appendGroups(panel: HTMLElement, content: ReviewContent): void {
    const total = itemCount(content);
    let position = 0;
    for (const group of content.groups) {
      panel.append(this.renderGroup(group, () => (position += 1), total));
    }
  }

  private renderGroup(group: ReviewGroup, nextPosition: () => number, total: number): HTMLElement {
    const section = this.el('section', 'group');
    section.setAttribute('data-entity-type', group.entityType);

    const heading = this.text('h2', 'group-title', `${group.label} (${String(group.items.length)})`);
    const headingId = `ps-group-${group.entityType.toLowerCase()}`;
    heading.id = headingId;
    section.append(heading);

    const list = this.el('ul', 'items');
    // The list is labelled by its heading, so the group name is announced when
    // a screen reader enters the list rather than being repeated on every row.
    list.setAttribute('aria-labelledby', headingId);

    for (const item of group.items) {
      const position = nextPosition();
      const li = this.el('li', 'item');
      li.setAttribute('data-reverted', String(item.reverted));

      li.append(this.text('span', 'confidence', `${String(Math.round(item.confidence * 100))}%`));
      li.append(this.text('span', 'surrogate', item.surrogate));
      li.append(this.text('span', 'explanation', item.explanation));

      const toggle = this.el('button', 'link') as HTMLButtonElement;
      toggle.type = 'button';
      const action = item.reverted ? 'Mask this' : 'Keep original';
      toggle.textContent = action;
      // The accessible name STARTS with the visible text, per WCAG 2.5.3
      // (Label in Name), so speech input still activates the button by what is
      // written on it. The type and position are appended because five
      // detected email addresses otherwise produce five buttons with identical
      // names, and a screen-reader user reading the button list alone cannot
      // tell which one reverts which detection.
      toggle.setAttribute(
        'aria-label',
        `${action}: ${group.label}, item ${String(position)} of ${String(total)}`,
      );
      toggle.addEventListener('click', () => this.callbacks.onToggleItem(item.id));
      li.append(toggle);

      list.append(li);
    }
    section.append(list);
    return section;
  }

  private renderDegraded(panel: HTMLElement, targets: readonly string[]): void {
    // Not a dialog: there is nothing to answer. It is a live region so a
    // screen reader announces it when it appears without the user having to go
    // looking. `aria-atomic` because the message only makes sense whole —
    // announcing just the changed sentence would read out a list of element
    // names with no statement of what happened.
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'assertive');
    panel.setAttribute('aria-atomic', 'true');

    const box = this.el('div', 'degraded');
    box.append(
      this.text('div', 'title', 'PrivacyShield is not protecting this page'),
      this.text(
        'div',
        'why',
        "This site's layout changed, so the extension can no longer find the parts of the page it needs. Sends are blocked until it can.",
      ),
      this.text('div', 'why', `Could not find: ${targets.join(', ')}.`),
    );
    panel.append(box);
  }

  /**
   * Moves focus to the panel when a blocking state opens.
   *
   * Only for `review`, which demands an answer. The degraded state announces
   * itself through its live region and must NOT steal focus — it can appear
   * while the user is mid-sentence, and taking the caret away would be worse
   * than the problem it reports.
   */
  private takeFocus(): void {
    if (this.state.kind !== 'review') return;
    if (this.focusBeforeOpen === null) this.focusBeforeOpen = this.document.activeElement;
    // `preventScroll`: the host is fixed, but focusing it still asks the page
    // to scroll the element into view, and on a chat log that jumps the
    // conversation the user was reading.
    this.panel?.focus({ preventScroll: true });
  }

  private restoreFocus(): void {
    const previous = this.focusBeforeOpen;
    this.focusBeforeOpen = null;
    if (previous instanceof HTMLElement && previous.isConnected) {
      previous.focus({ preventScroll: true });
    }
  }

  private el(tag: string, className: string): HTMLElement {
    const node = this.document.createElement(tag);
    if (className.length > 0) node.className = className;
    return node;
  }

  /**
   * Builds a text node.
   *
   * `textContent`, never `innerHTML` — SPEC: "No innerHTML with any untrusted
   * content; construct nodes programmatically." Explanations and entity types
   * come from the detection pipeline rather than the page, but the rule is
   * kept absolute here so no future caller has to know which strings are safe.
   */
  private text(tag: string, className: string, value: string): HTMLElement {
    const node = this.el(tag, className);
    node.textContent = value;
    return node;
  }

  /** Test seam: the closed root is otherwise unreachable, by design. */
  shadowRootForTesting(): ShadowRoot | null {
    return this.root;
  }
}
