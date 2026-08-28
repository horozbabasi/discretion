/**
 * Adapter for claude.ai — the reference implementation.
 *
 * Written first and alone, before chatgpt.ts and gemini.ts, so that the shape
 * every later adapter copies is one that has been through a real site rather
 * than designed in the abstract.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON THE SELECTORS BELOW, STATED PLAINLY
 *
 * Every strategy carries an `assumes` string describing the page structure it
 * depends on. Those assumptions are drawn from claude.ai's markup as observed,
 * and they WILL rot — SPEC calls selector resilience the highest-risk area and
 * it is right. Nothing here treats them as reliable.
 *
 * What makes that acceptable is that a rotted selector in this file cannot
 * produce a silent leak. It produces one of exactly three loud outcomes:
 * nothing matches (healthCheck fails, sends blocked), two things match
 * (ambiguity, sends blocked), or something wrong matches and the submit-time
 * identity binding rejects it (send blocked). The selectors are the part of
 * this system allowed to be wrong; binding.ts is the part that is not.
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
import type { InputWitness } from './binding.js';
import { originComposerOfButtonEvent, originComposerOfKeyEvent } from './binding.js';

const CONVERSATION_PATH = /^\/chat\/([0-9a-fA-F-]{16,})/;

function queryAll<E extends Element>(root: ParentNode, selector: string): readonly E[] {
  return Array.from(root.querySelectorAll<E>(selector));
}

/**
 * Composer strategies, strongest tier first.
 *
 * Note what is NOT here: nothing keys on the English placeholder text ("Write
 * your prompt to Claude"). claude.ai is localised, so a text-matching strategy
 * would silently fail for every non-English user — the exact class of bug that
 * is invisible to an English-speaking developer testing on their own machine.
 */
export const CLAUDE_COMPOSER_STRATEGIES: readonly ElementStrategy<HTMLElement>[] = [
  {
    id: 'claude/composer-role-textbox',
    tier: 'attribute',
    assumes:
      'The composer is a contenteditable element carrying role="textbox". Locale-independent and set by the editor library rather than by page markup, which is why it leads.',
    find: (root) => queryAll<HTMLElement>(root, '[contenteditable="true"][role="textbox"]'),
  },
  {
    id: 'claude/composer-testid',
    tier: 'attribute',
    assumes:
      'A data-testid on or around the chat input marks the composer. Test ids are maintained for the site\'s own test suite, so they survive visual redesigns that break class names.',
    find: (root) =>
      queryAll<HTMLElement>(
        root,
        '[data-testid="chat-input"][contenteditable="true"], [data-testid="chat-input"] [contenteditable="true"]',
      ),
  },
  {
    id: 'claude/composer-in-send-region',
    tier: 'structural',
    assumes:
      'The composer and its send button share a container. Finds the send button first, then the single editable element beside it. Depends on layout relationships rather than on any name, so it survives renames.',
    find: (root) => {
      const buttons = queryAll<HTMLElement>(root, SEND_BUTTON_SELECTOR);
      const found: HTMLElement[] = [];
      for (const button of buttons) {
        const region = composerRegionOf(button);
        if (region === null) continue;
        for (const candidate of queryAll<HTMLElement>(region, EDITABLE_SELECTOR)) {
          if (isEditableSurface(candidate) && !found.includes(candidate)) found.push(candidate);
        }
      }
      return found;
    },
  },
  {
    id: 'claude/composer-prosemirror',
    tier: 'class',
    assumes:
      'The composer is a ProseMirror editor and carries the library\'s own .ProseMirror class. Last resort: it is a class name, but a library-owned one rather than a generated utility class, so it is the least bad member of the weakest tier.',
    find: (root) => queryAll<HTMLElement>(root, 'div.ProseMirror[contenteditable="true"]'),
  },
];

const EDITABLE_SELECTOR = 'textarea, input, [contenteditable="true"]';

const SEND_BUTTON_SELECTOR = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send message" i]',
  'button[aria-label="Send Message" i]',
  'button[type="submit"]',
].join(', ');

export const CLAUDE_RESPONSE_STRATEGIES: readonly ElementStrategy[] = [
  {
    id: 'claude/response-main',
    tier: 'attribute',
    assumes:
      'The conversation transcript lives inside the document\'s single <main> landmark. An ARIA landmark is required for accessibility, so it is unusually durable.',
    find: (root) => queryAll(root, 'main'),
  },
  {
    id: 'claude/response-log-role',
    tier: 'attribute',
    assumes: 'The transcript region is marked role="log" or aria-live for screen readers.',
    find: (root) => queryAll(root, '[role="log"], [aria-live="polite"][data-testid]'),
  },
];

/**
 * The container holding both the composer and its send button.
 *
 * Walks up from any element inside the composer area. Stops at a <form> or at
 * a container that holds a send button, whichever comes first, and gives up
 * rather than walking to <body> — a "region" spanning the whole page would
 * make editableWithinRegion's uniqueness test meaningless, which would quietly
 * disable construction #2's button path.
 */
export function composerRegionOf(from: Element): Element | null {
  let node: Element | null = from;
  let hops = 0;
  while (node !== null && hops < 8) {
    if (node.tagName === 'FORM') return node;
    if (node.querySelector(SEND_BUTTON_SELECTOR) !== null && node.querySelector(EDITABLE_SELECTOR) !== null) {
      return node;
    }
    node = node.parentElement;
    hops += 1;
  }
  return null;
}

