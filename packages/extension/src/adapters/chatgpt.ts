/**
 * Adapter for chatgpt.com.
 *
 * Built against the contract proven by claude.ts. Read `types.ts`'s header
 * first: the four constructions there are what make it safe for the selectors
 * below to be wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS DIFFERENT ABOUT THIS SITE
 *
 * 1. TWO COMPOSER SHAPES. ChatGPT has served both a `<textarea>` and a
 *    ProseMirror contenteditable, under the same id, and has A/B tested
 *    between them. The adapter must handle both without branching on which,
 *    which the shared text.ts helpers already do.
 *
 * 2. A SECOND REAL EDITOR. Editing one of your own messages opens an editor
 *    that is visible, not aria-hidden, genuinely contenteditable, and passes
 *    every composer invariant. A document-wide `[contenteditable][role=textbox]`
 *    strategy — which is what claude.ts leads with — would union it with the
 *    real composer and hard-fail 'ambiguous' every time a user clicks the edit
 *    pencil. That is a healthy page blocked, so composer strategies here are
 *    scoped to exclude transcript turns.
 *
 * 3. THE SEND BUTTON IS ALSO THE STOP BUTTON. While a response streams, the
 *    same slot holds a stop control. The structural strategy anchors on either,
 *    because it needs to keep working mid-stream; the send-button selector used
 *    for submit interception excludes stop, because clicking stop is not a
 *    send.
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
import { collectChangedTextNodes } from './stream.js';

/**
 * Conversation id.
 *
 * The optional `/g/<gizmo-id>` prefix covers custom GPTs, whose conversations
 * live at `/g/g-abc123/c/<uuid>` rather than `/c/<uuid>`. Without it, every
 * conversation inside a custom GPT would report a null id, and the session log
 * would silently merge them.
 */
const CONVERSATION_PATH = /^(?:\/g\/[^/]+)?\/c\/([0-9a-fA-F-]{16,})(?:\/|$)/u;

const EDITABLE_SELECTOR = 'textarea, input, [contenteditable]';

/**
 * Controls that submit the composer. Excludes the stop control: stopping a
 * stream is not a send, and intercepting it would block the user from
 * interrupting a response.
 */
const SEND_BUTTON_SELECTOR = [
  'button[data-testid="send-button"]',
  'button[id="composer-submit-button"]:not([data-testid="stop-button"])',
  'form[data-type="unified-composer"] button[type="submit"]:not([data-testid="stop-button"])',
].join(', ');

/**
 * Send OR stop — the two states of the same slot. Used only to anchor the
 * structural composer strategy, which must keep resolving while a response is
 * streaming and no send button exists.
 */
const SUBMIT_CONTROL_SELECTOR = `${SEND_BUTTON_SELECTOR}, button[data-testid="stop-button"], button[id="composer-submit-button"]`;

function queryAll<E extends Element>(root: ParentNode, selector: string): readonly E[] {
  return Array.from(root.querySelectorAll<E>(selector));
}

/**
 * Whether an element sits inside a transcript turn rather than the composer.
 *
 * This is a FALSE-BLOCK defence, not a leak defence, and the direction matters.
 * If a message-edit editor inherits the composer's markers, an unfiltered
 * strategy would see two candidates and block every send while an edit box is
 * open. The leak direction stays closed without this filter's help: if the user
 * types into an editor the adapter did not resolve, submit-time identity
 * binding reports a mismatch and blocks.
 */
function isOutsideTranscriptTurn(element: Element): boolean {
  return element.closest('[data-message-author-role]') === null;
}

export const CHATGPT_COMPOSER_STRATEGIES: readonly ElementStrategy<HTMLElement>[] = [
  {
    id: 'chatgpt/composer-id',
    tier: 'attribute',
    assumes:
      'The composer carries id="prompt-textarea" and is itself the editing surface, either a textarea or a contenteditable. This id survived the site\'s textarea-to-ProseMirror migration, which makes it the most durable marker the page exposes, and it is locale-independent.',
    find: (root) =>
      queryAll<HTMLElement>(
        root,
        'textarea[id="prompt-textarea"], [id="prompt-textarea"][contenteditable]',
      ).filter(isOutsideTranscriptTurn),
  },
  {
    id: 'chatgpt/composer-in-composer-form',
    tier: 'attribute',
    assumes:
      'The composer form is marked form[data-type="unified-composer"] and contains exactly one editing surface. Scoped to that form rather than document-wide, so an open message-edit editor elsewhere in the transcript is out of reach.',
    find: (root) =>
      queryAll<HTMLElement>(
        root,
        'form[data-type="unified-composer"] textarea, form[data-type="unified-composer"] [contenteditable="true"]',
      ).filter(isOutsideTranscriptTurn),
  },
  {
    id: 'chatgpt/composer-in-submit-region',
    tier: 'structural',
    assumes:
      'The composer and its submit control — send or stop, which share a slot — sit in a common container. Anchors on the control, walks up to the container, then takes the single editable inside it. Survives renames of every attribute the strategies above depend on.',
    find: (root) => {
      const found: HTMLElement[] = [];
      for (const control of queryAll<HTMLElement>(root, SUBMIT_CONTROL_SELECTOR)) {
        const region = composerRegionOf(control);
        if (region === null) continue;
        for (const candidate of queryAll<HTMLElement>(region, EDITABLE_SELECTOR)) {
          if (isEditableSurface(candidate) && isOutsideTranscriptTurn(candidate) && !found.includes(candidate)) {
            found.push(candidate);
          }
        }
      }
      return found;
    },
  },
  {
    id: 'chatgpt/composer-prosemirror',
    tier: 'class',
    assumes:
      'The composer is a ProseMirror editor and carries the library\'s own .ProseMirror class. Last resort: a class name, but a library-owned one rather than a generated utility class.',
    find: (root) =>
      queryAll<HTMLElement>(root, 'div.ProseMirror[contenteditable="true"]').filter(
        isOutsideTranscriptTurn,
      ),
  },
];

