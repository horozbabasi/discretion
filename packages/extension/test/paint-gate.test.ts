// @vitest-environment jsdom
/**
 * The paint gate.
 *
 * This gate has now been wrong in both directions, which is why it is tested
 * directly rather than through the console renderer:
 *
 *   - the instrument it replaced CONCLUDED when it should not have, reporting a
 *     shell snapshot as a selector verdict;
 *   - its first version REFUSED when it should have concluded, withholding on a
 *     page showing 6 buttons, a rich-textarea and 34 custom elements, because
 *     an invented floor of 400 light-DOM elements said "un-painted".
 *
 * Both produce unusable readings. The fix is structural: the gate is DERIVED
 * from the probe data, so it cannot contradict the evidence it gates. These
 * tests pin that it cannot drift back to a proxy.
 */

import { describe, expect, it } from 'vitest';

import { paintEvidence } from '../src/debug.js';
import type { EnvironmentForensics } from '../src/diagnostics.js';

function forensics(overrides: Partial<EnvironmentForensics>): EnvironmentForensics {
  return {
    readyState: 'complete',
    msSinceScriptStart: 1200,
    attempt: 2,
    domElementCount: 0,
    openShadowRoots: 0,
    maxShadowDepth: 0,
    likelyClosedShadowHosts: [],
    iconNames: [],
    iframes: 0,
    probes: {},
    customElements: [],
    sendSearch: null,
    editableCandidates: [],
    controlCandidates: [],
    ...overrides,
  };
}

describe('paint gate', () => {
  it('does NOT withhold on a small but plainly painted page', () => {
    // The exact reading that exposed the defect: well under the old 400-element
    // floor, yet showing controls, a rich-textarea and 34 custom elements.
    const f = forensics({
      domElementCount: 312,
      probes: { button: { light: 6, deep: 6 }, '[role="button"]': { light: 1, deep: 1 } },
      customElements: Array.from({ length: 34 }, (_, i) => `x-el-${i}`),
      editableCandidates: [
        {
          tag: 'div', type: null, visible: true, editable: true, disabled: false,
          readOnly: false, textLength: 0, attributes: [], ancestors: [], failsInvariants: [],
          ariaHiddenAncestor: null,
        },
        {
          tag: 'textarea', type: null, visible: false, editable: true, disabled: false,
          readOnly: false, textLength: 0, attributes: [], ancestors: [], failsInvariants: [],
          ariaHiddenAncestor: null,
        },
      ],
    });

    const evidence = paintEvidence(f);
    expect(evidence.painted).toBe(true);
    expect(evidence.controls).toBe(7);
    expect(evidence.editables).toBe(2);
  });

  it('element count alone can never force a withhold', () => {
    // The specific regression: a low count must not override positive evidence.
    const f = forensics({
      domElementCount: 1,
      probes: { button: { light: 3, deep: 3 } },
    });
    expect(paintEvidence(f).painted).toBe(true);
  });

  it('element count alone can never force a conclusion either', () => {
    // The mirror: a huge DOM with nothing recognisable in it is not evidence
    // that the app rendered.
    const f = forensics({ domElementCount: 50_000 });
    expect(paintEvidence(f).painted).toBe(false);
  });

  it('withholds only when NOTHING has rendered', () => {
    const f = forensics({ domElementCount: 40 });
    const evidence = paintEvidence(f);
    expect(evidence.painted).toBe(false);
    expect(evidence.controls).toBe(0);
    expect(evidence.editables).toBe(0);
    expect(evidence.customElements).toBe(0);
  });

  it('treats any single kind of positive evidence as sufficient', () => {
    expect(paintEvidence(forensics({ customElements: ['rich-textarea'] })).painted).toBe(true);
    expect(
      paintEvidence(
        forensics({
          editableCandidates: [
            {
              tag: 'textarea', type: null, visible: true, editable: true, disabled: false,
              readOnly: false, textLength: 0, attributes: [], ancestors: [], failsInvariants: [],
          ariaHiddenAncestor: null,
            },
          ],
        }),
      ).painted,
    ).toBe(true);
    expect(paintEvidence(forensics({ probes: { '[role="button"]': { light: 1, deep: 1 } } })).painted).toBe(
      true,
    );
  });
});
