// @vitest-environment jsdom
/**
 * Restoring surrogates in the streaming response.
 *
 * SPEC.md step 8. The properties that matter are the ones whose failure would
 * be silent or wrong rather than merely absent:
 *
 *   - a PARTIAL surrogate is never replaced, however the stream is chunked;
 *   - a surrogate that is a PREFIX of a longer one never steals its match;
 *   - re-running changes nothing, because sites re-render the same nodes many
 *     times while streaming;
 *   - the original is never written into anything the user could send.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { Vault } from '@discretion/core';

import { DomRestorer } from '../src/detection/restore.js';
import { resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

const HOST_TAG = 'discretion-surface';

function vaultWith(pairs: readonly (readonly [string, string])[]): Vault {
  const vault = new Vault();
  for (const [original, replacement] of pairs) {
    vault.register({ type: 'IBAN', original, replacement });
  }
  return vault;
}

/** Builds a response subtree and returns its text nodes. */
function response(html: string): { root: HTMLElement; texts: Text[] } {
  const root = document.createElement('main');
  root.innerHTML = html;
  document.body.append(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let node = walker.nextNode();
  while (node !== null) {
    texts.push(node as Text);
    node = walker.nextNode();
  }
  return { root, texts };
}

describe('restoring what the model echoed back', () => {
  it('replaces a complete surrogate with the original', () => {
    const vault = vaultWith([['GB33BUKB20201555555555', 'GB12SURR00000000000000']]);
    const { root, texts } = response('<p>Your account GB12SURR00000000000000 is fine.</p>');

    const stats = new DomRestorer(vault, HOST_TAG).apply(texts);

    expect(stats.occurrences).toBe(1);
    expect(root.textContent).toContain('GB33BUKB20201555555555');
    expect(root.textContent).not.toContain('GB12SURR00000000000000');
  });

  it('NEVER replaces a partial surrogate, however the stream is chunked', () => {
    // The failure this test protects against is the most visible one there is:
    // a half-arrived value rewritten into something wrong, on screen, while
    // the user watches.
    const surrogate = 'GB12SURR00000000000000';
    const vault = vaultWith([['GB33BUKB20201555555555', surrogate]]);
    const restorer = new DomRestorer(vault, HOST_TAG);

    for (let cut = 1; cut < surrogate.length; cut += 1) {
      resetDocument();
      const partial = surrogate.slice(0, cut);
      const { root, texts } = response(`<p>Your account ${partial}`);
      restorer.apply(texts);
      expect(root.textContent).toBe(`Your account ${partial}`);
    }
  });

  it('does not let a shorter surrogate steal a longer one\'s match', () => {
    // Longest-first ordering. `AAAA` is a prefix of `AAAAZZZZ`; replacing the
    // short one first would leave `<originalA>ZZZZ` and destroy both values.
    const vault = vaultWith([
      ['SHORT-ORIGINAL', 'AAAA'],
      ['LONG-ORIGINAL', 'AAAAZZZZ'],
    ]);
    const { root, texts } = response('<p>value AAAAZZZZ here</p>');

    new DomRestorer(vault, HOST_TAG).apply(texts);

    expect(root.textContent).toContain('LONG-ORIGINAL');
    expect(root.textContent).not.toContain('SHORT-ORIGINAL');
  });

  it('is idempotent, because streaming sites re-render the same node', () => {
    const vault = vaultWith([['GB33BUKB20201555555555', 'GB12SURR00000000000000']]);
    const { root, texts } = response('<p>GB12SURR00000000000000</p>');
    const restorer = new DomRestorer(vault, HOST_TAG);

    restorer.apply(texts);
    const once = root.textContent;
    const again = restorer.apply(texts);

    expect(again.occurrences).toBe(0);
    expect(root.textContent).toBe(once);
  });

  it('restores several occurrences in one node', () => {
    const vault = vaultWith([['ORIG', 'SURR']]);
    const { root, texts } = response('<p>SURR and SURR and SURR</p>');
    expect(new DomRestorer(vault, HOST_TAG).apply(texts).occurrences).toBe(3);
    expect(root.textContent).toBe('ORIG and ORIG and ORIG');
  });

  it('leaves a surrogate SPLIT across text nodes alone', () => {
    // The documented limitation, pinned so it stays a known shape rather than
    // becoming a surprise. The user sees a surrogate - visible and safe - not
    // something wrong.
    const vault = vaultWith([['ORIGINAL', 'SURROGATE']]);
    const { root, texts } = response('<p>SURRO<em>GATE</em></p>');
    new DomRestorer(vault, HOST_TAG).apply(texts);
    expect(root.textContent).toBe('SURROGATE');
  });
});

describe('where the original must never be written', () => {
  it('refuses a contenteditable, which the user could send', () => {
    const vault = vaultWith([['ORIG', 'SURR']]);
    const { root, texts } = response('<div contenteditable="true"><p>SURR</p></div>');
    expect(new DomRestorer(vault, HOST_TAG).apply(texts).occurrences).toBe(0);
    expect(root.textContent).toBe('SURR');
  });

  it('refuses our own panel, which shows surrogates on purpose', () => {
    const vault = vaultWith([['ORIG', 'SURR']]);
    const host = document.createElement(HOST_TAG);
    host.innerHTML = '<span>SURR</span>';
    document.body.append(host);
    const text = host.querySelector('span')?.firstChild as Text;

    expect(new DomRestorer(vault, HOST_TAG).apply([text]).occurrences).toBe(0);
    expect(host.textContent).toBe('SURR');
  });

  it('refuses a detached node', () => {
    const vault = vaultWith([['ORIG', 'SURR']]);
    const orphan = document.createTextNode('SURR');
    expect(new DomRestorer(vault, HOST_TAG).apply([orphan]).occurrences).toBe(0);
  });
});

describe('the settle pass', () => {
  it('re-scans a whole subtree', () => {
    const vault = vaultWith([['ORIG', 'SURR']]);
    const { root } = response('<p>a SURR</p><div><span>b SURR</span></div>');
    const stats = new DomRestorer(vault, HOST_TAG).applyToSubtree(root);
    expect(stats.occurrences).toBe(2);
    expect(root.textContent).toBe('a ORIGb ORIG');
  });

  it('picks up a value masked LATER in the same session', () => {
    // The restorer reads the vault fresh on every pass. A surrogate list
    // captured at construction would silently stop restoring anything the user
    // masked after the controller started.
    const vault = vaultWith([['FIRST', 'S1']]);
    const restorer = new DomRestorer(vault, HOST_TAG);
    const { root } = response('<p>S1 and S2</p>');

    restorer.applyToSubtree(root);
    expect(root.textContent).toBe('FIRST and S2');

    vault.register({ type: 'IBAN', original: 'SECOND', replacement: 'S2' });
    restorer.applyToSubtree(root);
    expect(root.textContent).toBe('FIRST and SECOND');
  });
});
