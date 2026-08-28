// @vitest-environment jsdom
/**
 * Adapter tests against committed HTML fixtures.
 *
 * SPEC.md: "Adapter tests against committed HTML fixture snapshots; never
 * against live sites."
 *
 * What these tests are FOR, and what they cannot do, is set out in
 * ADAPTER-VERIFICATION.md. In short: they pin the adapter's LOGIC against
 * known page shapes — above all that ambiguity blocks and that an inert
 * duplicate does not. They cannot tell you whether claude.ai still looks like
 * the fixture. Nothing offline can.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { ClaudeAdapter, readEditableText } from '../src/adapters/claude.js';
import { InputWitness, verifyBinding } from '../src/adapters/binding.js';
import type { ComposerHandle, SubmitIntent } from '../src/adapters/types.js';

// Resolved from the repo root rather than import.meta.url: under the jsdom
// environment import.meta.url is an http: URL and fileURLToPath rejects it.
const FIXTURES = join(process.cwd(), 'packages', 'extension', 'test', 'fixtures');

function loadFixture(name: string): void {
  const html = readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html
    .replace(/^[\s\S]*?<html[^>]*>/iu, '')
    .replace(/<\/html>\s*$/iu, '');
  giveEverythingLayout();
}

/**
 * jsdom performs no layout, so every getBoundingClientRect is 0x0 and the
 * 'rendered' invariant would reject every element including the real composer.
 *
 * Rather than weaken the invariant to suit the test environment — which would
 * delete a real check to make a fake one pass — layout is simulated here:
 * elements get a realistic box unless they are display:none, hidden, or inside
 * an aria-hidden subtree, which is what a browser would produce.
 */
function giveEverythingLayout(): void {
  for (const element of Array.from(document.querySelectorAll('*'))) {
    const inert =
      element.closest('[aria-hidden="true"]') !== null || element.hasAttribute('hidden');
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        inert
          ? { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 }
          : { width: 640, height: 48, top: 0, left: 0, right: 640, bottom: 48, x: 0, y: 0 },
    });
  }
}

function makeAdapter(): { adapter: ClaudeAdapter; witness: InputWitness } {
  const witness = new InputWitness(document);
  witness.start();
  return { adapter: new ClaudeAdapter(document, witness), witness };
}

beforeEach(() => {
  document.documentElement.innerHTML = '<head></head><body></body>';
});

describe('composer resolution', () => {
  it('resolves the composer at the strongest tier on a healthy page', () => {
    loadFixture('claude/composer');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    expect(resolved.value.tier).toBe('attribute');
    expect(resolved.value.node.getAttribute('aria-label')).toBe('Write your prompt to Claude');
    expect(adapter.healthCheck().ok).toBe(true);
    expect(adapter.healthCheck().warnings).toHaveLength(0);
  });

  it('REFUSES TO GUESS when two real composer candidates exist', () => {
    // The core of the design. A resolver that returned the first match would
    // pick the decoy here, because the decoy comes first in document order.
    loadFixture('claude/composer-decoy');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;

    expect(resolved.failure.kind).toBe('ambiguous');
    expect(resolved.failure.target).toBe('composer');
    expect(adapter.healthCheck().ok).toBe(false);
  });

  it('does not fall through to a weaker tier after an ambiguous one', () => {
    // Both candidates also carry .ProseMirror, so the class tier would resolve
    // them just as ambiguously. The guarantee being pinned is stronger than
    // that: ambiguity STOPS resolution, it does not demote it. A weaker tier
    // must never be able to launder a decision the strong tier refused.
    loadFixture('claude/composer-decoy');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.detail).toContain("'attribute' tier");
  });

  it('ignores an inert duplicate rather than blocking a working page', () => {
    loadFixture('claude/composer-hidden-clone');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.node.getAttribute('aria-label')).toBe('Write your prompt to Claude');
  });

  it('reports not-found, not a false success, when the composer is gone', () => {
    loadFixture('claude/composer');
    document.querySelector('fieldset.composer-shell')?.remove();
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.failure.kind).toBe('not-found');
    expect(adapter.healthCheck().ok).toBe(false);
  });

  it('warns when the composer resolves only at the class tier', () => {
    loadFixture('claude/composer');
    const composer = document.querySelector('[role="textbox"]') as HTMLElement;
    composer.removeAttribute('role');
    document.querySelector('[data-testid="chat-input-container"]')
      ?.setAttribute('data-testid', 'renamed-by-a-redesign');
    const { adapter } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    // Structural tier finds it via the send button before class does.
    expect(resolved.value.tier).not.toBe('attribute');

    const health = adapter.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.warnings.map((w) => w.target)).toContain('composer');
  });
});

