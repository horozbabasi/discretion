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
 * over the composer from its bounding rect. Fixed positioning, recomputed on
 * scroll and resize.
 *
 * The host is also watched: if the page removes it anyway, it is re-attached.
 * A panel that silently disappears would leave the extension believing it had
 * warned the user.
 *
 * SHADOW MODE IS CLOSED. Open would let the host page read the panel through
 * `element.shadowRoot`. The panel lists which ENTITY TYPES were found in the
 * user's text — never the values, but the classification is itself something
 * the page should not have, and the page is the party this extension exists to
 * withhold information from. Closed costs nothing: this class holds the root
 * reference, and assistive technology traverses closed roots regardless.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReviewContent, SurfaceState } from './surfaceState.js';
import { PANEL_STYLES } from './styles.js';
import { detectTheme, onSystemThemeChange } from './theme.js';

const HOST_TAG = 'privacyshield-surface';

export interface SurfaceCallbacks {
  /** The user accepted the masking and wants the send to proceed. */
  readonly onConfirm: () => void;
  /** The user cancelled. The send must not proceed. */
  readonly onCancel: () => void;
  /** One detection was reverted or un-reverted. */
  readonly onToggleItem: (id: string) => void;
}

export class Surface {
  private readonly document: Document;
  private readonly callbacks: SurfaceCallbacks;
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private panel: HTMLElement | null = null;
  private anchor: Element | null = null;
  private state: SurfaceState = { kind: 'hidden' };
  private detach: (() => void)[] = [];
  /** Restored when a blocking panel closes, so focus is not stranded. */
  private focusBeforeOpen: Element | null = null;

  constructor(doc: Document, callbacks: SurfaceCallbacks) {
    this.document = doc;
    this.callbacks = callbacks;
  }

  /** Creates the host and shadow root. Idempotent. */
  mount(): void {
    if (this.host !== null) return;

    const host = this.document.createElement(HOST_TAG);
    host.setAttribute('data-hidden', 'true');
    // The host is ours; nothing about it should be reachable as page content.
    host.setAttribute('aria-hidden', 'false');
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
    this.anchor = anchor;
    this.reposition();
  }

  setState(next: SurfaceState): void {
    this.state = next;
    this.render();
  }

  destroy(): void {
    for (const off of this.detach) off();
    this.detach = [];
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.panel = null;
  }

  // ── internals ──────────────────────────────────────────────────────────

  private listen(): void {
    const reposition = (): void => this.reposition();
    // `capture` on scroll so a scrolling container inside the page still
    // moves the panel; scroll does not bubble.
    this.document.addEventListener('scroll', reposition, { capture: true, passive: true });
    const view = this.document.defaultView;
    view?.addEventListener('resize', reposition, { passive: true });
    this.detach.push(() => {
      this.document.removeEventListener('scroll', reposition, { capture: true });
      view?.removeEventListener('resize', reposition);
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

    // Re-attach if the page removes the host. A panel that silently vanished
    // would leave the extension believing it had warned the user.
    const observer = new MutationObserver(() => {
      if (this.host !== null && !this.host.isConnected) this.document.body.append(this.host);
    });
    observer.observe(this.document.body, { childList: true });
    this.detach.push(() => observer.disconnect());
  }

  private applyTheme(): void {
    this.host?.setAttribute('data-theme', detectTheme(this.anchor, this.document));
  }

  private reposition(): void {
    const host = this.host;
    if (host === null || this.state.kind === 'hidden') return;

    const rect = this.anchor?.getBoundingClientRect();
    if (rect === undefined || (rect.width === 0 && rect.height === 0)) {
      // No usable anchor: fall back to the bottom-centre of the viewport
      // rather than positioning at 0,0 where it would cover the page's own
      // controls.
      host.style.left = '50%';
      host.style.bottom = '16px';
      host.style.top = '';
      host.style.transform = 'translateX(-50%)';
      host.style.width = 'min(560px, calc(100vw - 32px))';
      return;
    }
    host.style.transform = '';
    host.style.bottom = '';
    host.style.left = `${Math.round(rect.left)}px`;
    host.style.width = `${Math.round(rect.width)}px`;
    // Above the composer, per SPEC, unless there is no room — then below.
    const panelHeight = this.panel?.getBoundingClientRect().height ?? 0;
    const above = rect.top - panelHeight - 8;
    host.style.top = above >= 8 ? `${Math.round(above)}px` : `${Math.round(rect.bottom + 8)}px`;
  }

  private render(): void {
    const host = this.host;
    const panel = this.panel;
    if (host === null || panel === null) return;

    // Captured so TypeScript can narrow it: `this.state` is mutable, so a
    // discriminant check on it does not survive to the next statement.
    const state = this.state;
    panel.replaceChildren();
    const hidden = state.kind === 'hidden' || state.kind === 'inactive';
    host.setAttribute('data-hidden', hidden ? 'true' : 'false');

    if (hidden) {
      // INACTIVE renders nothing at all, deliberately. The element is absent
      // by design; there is no problem to report and no action to offer, and
      // a badge saying "waiting" on every page load would be noise the user
      // learns to ignore — which is how a real warning gets missed later.
      this.restoreFocus();
      return;
    }

    this.applyTheme();
    if (state.kind === 'review') this.renderReview(panel, state.content);
    else if (state.kind === 'degraded') {
      this.renderDegraded(panel, state.failures.map((failure) => failure.target));
    }
    this.reposition();
    this.takeFocus();
  }

  private renderReview(panel: HTMLElement, content: ReviewContent): void {
    // A blocking decision the user must answer, so it is a dialog. `aria-modal`
    // is false: focus is not trapped, because trapping it inside a panel
    // floating over someone's chat would take the page away from them.
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'PrivacyShield: review what will be masked before sending');
    panel.tabIndex = -1;

    const head = this.el('div', 'head');
    head.append(
      this.text('span', 'title', `${content.items.length} item${content.items.length === 1 ? '' : 's'} to mask`),
      this.text('span', 'sub', `exposure ${Math.round(content.exposureScore)}/100`),
    );
    panel.append(head);

    const list = this.el('ul', 'items');
    for (const item of content.items) {
      const li = this.el('li', 'item');
      li.setAttribute('data-reverted', String(item.reverted));

      li.append(this.text('span', 'type', item.entityType));
      li.append(this.text('span', 'confidence', `${Math.round(item.confidence * 100)}%`));
      li.append(this.text('span', 'explanation', item.explanation));
      li.append(this.text('span', 'surrogate', item.surrogate));

      const toggle = this.el('button', 'link') as HTMLButtonElement;
      toggle.type = 'button';
      toggle.textContent = item.reverted ? 'Mask this' : 'Keep original';
      // The button's own label changes, so it needs no aria-pressed; what it
      // does is what it says.
      toggle.setAttribute(
        'aria-label',
        `${item.reverted ? 'Mask' : 'Keep original'} ${item.entityType}`,
      );
      toggle.addEventListener('click', () => this.callbacks.onToggleItem(item.id));
      li.append(toggle);

      list.append(li);
    }
    panel.append(list);

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

  private renderDegraded(panel: HTMLElement, targets: readonly string[]): void {
    // Not a dialog: there is nothing to answer. It is a live region so a
    // screen reader announces it when it appears without the user having to
    // go looking.
    panel.setAttribute('role', 'alert');
    panel.setAttribute('aria-live', 'assertive');
    panel.removeAttribute('aria-modal');
    panel.tabIndex = -1;

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
    this.panel?.focus();
  }

  private restoreFocus(): void {
    const previous = this.focusBeforeOpen;
    this.focusBeforeOpen = null;
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
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
