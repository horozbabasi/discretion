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

describe('the walk reports every hop, not just its verdict', () => {
  // The previous round of instrumentation promised "which outcome, and how
  // many hops" and did not print it, so a trace with everything else in it
  // still could not answer the question. Per-hop is what actually locates the
  // fix: the two conditions must become true at the SAME ancestor, and knowing
  // where each turns true says whether the bound, the send-button selector, or
  // the structure is the constraint.

  it('records both conditions at each ancestor', () => {
    const { button } = claudeLikeDom();
    composerRegionOf(button);
    const walk = lastComposerRegionWalk();

    expect(walk?.outcome).toBe('found');
    expect(walk?.startedAt).toBe('button');
    expect((walk?.steps.length ?? 0) > 0).toBe(true);
    // #controls has the button but only decoys; #outer has both.
    const controls = walk?.steps.find((s) => s.tag === 'div' && s.hasSendButton && !s.hasAdmissibleComposer);
    expect(controls).toBeDefined();
    const both = walk?.steps.find((s) => s.hasSendButton && s.hasAdmissibleComposer);
    expect(both).toBeDefined();
  });

  it('shows the two conditions never coinciding when there is no region', () => {
    document.body.innerHTML = '<div id="a"><div id="b"><button aria-label="Send message">s</button></div></div>';
    giveEverythingLayout();
    composerRegionOf(document.querySelector('button') as HTMLElement);
    const walk = lastComposerRegionWalk();
    expect(walk?.outcome).not.toBe('found');
    expect(walk?.steps.every((s) => !s.hasAdmissibleComposer)).toBe(true);
  });

  it('carries no page text', () => {
    const { button } = claudeLikeDom();
    composerRegionOf(button);
    const serialised = JSON.stringify(lastComposerRegionWalk());
    expect(serialised).not.toContain('hello');
    expect(serialised).not.toContain('absolute -z-10');
  });
});

describe('a composer in a distant branch is still found', () => {
  /** Composer and button in SEPARATE branches, meeting only `depth` hops up. */
  function splitTree(depth: number): { from: HTMLElement; composer: HTMLElement } {
    const root = document.createElement('div');
    root.id = 'common';
    let a: HTMLElement = root;
    let b: HTMLElement = root;
    for (let i = 0; i < depth; i += 1) {
      const x = document.createElement('div');
      a.append(x);
      a = x;
      const y = document.createElement('div');
      b.append(y);
      b = y;
    }
    const composer = document.createElement('div');
    composer.setAttribute('contenteditable', 'true');
    composer.setAttribute('role', 'textbox');
    composer.className = 'ProseMirror';
    a.append(composer);
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'Send message');
    const icon = document.createElement('span');
    button.append(icon);
    b.append(button);
    document.body.append(root);
    giveEverythingLayout();
    // Clicks originate inside the button, not on it.
    return { from: icon, composer };
  }

  it('finds the common ancestor 12 hops up, where 8 could not', () => {
    // The live claude.ai shape: composer never seen during an 8-hop climb, and
    // present in the common ancestor all along.
    const { from, composer } = splitTree(11);
    const region = composerRegionOf(from);
    expect(region).not.toBeNull();
    expect((region as Element).id).toBe('common');
    expect(editableWithinRegion(region as Element)).toBe(composer);
    expect(lastComposerRegionWalk()?.outcome).toBe('found');
  });

  it('recognises the send button while standing on it', () => {
    // The descendant-only test was false ON the button and inside it, burning
    // three hops before the walk had cleared the control.
    const { from } = splitTree(2);
    composerRegionOf(from);
    const steps = lastComposerRegionWalk()?.steps ?? [];
    const onButton = steps.find((s) => s.tag === 'button');
    expect(onButton?.hasSendButton).toBe(true);
  });

  it('returns the TIGHTEST container, not the whole page', () => {
    // The bound is a loop backstop now; tightness comes from stopping at the
    // first ancestor holding both.
    const { from } = splitTree(3);
    const region = composerRegionOf(from);
    expect((region as Element).id).toBe('common');
    expect((region as Element).tagName).not.toBe('BODY');
  });

  it('still refuses when the tightest container holds TWO composers', () => {
    // Fail-closed now rests on the uniqueness test rather than on a hop count
    // that also happened to break the feature.
    const { from } = splitTree(4);
    const second = document.createElement('div');
    second.setAttribute('contenteditable', 'true');
    second.setAttribute('role', 'textbox');
    document.getElementById('common')?.append(second);
    giveEverythingLayout();
    const region = composerRegionOf(from);
    expect(editableWithinRegion(region as Element)).toBeNull();
  });
});