describe('reading composer text', () => {
  it('preserves block boundaries as newlines', () => {
    // The bug this pins: textContent would join these into
    // "4111111111111111", inventing a card number that was never typed and
    // making every offset wrong.
    loadFixture('claude/composer');
    const composer = document.querySelector('[role="textbox"]') as HTMLElement;
    composer.innerHTML = '<p>4111</p><p>1111</p><p>1111 1111</p>';

    expect(readEditableText(composer)).toBe('4111\n1111\n1111 1111');
  });

  it('treats <br> as a line break', () => {
    loadFixture('claude/composer');
    const composer = document.querySelector('[role="textbox"]') as HTMLElement;
    composer.innerHTML = '<p>first<br>second</p>';

    expect(readEditableText(composer)).toBe('first\nsecond');
  });
});

describe('verified writes', () => {
  function composerHandle(adapter: ClaudeAdapter): ComposerHandle {
    const resolved = adapter.getComposer();
    if (!resolved.ok) throw new Error('fixture did not resolve');
    return resolved.value;
  }

  it('reports failure when the editor silently swallows the write', () => {
    // The React/ProseMirror failure mode: the write appears to succeed, the
    // editor reverts it, and the ORIGINAL unmasked text is what gets sent.
    // Without the read-back this is indistinguishable from success.
    loadFixture('claude/composer');
    const { adapter } = makeAdapter();
    const handle = composerHandle(adapter);

    (document as unknown as { execCommand: () => boolean }).execCommand = () => true; // claims success, changes nothing

    const result = adapter.setComposerText(handle, 'masked text');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('readback-mismatch');
    // Never quotes the content it failed to write.
    expect(result.detail).not.toContain('masked text');
  });

  it('reports failure when the editor rejects the write outright', () => {
    loadFixture('claude/composer');
    const { adapter } = makeAdapter();
    const handle = composerHandle(adapter);

    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;

    const result = adapter.setComposerText(handle, 'masked text');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('rejected');
  });

  it('succeeds when the write actually lands', () => {
    loadFixture('claude/composer');
    const { adapter } = makeAdapter();
    const handle = composerHandle(adapter);

    (document as unknown as { execCommand: (c: string, s: boolean, v: string) => boolean })
      .execCommand = (_c, _s, value) => {
      handle.node.innerHTML = '';
      handle.node.append(document.createTextNode(value));
      return true;
    };

    expect(adapter.setComposerText(handle, 'masked text')).toEqual({ ok: true });
    expect(adapter.getComposerText(handle)).toBe('masked text');
  });
});

