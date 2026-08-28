/**
 * Adapter for gemini.google.com.
 *
 * Built against the contract proven by claude.ts. Read `types.ts`'s header
 * first.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS DIFFERENT ABOUT THIS SITE
 *
 * 1. SHADOW DOM. Gemini is an Angular application built from custom elements,
 *    and the composer has lived inside a `<rich-textarea>` that may attach a
 *    shadow root. `document.querySelectorAll` does not descend into shadow
 *    roots, so a document-wide query can return NOTHING while the composer is
 *    plainly on screen — reported as 'not-found', blocking a healthy page.
 *    Every strategy here uses `deepQueryAll`, and `closestAcrossShadow` is
 *    used for the region walk so a send button inside a shadow root can still
 *    find its composer.
 *
 *    CLOSED shadow roots stay unreachable, deliberately. There is no supported
 *    way in, so the adapter reports 'not-found' and blocks. Loud is correct;
 *    what must never happen is silently resolving some other element because
 *    the real one was invisible to the query.
 *
 * 2. QUILL OWNS THE DOM. Like ProseMirror, it reconciles the DOM against an
 *    internal model, and the model is what gets submitted. The shared
 *    execCommand-based write in text.ts is what it accepts; a textContent
 *    assignment would be reverted, which writeAndVerify would then catch.
 *
 * 3. THE SEND BUTTON IS AN ICON. Gemini's send control has carried no stable
 *    test id in some builds, and its accessible name is localised. The
 *    locale-independent markers come first; an English aria-label match exists
 *    only as a last resort, at the weakest tier, with its limitation stated —
 *    because a send control that only matches in English is a send control
 *    that silently fails for most of the world.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type {
  ComposerHandle,
  ElementHandle,
  ElementStrategy,
  HealthReport,
  HealthWarning,
  Resolution,
  ResolutionFailure,
  ResponseStreamEvent,
  SiteAdapter,
  SubmitIntent,
  WriteResult,
} from './types.js';
import { COMPOSER_INVARIANTS, RESPONSE_ROOT_INVARIANTS, isEditableSurface } from './invariants.js';
import { resolveUnique, writeAndVerify } from './resolve.js';
import { readEditableText, writeEditableText } from './text.js';
import { closestAcrossShadow, deepQueryAll } from './deep.js';
import type { InputWitness } from './binding.js';
import { originComposerOfButtonEvent, originComposerOfKeyEvent } from './binding.js';
import { collectChangedTextNodes } from './stream.js';

/**
 * Conversation id.
 *
 * The optional `/u/<n>` prefix is Google's multi-account routing, which the
 * other two sites have no equivalent of. Without it, every conversation in any
 * account but the first would report a null id.
 */
const CONVERSATION_PATH = /^(?:\/u\/\d+)?\/app\/((?:c_)?[0-9a-fA-F]{12,})\/?$/u;

const EDITABLE_SELECTOR = 'textarea, input, [contenteditable]';

/** Locale-independent send markers, strongest first. */
const SEND_BUTTON_SELECTOR = [
  'button[data-test-id="send-button"]',
  'button[data-testid="send-button"]',
  'button.send-button',
].join(', ');

/**
 * A Material icon named "send" inside a button. Locale-independent, and the
 * marker that survives when the test id is dropped.
 */
const SEND_ICON_SELECTOR = 'mat-icon[fonticon="send"], mat-icon[data-mat-icon-name="send"]';

/**
 * Whether a control submits the composer.
 *
 * Ordered: locale-independent markers first, and the English aria-label only
 * when nothing else matched anywhere on the page. Matching an English label
 * value is exactly what the contract warns against, so it is quarantined here
 * rather than mixed into the selector list, and `healthCheck` reports when it
 * is the only thing working.
 */
function findSendButtons(root: ParentNode): { buttons: HTMLElement[]; usedEnglishFallback: boolean } {
  const byMarker = deepQueryAll<HTMLElement>(root, SEND_BUTTON_SELECTOR);
  const byIcon = deepQueryAll<HTMLElement>(root, SEND_ICON_SELECTOR)
    .map((icon) => closestAcrossShadow(icon, 'button'))
    .filter((el): el is HTMLElement => el instanceof HTMLElement);

  const found: HTMLElement[] = [];
  for (const button of [...byMarker, ...byIcon]) {
    if (!found.includes(button)) found.push(button);
  }
  if (found.length > 0) return { buttons: found, usedEnglishFallback: false };

  const english = deepQueryAll<HTMLElement>(root, 'button[aria-label="Send message" i]');
  return { buttons: english, usedEnglishFallback: english.length > 0 };
}

