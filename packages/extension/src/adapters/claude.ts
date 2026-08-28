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
import { readEditableText, writeEditableText } from './text.js';
import type { InputWitness } from './binding.js';
import { originComposerOfButtonEvent, originComposerOfKeyEvent } from './binding.js';

// Re-exported because the tests and the live probe import it from here; the
// implementation is shared with every other adapter in text.ts.
export { readEditableText };

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

/**
 * Send-control clauses, SPLIT BY LOCALE DEPENDENCE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THEY ARE SPLIT RATHER THAN JOINED.
 *
 * Two of these four clauses match an ENGLISH aria-label value. Joined into
 * one selector, `querySelector` returns a match and nothing records WHICH
 * clause produced it - so an adapter that works only because of an English
 * string looks identical to one that works everywhere.
 *
 * That is not hypothetical. Gemini was found live to be matching its send
 * control ONLY via an English aria-label, which was visible solely because
 * that adapter reports provenance. Claude and ChatGPT reported none, so the
 * same dependency here would have been invisible.
 *
 * ChatGPT has no English clause at all. Claude's dependency is LATENT: it
 * works in any locale while the test id or the submit type matches, and falls
 * back to English only if both stop matching. `healthCheck` now says when
 * that has happened.
 *
 * Nothing about WHAT MATCHES changed - the union of these two lists is the
 * previous selector exactly.
 * ─────────────────────────────────────────────────────────────────────────
 */
const SEND_BUTTON_LOCALE_INDEPENDENT = [
  'button[data-testid="send-button"]',
  'button[type="submit"]',
].join(', ');

/** Last resort: matches an English accessible name, so English-only. */
const SEND_BUTTON_ENGLISH_ONLY = [
  'button[aria-label="Send message" i]',
  'button[aria-label="Send Message" i]',
].join(', ');

const SEND_BUTTON_SELECTOR = `${SEND_BUTTON_LOCALE_INDEPENDENT}, ${SEND_BUTTON_ENGLISH_ONLY}`;

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

    // Which clause fired, not merely whether one did.
    const localeIndependentSend = this.document.querySelector(SEND_BUTTON_LOCALE_INDEPENDENT);
    const englishOnlySend = this.document.querySelector(SEND_BUTTON_ENGLISH_ONLY);
    if (localeIndependentSend === null && englishOnlySend !== null) {
      warnings.push({
        target: 'send-button',
        tier: 'class',
        detail:
          'The send control matched ONLY via its English aria-label. Every locale-independent ' +
          'clause failed, so on a non-English interface nothing would match and pointer sends ' +
          'would be undecidable. This is invisible to anyone testing in English.',
      });
    }

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