describe('submit-time identity binding', () => {
  function intentFrom(node: HTMLElement | null): SubmitIntent {
    return { kind: 'key', event: new Event('keydown'), originComposer: node, suppress: () => {} };
  }

  it('binds when detection and submission are the same node', () => {
    loadFixture('claude/composer');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    resolved.value.node.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

    const verdict = verifyBinding(resolved.value, intentFrom(resolved.value.node), witness);
    expect(verdict.ok).toBe(true);
  });

  it('BLOCKS when detection ran on a different node than the one submitted', () => {
    // The scenario: getComposer() was wrong. Nothing else in the system knows
    // that. This check is what turns a wrong selector into a blocked send
    // instead of a silent leak.
    loadFixture('claude/composer-decoy');
    const { witness } = makeAdapter();

    const [decoy, real] = Array.from(
      document.querySelectorAll<HTMLElement>('[role="textbox"]'),
    );
    expect(decoy).toBeDefined();
    expect(real).toBeDefined();

    real?.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

    const wrongHandle: ComposerHandle = {
      node: decoy as HTMLElement,
      target: 'composer',
      tier: 'attribute',
      strategyId: 'claude/composer-role-textbox',
    };

    const verdict = verifyBinding(wrongHandle, intentFrom(real as HTMLElement), witness);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe('identity-mismatch');
  });

  it('BLOCKS an element the user has never typed into', () => {
    loadFixture('claude/composer');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    // No input event dispatched: the witness has never seen this element.
    const verdict = verifyBinding(resolved.value, intentFrom(resolved.value.node), witness);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe('no-input-witness');
  });

  it('BLOCKS when the submit event resolves to nothing editable', () => {
    loadFixture('claude/composer');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const verdict = verifyBinding(resolved.value, intentFrom(null), witness);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe('undecidable');
  });

  it('BLOCKS when the composer was detached between detection and send', () => {
    loadFixture('claude/composer');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    resolved.value.node.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    resolved.value.node.remove();

    const verdict = verifyBinding(resolved.value, intentFrom(resolved.value.node), witness);
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.code).toBe('detached');
  });

  it('derives the composer from a send-button click via its region', () => {
    loadFixture('claude/composer');
    const { adapter, witness } = makeAdapter();
    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    resolved.value.node.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });

    const button = document.querySelector<HTMLElement>('[data-testid="send-button"]');
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    expect(captured).not.toBeNull();
    const intent = captured as unknown as SubmitIntent;
    expect(intent.kind).toBe('button');
    expect(intent.originComposer).toBe(resolved.value.node);
    expect(verifyBinding(resolved.value, intent, witness).ok).toBe(true);
  });
});

describe('the button path and the resolver agree on what counts as a candidate', () => {
  it('binds through a send-button click even when an inert clone shares the region', () => {
    // resolveUnique rejects the aria-hidden clone via COMPOSER_INVARIANTS.
    // editableWithinRegion must reject it by the SAME rule. If it does not,
    // the resolver finds the composer, the button path reports two editables
    // and returns null, and the send is blocked as 'undecidable' on a page
    // that is working perfectly.
    loadFixture('claude/composer-region-clone');
    const { adapter, witness } = makeAdapter();

    const resolved = adapter.getComposer();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    resolved.value.node.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

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

  it('still refuses when the region holds two REAL editables', () => {
    // The other direction: the agreement must not be achieved by making
    // editableWithinRegion permissive. Two genuine candidates still block.
    loadFixture('claude/composer-region-clone');
    const clone = document.querySelector<HTMLElement>('.height-measurement-clone');
    clone?.removeAttribute('aria-hidden');
    giveEverythingLayout();

    const { adapter } = makeAdapter();
    let captured: SubmitIntent | null = null;
    const off = adapter.onSubmitIntent((intent) => {
      captured = intent;
    });
    document
      .querySelector<HTMLElement>('[data-testid="send-button"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    off();

    const intent = captured as unknown as SubmitIntent;
    expect(intent).not.toBeNull();
    expect(intent.originComposer).toBeNull();
  });
});

describe('adapter identity', () => {
  it('matches claude.ai and nothing else', () => {
    const { adapter } = makeAdapter();
    expect(adapter.matches('https://claude.ai/chat/abc')).toBe(true);
    expect(adapter.matches('https://chatgpt.com/')).toBe(false);
    expect(adapter.matches('https://gemini.google.com/app')).toBe(false);
    // A lookalike host must not match: claude.ai.evil.example is not claude.ai.
    expect(adapter.matches('https://claude.ai.evil.example/chat/abc')).toBe(false);
    expect(adapter.matches('not a url')).toBe(false);
  });
});
