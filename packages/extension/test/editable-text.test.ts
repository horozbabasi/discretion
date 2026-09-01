// @vitest-environment jsdom
/**
 * What counts as the composer's CONTENT, and why the read and the write have
 * to agree about it.
 *
 * D43. A pretty-printed editable holds whitespace-only text nodes between its
 * block children - the indentation from the HTML source. They render as
 * nothing. Two separate failures came out of treating them as content:
 *
 *   - the WRITE could not remove them (no execCommand can), so the masked text
 *     landed beside 26 characters of leftover indentation and the verified
 *     write refused: "wrote 83 characters but read back 109";
 *   - once the write stripped them, the READ still reported them, so the
 *     masked text CARRIED the indentation and writing it back inserted literal
 *     spaces where structural whitespace had been: "wrote 83, read back 83",
 *     same length, different string.
 *
 * The second is the one worth remembering: fixing only the write made the
 * numbers agree and the strings still differ, which looks like progress and is
 * not. Both sides now use one predicate.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { readEditableText, writeEditableText } from '../src/adapters/text.js';
import { installInsertTextEmulation, resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

function editable(html: string): HTMLElement {
  const host = document.createElement('div');
  host.setAttribute('contenteditable', 'true');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

describe('source indentation is not content', () => {
  it('skips whitespace-only text nodes between block children', () => {
    // Exactly the shape every committed fixture has, because they are
    // pretty-printed HTML.
    const node = editable('\n            <p>lorem ipsum</p>\n          ');
    expect(readEditableText(node)).toBe('lorem ipsum');
  });

  it('skips it between SEVERAL blocks, and keeps the blocks separated', () => {
    const node = editable('\n  <p>first line</p>\n  <p>second line</p>\n');
    expect(readEditableText(node)).toBe('first line\nsecond line');
  });

  it('KEEPS whitespace the user actually typed inside a block', () => {
    // The narrow scope matters: this is the case a blunter rule would eat.
    const node = editable('<p>  leading and trailing  </p>');
    expect(readEditableText(node)).toBe('  leading and trailing  ');
  });

  it('KEEPS a text-only editable that holds nothing but spaces', () => {
    // No element children, so nothing here is inter-block formatting. A
    // composer holding spaces still reads as holding them.
    const node = editable('   ');
    expect(readEditableText(node)).toBe('   ');
  });

  it('keeps text that sits directly beside a block, when it is not blank', () => {
    const node = editable('before<p>inside</p>after');
    expect(readEditableText(node)).toContain('before');
    expect(readEditableText(node)).toContain('inside');
    expect(readEditableText(node)).toContain('after');
  });
});

describe('the write removes what the read ignores', () => {
  it('leaves no formatting whitespace behind', () => {
    installInsertTextEmulation();
    const node = editable('\n            <p>lorem ipsum</p>\n          ');
    // Before: three children, two of them indentation text nodes.
    expect(node.childNodes.length).toBe(3);

    writeEditableText(node, 'masked');

    const leftover = Array.from(node.childNodes).filter(
      (child) => child.nodeType === Node.TEXT_NODE && (child.nodeValue ?? '').trim() === '',
    );
    expect(leftover).toHaveLength(0);
  });

  it('round-trips: what is written is what reads back', () => {
    // The property the send gate's verified write depends on. It failed in a
    // real browser while both sides disagreed about indentation, and no jsdom
    // test caught it - which is why this one exists alongside the live check
    // rather than instead of it.
    installInsertTextEmulation();
    const node = editable('\n            <p>lorem ipsum</p>\n          ');
    const text = 'please wire it to GB33BUKB20201555555555 today';
    writeEditableText(node, text);
    expect(readEditableText(node)).toBe(text);
  });
});