export const GEMINI_COMPOSER_STRATEGIES: readonly ElementStrategy<HTMLElement>[] = [
  {
    id: 'gemini/composer-role-textbox',
    tier: 'attribute',
    assumes:
      'The composer is a contenteditable carrying role="textbox" and aria-multiline="true". Both are set by the editor for accessibility rather than by page markup, and both are locale-independent. Searched across open shadow roots.',
    find: (root) =>
      deepQueryAll<HTMLElement>(root, '[contenteditable][role="textbox"][aria-multiline="true"]').filter(
        isEditableSurface,
      ),
  },
  {
    id: 'gemini/composer-multiline-labelled',
    tier: 'attribute',
    assumes:
      'The composer is a contenteditable with aria-multiline="true" and an aria-label. Only the PRESENCE of the label is used, never its value, so it holds in every locale.',
    find: (root) =>
      deepQueryAll<HTMLElement>(root, '[contenteditable][aria-multiline="true"][aria-label]').filter(
        isEditableSurface,
      ),
  },
  {
    id: 'gemini/composer-in-rich-textarea',
    tier: 'structural',
    assumes:
      'The composer is the single editable surface inside a <rich-textarea> custom element. Depends on the element name and containment rather than on any attribute, so it survives attribute renames.',
    find: (root) => {
      const found: HTMLElement[] = [];
      for (const host of deepQueryAll(root, 'rich-textarea')) {
        for (const candidate of deepQueryAll<HTMLElement>(host, EDITABLE_SELECTOR)) {
          if (isEditableSurface(candidate) && !found.includes(candidate)) found.push(candidate);
        }
      }
      return found;
    },
  },
  {
    id: 'gemini/composer-in-send-region',
    tier: 'structural',
    assumes:
      'The composer and its send control share a bounded container. Anchors on the locale-independent send markers, walks up across shadow boundaries, then takes the editables inside.',
    find: (root) => {
      const found: HTMLElement[] = [];
      for (const button of findSendButtons(root).buttons) {
        const region = composerRegionOf(button);
        if (region === null) continue;
        for (const candidate of deepQueryAll<HTMLElement>(region, EDITABLE_SELECTOR)) {
          if (isEditableSurface(candidate) && !found.includes(candidate)) found.push(candidate);
        }
      }
      return found;
    },
  },
  {
    id: 'gemini/composer-ql-editor',
    tier: 'class',
    assumes:
      'The composer is a Quill editor and carries the library\'s own .ql-editor class. Last resort: a class name, but library-owned rather than a generated utility class.',
    find: (root) =>
      deepQueryAll<HTMLElement>(root, 'div.ql-editor[contenteditable]').filter(isEditableSurface),
  },
];

export const GEMINI_RESPONSE_STRATEGIES: readonly ElementStrategy[] = [
  {
    id: 'gemini/response-main',
    tier: 'attribute',
    assumes:
      'The transcript lives inside the single main landmark. Required for accessibility, so unusually durable.',
    find: (root) => deepQueryAll(root, 'main, [role="main"]'),
  },
  {
    id: 'gemini/response-chat-window',
    tier: 'structural',
    assumes:
      'The transcript is the <chat-window> custom element. Deliberately NOT model-response or message-content: those match once per turn, which would be ambiguity on every conversation with more than one reply.',
    find: (root) => deepQueryAll(root, 'chat-window'),
  },
];

/**
 * The container holding both the composer and its send control.
 *
 * Climbs across open shadow boundaries, because a send button inside a shadow
 * root would otherwise appear to have no region at all and the button path of
 * the submit binding would report every pointer send undecidable.
 */
export function composerRegionOf(from: Element): Element | null {
  let node: Element | null = from;
  let hops = 0;
  while (node !== null && hops < 10) {
    if (
      deepQueryAll(node, SEND_BUTTON_SELECTOR).length + deepQueryAll(node, SEND_ICON_SELECTOR).length > 0 &&
      deepQueryAll(node, EDITABLE_SELECTOR).length > 0
    ) {
      return node;
    }
    const parent: Element | null = node.parentElement;
    if (parent !== null) {
      node = parent;
    } else {
      const root = node.getRootNode();
      node = root instanceof ShadowRoot ? root.host : null;
    }
    hops += 1;
  }
  return null;
}