export const CHATGPT_RESPONSE_STRATEGIES: readonly ElementStrategy[] = [
  {
    id: 'chatgpt/response-main',
    tier: 'attribute',
    assumes:
      'The transcript lives inside the document\'s single <main> landmark. An ARIA landmark is required for accessibility, so it is unusually durable.',
    find: (root) => queryAll(root, 'main'),
  },
  {
    id: 'chatgpt/response-turn-container',
    tier: 'structural',
    assumes:
      'Assistant turns carry data-message-author-role="assistant"; their common container is the transcript. Used when no <main> exists.',
    find: (root) => {
      const turns = queryAll<Element>(root, '[data-message-author-role]');
      const first = turns[0];
      if (first === undefined) return [];
      let container: Element | null = first.parentElement;
      // Climb until the container holds every turn, bounded so a broken tree
      // cannot walk to <html> and call the whole document the transcript.
      let hops = 0;
      while (container !== null && hops < 8) {
        if (turns.every((turn) => container?.contains(turn) === true)) return [container];
        container = container.parentElement;
        hops += 1;
      }
      return [];
    },
  },
];

/**
 * The container holding both the composer and its submit control.
 *
 * Bounded at 8 hops and stops at a form: a region spanning most of the page
 * would make the "exactly one editable" test meaningless, which would quietly
 * disable the button path of the submit binding.
 */
export function composerRegionOf(from: Element): Element | null {
  let node: Element | null = from;
  let hops = 0;
  while (node !== null && hops < 8) {
    if (node.tagName === 'FORM') return node;
    if (
      node.querySelector(SUBMIT_CONTROL_SELECTOR) !== null &&
      node.querySelector(EDITABLE_SELECTOR) !== null
    ) {
      return node;
    }
    node = node.parentElement;
    hops += 1;
  }
  return null;
}

export class ChatGptAdapter implements SiteAdapter {
  readonly id = 'chatgpt' as const;
  readonly displayName = 'ChatGPT';

  private readonly document: Document;
  private readonly witness: InputWitness;

  constructor(doc: Document, witness: InputWitness) {
    this.document = doc;
    this.witness = witness;
  }

  matches(url: string): boolean {
    try {
      // chatgpt.com only. The legacy chat.openai.com host redirects here, and
      // claiming it would put matches() out of step with the manifest's host
      // permissions — the content script would never run there, so the adapter
      // would be asserting a capability the extension does not have.
      // adapter-manifest.test.ts pins the two together.
      return new URL(url).hostname === 'chatgpt.com';
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.document.readyState !== 'loading' && this.getComposer().ok;
  }

  getComposer(): Resolution<ComposerHandle> {
    return resolveUnique('composer', this.document, CHATGPT_COMPOSER_STRATEGIES, COMPOSER_INVARIANTS);
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
      if (target.closest(SEND_BUTTON_SELECTOR) === null) return;
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
      CHATGPT_RESPONSE_STRATEGIES,
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

    // Absence of a send button is NOT a failure here: while a response
    // streams, the slot holds the stop control instead, and that is a normal
    // page state rather than a broken adapter. The submit control is what must
    // exist.
    if (this.document.querySelector(SUBMIT_CONTROL_SELECTOR) === null) {
      failures.push({
        kind: 'not-found',
        target: 'submit-control',
        detail:
          'Neither a send nor a stop control matched, so pointer sends would be undecidable.',
        triedStrategies: ['chatgpt/submit-control'],
      });
    }

    return { ok: failures.length === 0, failures, warnings, checkedAt: Date.now() };
  }
}
