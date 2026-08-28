// @vitest-environment jsdom
/**
 * ChatGPT adapter, against committed fixtures.
 *
 * SPEC.md: "Adapter tests against committed HTML fixture snapshots; never
 * against live sites."
 *
 * The adversarial cases here are the ones ChatGPT specifically makes possible:
 * duplicate ids, a second REAL editor in the transcript, and a send button that
 * turns into a stop button mid-stream. What these tests can and cannot
 * establish is set out in ADAPTER-VERIFICATION.md.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ChatGptAdapter } from '../src/adapters/chatgpt.js';
import { InputWitness, verifyBinding } from '../src/adapters/binding.js';
import type { SubmitIntent } from '../src/adapters/types.js';
import { loadFixture, resetDocument, witnessTyping } from './dom-helpers.js';

function makeAdapter(): { adapter: ChatGptAdapter; witness: InputWitness } {
  const witness = new InputWitness(document);
  witness.start();
  return { adapter: new ChatGptAdapter(document, witness), witness };
}

beforeEach(resetDocument);

describe('composer resolution', () => {
  it('resolves the ProseMirror build at the strongest tier', () => {
    loadFixture('chatgpt/composer-contenteditable');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.tier).toBe('attribute');
    expect(resolved.value.strategyId).toBe('chatgpt/composer-id');

    const health = adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.warnings).toHaveLength(0);
  });

  it('resolves the LEGACY textarea build with the same adapter, no branching', () => {
    // ChatGPT has served both builds and A/B tested between them. An adapter
    // that only worked on whichever build its author happened to be served
    // would fail at random for other users.
    loadFixture('chatgpt/composer-textarea');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.node.tagName).toBe('TEXTAREA');
    expect(adapter.getComposerText(resolved.value)).toBe('lorem ipsum');
    expect(adapter.healthCheck().ok).toBe(true);
  });

  it('REFUSES TO GUESS between duplicate id="prompt-textarea" elements', () => {
    // Duplicate ids are invalid HTML but legal in the DOM. getElementById and
    // the id fast path are first-match-wins — the tie-break the ambiguity rule
    // forbids — which is why the strategy uses [id="..."] with querySelectorAll.
    loadFixture('chatgpt/composer-decoy');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.kind).toBe('ambiguous');
    expect(adapter.healthCheck().ok).toBe(false);
  });

  it('does NOT block when a message-edit editor is open', () => {
    // The counterweight. That editor is visible, real, and passes every
    // composer invariant — a document-wide contenteditable strategy would call
    // it ambiguity and block every send while an edit box is open.
    loadFixture('chatgpt/message-edit-open');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.node.id).toBe('prompt-textarea');
    expect(adapter.healthCheck().ok).toBe(true);
  });

  it('stays healthy while a response is streaming and only a stop button exists', () => {
    // healthCheck must not demand a SEND button: during a stream there isn't
    // one, and that is a normal page state, not a broken adapter.
    loadFixture('chatgpt/streaming-stop-button');
    const { adapter } = makeAdapter();

    expect(adapter.getComposer().ok).toBe(true);
    const health = adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.failures).toHaveLength(0);
  });

  it('does not intercept a click on the stop button', () => {
    // Stopping a stream is not a send. Intercepting it would stop the user
    // interrupting a response.
    loadFixture('chatgpt/streaming-stop-button');
    const { adapter } = makeAdapter();

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    document
      .querySelector<HTMLElement>('[data-testid="stop-button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    expect(captured).toBeNull();
  });
});

describe('conversation id', () => {
  it('reads a plain conversation path', () => {
    loadFixture('chatgpt/composer-contenteditable');
    const { adapter } = makeAdapter();
    window.history.replaceState({}, '', '/c/6a1f2e3d4c5b6a7f8e9d0c1b');
    expect(adapter.getConversationId()).toBe('6a1f2e3d4c5b6a7f8e9d0c1b');
  });

  it('reads a conversation inside a custom GPT', () => {
    // Without the /g/<gizmo-id> prefix every conversation in a custom GPT
    // reports a null id, and the session log silently merges them.
    loadFixture('chatgpt/composer-contenteditable');
    const { adapter } = makeAdapter();
    window.history.replaceState({}, '', '/g/g-abc123/c/6a1f2e3d4c5b6a7f8e9d0c1b');
    expect(adapter.getConversationId()).toBe('6a1f2e3d4c5b6a7f8e9d0c1b');
  });

  it('returns null off a conversation page', () => {
    loadFixture('chatgpt/composer-contenteditable');
    const { adapter } = makeAdapter();
    window.history.replaceState({}, '', '/');
    expect(adapter.getConversationId()).toBeNull();
  });
});

describe('writes', () => {
  it('writes a textarea through the prototype setter so React cannot revert it', () => {
    // React installs its own `value` property and tracks the last value it
    // wrote; assigning element.value leaves the tracker unchanged and React
    // restores its own value on the next render, so the composer still holds
    // the ORIGINAL text. Writing through the prototype setter makes the
    // tracker see a value it did not write.
    loadFixture('chatgpt/composer-textarea');
    const { adapter } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const node = resolved.value.node as HTMLTextAreaElement;

    // Faithful model of React's value tracker (ReactDOM inputValueTracking):
    // it defines an INSTANCE property whose getter DELEGATES to the prototype
    // getter, and whose setter records the value it saw before delegating.
    // React later compares the tracked value against the DOM's; if they agree
    // it concludes nothing changed and restores its own state.
    //
    // Modelling the getter as returning its own private field instead would be
    // unfaithful, and would make this test fail for a reason React does not
    // have.
    const prototypeDescriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    );
    const trackedWrites: string[] = [];
    Object.defineProperty(node, 'value', {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        return prototypeDescriptor?.get?.call(this) as string;
      },
      set(this: HTMLTextAreaElement, v: string) {
        trackedWrites.push(v);
        prototypeDescriptor?.set?.call(this, v);
      },
    });

    expect(adapter.setComposerText(resolved.value, 'masked text')).toEqual({ ok: true });
    // The write went through the PROTOTYPE setter, so React's instance setter
    // never ran and its tracker is now stale — which is exactly what makes
    // React accept the following input event as a real user edit instead of
    // restoring the old value.
    expect(trackedWrites).toEqual([]);
    expect(node.value).toBe('masked text');
  });

  it('fails closed when a contenteditable write does not stick', () => {
    loadFixture('chatgpt/composer-contenteditable');
    const { adapter } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    (document as unknown as { execCommand: () => boolean }).execCommand = () => true; // claims success, changes nothing

    const result = adapter.setComposerText(resolved.value, 'masked text');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('readback-mismatch');
    expect(result.detail).not.toContain('masked text');
  });
});

describe('submit-time identity binding', () => {
  function intentFrom(node: HTMLElement | null): SubmitIntent {
    return { kind: 'key', event: new Event('keydown'), originComposer: node, suppress: () => {} };
  }

  it('binds the composer the user typed into', () => {
    loadFixture('chatgpt/composer-contenteditable');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    witnessTyping(resolved.value.node);
    expect(verifyBinding(resolved.value, intentFrom(resolved.value.node), witness).ok).toBe(true);
  });

  it('BLOCKS when the user typed into the message-edit editor instead', () => {
    // The leak direction the transcript-turn filter deliberately gives up on:
    // if the user types into an editor the adapter did not resolve, identity
    // binding is what catches it.
    loadFixture('chatgpt/message-edit-open');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const editEditor = document.querySelector<HTMLElement>(
      '[data-message-author-role] [contenteditable="true"]',
    );
    expect(editEditor).not.toBeNull();
    witnessTyping(editEditor as HTMLElement);

    const verdict = verifyBinding(resolved.value, intentFrom(editEditor as HTMLElement), witness);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe('identity-mismatch');
  });

  it('binds through a send-button click', () => {
    loadFixture('chatgpt/composer-contenteditable');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    witnessTyping(resolved.value.node);

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    document
      .querySelector<HTMLElement>('[data-testid="send-button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    expect(captured).not.toBeNull();
    const intent = captured as unknown as SubmitIntent;
    expect(intent.originComposer).toBe(resolved.value.node);
    expect(verifyBinding(resolved.value, intent, witness).ok).toBe(true);
  });
});

describe('adapter identity', () => {
  it('matches chatgpt hosts and nothing else', () => {
    const { adapter } = makeAdapter();
    expect(adapter.matches('https://chatgpt.com/c/abc')).toBe(true);
    // Legacy host: it redirects to chatgpt.com, and the manifest does not
    // grant it, so the adapter must not claim it.
    expect(adapter.matches('https://chat.openai.com/')).toBe(false);
    expect(adapter.matches('https://claude.ai/')).toBe(false);
    expect(adapter.matches('https://chatgpt.com.evil.example/')).toBe(false);
    expect(adapter.matches('not a url')).toBe(false);
  });
});