/**
 * Reads a contenteditable composer as plain text with block structure intact.
 *
 * `textContent` is wrong here: ProseMirror renders each paragraph as its own
 * block element, and textContent concatenates them with no separator, so
 * "4111 1111 1111 1111" typed across two lines reads back as one run of
 * digits. Detection would then find a card number the user did not type, and —
 * far worse — offsets computed against that string would not correspond to the
 * real document, so redaction would target the wrong characters.
 */
export function readEditableText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }

  const parts: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.nodeValue ?? '');
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock && parts.length > 0 && !parts[parts.length - 1]?.endsWith('\n')) parts.push('\n');
    for (const child of Array.from(node.childNodes)) walk(child);
    if (isBlock && !(parts[parts.length - 1] ?? '').endsWith('\n')) parts.push('\n');
  };
  walk(element);

  // One trailing newline is an artefact of the final block, not user content.
  return parts.join('').replace(/\n$/u, '');
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/**
 * Replaces a contenteditable composer's contents.
 *
 * Uses execCommand('insertText') rather than assigning textContent. ProseMirror
 * owns this DOM: it maintains its own document model and reconciles the DOM
 * against it, so a direct textContent assignment is either reverted on the next
 * transaction or leaves the editor's model disagreeing with what is on screen —
 * and the model is what gets submitted. execCommand goes through the browser's
 * own editing pipeline and raises the beforeinput/input events the editor
 * listens for, so the model updates with it.
 *
 * It is deprecated and it is still the only mechanism that works across
 * contenteditable editors. writeAndVerify is what makes relying on it safe:
 * if it silently does nothing, the read-back check fails and the send blocks.
 */
function writeEditableText(element: HTMLElement, text: string): void {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  element.focus();
  const doc = element.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (selection === null || selection === undefined) {
    throw new Error('NoSelection');
  }
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  if (!doc.execCommand('insertText', false, text)) {
    throw new Error('InsertTextRejected');
  }
}

export class ClaudeAdapter implements SiteAdapter {
  readonly id = 'claude' as const;
  readonly displayName = 'Claude';

  private readonly document: Document;
  private readonly witness: InputWitness;

  constructor(doc: Document, witness: InputWitness) {
    this.document = doc;
    this.witness = witness;
  }

  matches(url: string): boolean {
    try {
      return new URL(url).hostname === 'claude.ai';
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.document.readyState !== 'loading' && this.getComposer().ok;
  }

  getComposer(): Resolution<ComposerHandle> {
    return resolveUnique('composer', this.document, CLAUDE_COMPOSER_STRATEGIES, COMPOSER_INVARIANTS);
  }

  getComposerText(handle: ComposerHandle): string {
    return readEditableText(handle.node);
  }

  setComposerText(handle: ComposerHandle, text: string): WriteResult {
    const result = writeAndVerify(handle, text, writeEditableText, readEditableText);
    // Our own write is legitimate input for witness purposes, but only after
    // it has demonstrably succeeded on an already-bound handle.
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
      const button = target.closest(SEND_BUTTON_SELECTOR);
      if (button === null) return;
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

    // Capture phase, so the extension sees the event before the page's own
    // handler does. A bubble-phase listener would run after the site had
    // already sent the message.
    this.document.addEventListener('keydown', onKeyDown, { capture: true });
    this.document.addEventListener('click', onClick, { capture: true });
    return () => {
      this.document.removeEventListener('keydown', onKeyDown, { capture: true });
      this.document.removeEventListener('click', onClick, { capture: true });
    };
  }

  getConversationId(): string | null {
    const match = CONVERSATION_PATH.exec(this.document.location.pathname);
    return match?.[1] ?? null;
  }

  getResponseRoot(): Resolution<ElementHandle> {
    return resolveUnique(
      'response-root',
      this.document,
      CLAUDE_RESPONSE_STRATEGIES,
      RESPONSE_ROOT_INVARIANTS,
    );
  }

  observeResponseStream(callback: (event: ResponseStreamEvent) => void): () => void {
    const root = this.getResponseRoot();
    if (!root.ok) return () => undefined;

    const target = root.value.node;
    const observer = new MutationObserver((records) => {
      const changed: Text[] = [];
      for (const record of records) {
        if (record.type === 'characterData' && record.target.nodeType === Node.TEXT_NODE) {
          changed.push(record.target as Text);
        }
        for (const added of Array.from(record.addedNodes)) collectTextNodes(added, changed);
      }
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
            'Detection still works, but the strongest strategies no longer match, which usually means the site changed and the adapter is one redesign from failing.',
        });
      }
    } else {
      failures.push(composer.failure);
    }

    const responseRoot = this.getResponseRoot();
    if (!responseRoot.ok) failures.push(responseRoot.failure);

    if (this.document.querySelector(SEND_BUTTON_SELECTOR) === null) {
      failures.push({
        kind: 'not-found',
        target: 'send-button',
        detail:
          'No send button matched. The button path of the submit binding cannot be checked without it, so pointer sends would be undecidable.',
        triedStrategies: ['claude/send-button'],
      });
    }

    return {
      ok: failures.length === 0,
      failures,
      warnings,
      checkedAt: Date.now(),
    };
  }
}

function collectTextNodes(node: Node, into: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    into.push(node as Text);
    return;
  }
  for (const child of Array.from(node.childNodes)) collectTextNodes(child, into);
}