export class GeminiAdapter implements SiteAdapter {
  readonly id = 'gemini' as const;
  readonly displayName = 'Gemini';

  private readonly document: Document;
  private readonly witness: InputWitness;

  constructor(doc: Document, witness: InputWitness) {
    this.document = doc;
    this.witness = witness;
  }

  matches(url: string): boolean {
    try {
      return new URL(url).hostname === 'gemini.google.com';
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.document.readyState !== 'loading' && this.getComposer().ok;
  }

  getComposer(): Resolution<ComposerHandle> {
    return resolveUnique('composer', this.document, GEMINI_COMPOSER_STRATEGIES, COMPOSER_INVARIANTS);
  }

  getComposerText(handle: ComposerHandle): string {
    return readEditableText(handle.node);
  }

  setComposerText(handle: ComposerHandle, text: string): WriteResult {
    const result = writeAndVerify(handle, text, writeEditableText, readEditableText);
    if (result.ok) this.witness.creditOwnWrite(handle.node);
    return result;
  }

  onSubmitIntent(callback: (intent: SubmitIntent) => void): () => void {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      const origin = originComposerOfKeyEvent(event);
      if (origin === null) return;
      callback({
        kind: 'key',
        event,
        originComposer: origin,
        suppress: () => {
          event.preventDefault();
          event.stopPropagation();
        },
      });
    };

    const onClick = (event: MouseEvent): void => {
      const target = event.composedPath()[0];
      if (!(target instanceof Element)) return;
      const sendButtons = findSendButtons(this.document).buttons;
      const clickedSend = sendButtons.some((button) => button === target || button.contains(target));
      if (!clickedSend) return;
      callback({
        kind: 'button',
        event,
        originComposer: originComposerOfButtonEvent(event, composerRegionOf),
        suppress: () => {
          event.preventDefault();
          event.stopPropagation();
        },
      });
    };

    this.document.addEventListener('keydown', onKeyDown, { capture: true });
    this.document.addEventListener('click', onClick, { capture: true });
    return () => {
      this.document.removeEventListener('keydown', onKeyDown, { capture: true });
      this.document.removeEventListener('click', onClick, { capture: true });
    };
  }

  getConversationId(): string | null {
    return CONVERSATION_PATH.exec(this.document.location.pathname)?.[1] ?? null;
  }

  getResponseRoot(): Resolution<ElementHandle> {
    return resolveUnique(
      'response-root',
      this.document,
      GEMINI_RESPONSE_STRATEGIES,
      RESPONSE_ROOT_INVARIANTS,
    );
  }

  observeResponseStream(callback: (event: ResponseStreamEvent) => void): () => void {
    const root = this.getResponseRoot();
    if (!root.ok) return () => undefined;
    const target = root.value.node;
    const observer = new MutationObserver((records) => {
      const changed = collectChangedTextNodes(records);
      if (changed.length > 0) callback({ root: target, changedTextNodes: changed });
    });
    observer.observe(target, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }

  healthCheck(): HealthReport {
    const failures: ResolutionFailure[] = [];
    const warnings: HealthWarning[] = [];

    const composer = this.getComposer();
    if (composer.ok) {
      if (composer.value.tier !== 'attribute') {
        warnings.push({
          target: 'composer',
          tier: composer.value.tier,
          detail:
            `The composer was found only at the '${composer.value.tier}' tier by '${composer.value.strategyId}'. ` +
            'Detection still works, but the strongest strategies no longer match, which usually means the site changed.',
        });
      }
    } else {
      failures.push(composer.failure);
    }

    const responseRoot = this.getResponseRoot();
    if (!responseRoot.ok) failures.push(responseRoot.failure);

    const send = findSendButtons(this.document);
    if (send.buttons.length === 0) {
      failures.push({
        kind: 'not-found',
        target: 'send-button',
        detail: 'No send control matched, so pointer sends would be undecidable.',
        triedStrategies: ['gemini/send-button'],
      });
    } else if (send.usedEnglishFallback) {
      // Reported as a warning rather than swallowed: on a non-English UI this
      // path matches nothing, so a developer testing in English would see a
      // healthy adapter that is broken for most of the world.
      warnings.push({
        target: 'send-button',
        tier: 'class',
        detail:
          'The send control matched only via its English aria-label. Every locale-independent marker is gone, so pointer sends will fail entirely on a non-English UI.',
      });
    }

    return { ok: failures.length === 0, failures, warnings, checkedAt: Date.now() };
  }
}
