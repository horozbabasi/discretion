// @vitest-environment jsdom
/**
 * The composer region, against claude.ai's decoy inputs.
 *
 * Live on claude.ai, 2026-09-02: a real send was refused as `undecidable` -
 * "the submit event did not resolve to exactly one editable element" - on a
 * settled page where exactly one admissible composer was plainly visible.
 *
 * The cause was ONE MECHANISM USING TWO ADMISSION RULES. The region walk
 * stopped on `querySelector('textarea, input, [contenteditable="true"]')`,
 * which a zero-size `aria-hidden` decoy input satisfies; `editableWithinRegion`
 * then applied the full composer invariants, found nothing admissible, and
 * returned null.
 *
 * claude.ai renders FIVE such decoys beside its composer - one carries
 * `class="absolute -z-10 h-0 w-0 overflow-hidden opacity-0 select-none"`.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { composerRegionOf, lastComposerRegionWalk } from '../src/adapters/claude.js';
import {
  editableWithinRegion,
  isAdmissibleComposer,
  lastRegionAdmission,
} from '../src/adapters/binding.js';
import { giveEverythingLayout, resetDocument } from './dom-helpers.js';

beforeEach(resetDocument);

/** The shape reported live: decoys next to the button, composer further up. */
function claudeLikeDom(): { button: HTMLElement; composer: HTMLElement } {
  document.body.innerHTML = `
    <div id="outer">
      <div class="ProseMirror tiptap" contenteditable="true" role="textbox">hello</div>
      <div id="controls">
        <input type="text" aria-hidden="true" class="absolute -z-10 h-0 w-0 overflow-hidden opacity-0 select-none" />
        <input type="text" aria-hidden="true" />
        <button type="button" aria-label="Send message" data-testid="send-button">send</button>
      </div>
    </div>`;
  giveEverythingLayout();
  // The decoys are zero-size AND aria-hidden, exactly as reported.
  for (const decoy of Array.from(document.querySelectorAll('input'))) {
    Object.defineProperty(decoy, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 }) as DOMRect,
    });
  }
  return {
    button: document.querySelector('button') as HTMLElement,
    composer: document.querySelector('[contenteditable="true"]') as HTMLElement,
  };
}

describe('the region walk and the uniqueness test use ONE admission rule', () => {
  it('a decoy input is not an admissible composer', () => {
    claudeLikeDom();
    const decoys = Array.from(document.querySelectorAll('input'));
    expect(decoys).toHaveLength(2);
    for (const decoy of decoys) expect(isAdmissibleComposer(decoy)).toBe(false);
  });

  it('does NOT stop at a container holding only decoys', () => {
    // #controls has the send button and two inputs. Under the old loose test
    // the walk stopped there, and the strict uniqueness test then found zero.
    const { button } = claudeLikeDom();
    const region = composerRegionOf(button);
    expect(region).not.toBeNull();
    expect((region as Element).id).toBe('outer');
  });

  it('resolves the real composer as the sole editable in that region', () => {
    const { button, composer } = claudeLikeDom();
    const region = composerRegionOf(button);
    expect(editableWithinRegion(region as Element)).toBe(composer);
  });

  it('reports WHY the walk failed, with a hop count', () => {
    // So a future failure says whether the stopping rule or the bound is the
    // constraint, instead of only that the region was null.
    document.body.innerHTML = '<div><button aria-label="Send message">s</button></div>';
    giveEverythingLayout();
    const button = document.querySelector('button') as HTMLElement;
    expect(composerRegionOf(button)).toBeNull();
    const walk = lastComposerRegionWalk();
    expect(walk?.outcome === 'hop-limit' || walk?.outcome === 'reached-root').toBe(true);
    expect(typeof walk?.hops).toBe('number');
  });

  it('still refuses when the region holds TWO admissible composers', () => {
    // The uniqueness guarantee is not weakened by any of this: two real
    // editables in one region is undecidable and must stay undecidable.
    claudeLikeDom();
    const second = document.createElement('div');
    second.setAttribute('contenteditable', 'true');
    second.textContent = 'another';
    document.getElementById('outer')?.append(second);
    giveEverythingLayout();
    const button = document.querySelector('button') as HTMLElement;
    const region = composerRegionOf(button);
    expect(editableWithinRegion(region as Element)).toBeNull();
  });
});

describe('the uniqueness decision records what it saw', () => {
  // The instrumentation exists because every reading taken either side of a
  // live refusal disagreed with the refusal. A decision that contradicts the
  // state before AND after it has to report its own inputs.

  it('records the count, and which invariant rejected each candidate', () => {
    const { button } = claudeLikeDom();
    const region = composerRegionOf(button) as Element;
    editableWithinRegion(region);

    const trace = lastRegionAdmission();
    expect(trace).not.toBeNull();
    expect(trace?.admitted).toBe(1);
    expect(trace?.examined).toBe(3);
    expect(trace?.rejected).toHaveLength(2);
    for (const rejection of trace?.rejected ?? []) {
      expect(rejection.tag).toBe('input');
      // The decoys are BOTH zero-size and aria-hidden, so both invariants
      // name them. Either alone would be enough to reject.
      expect(rejection.failedInvariants).toContain('not-aria-hidden');
    }
  });

  it('carries no page text, only structure', () => {
    // These strings reach a console and a bug report. Attribute NAMES, tags
    // and invariant ids only - the same rule the rest of the diagnostics obey.
    const { button } = claudeLikeDom();
    editableWithinRegion(composerRegionOf(button) as Element);
    const serialised = JSON.stringify(lastRegionAdmission());
    expect(serialised).not.toContain('hello');
    expect(serialised).not.toContain('absolute -z-10');
  });

  it('distinguishes "no region" from "a region with nothing admissible"', () => {
    // The two produce the same refusal and need opposite fixes: one is the
    // walk, the other is what the walk found.
    document.body.innerHTML = '<div><button aria-label="Send message">s</button></div>';
    giveEverythingLayout();
    expect(composerRegionOf(document.querySelector('button') as HTMLElement)).toBeNull();
    expect(lastComposerRegionWalk()?.outcome).not.toBe('found');
  });
});
