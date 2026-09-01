// @vitest-environment jsdom
/**
 * The injected surface: isolation, keyboard, ARIA, and survival.
 *
 * SPEC line 293: "All injected UI inside a shadow DOM so host CSS cannot break
 * it and it cannot break the host." Both halves are tested, because they fail
 * differently: leaking OUT is visible immediately on any site, while being
 * broken FROM the host shows up only on the one site that sets the property
 * nobody thought of.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Surface } from '../src/ui/surface.js';
import type { ReviewContent } from '../src/ui/surfaceState.js';
import { sendControlNotExpected } from '../src/ui/surfaceState.js';
import type { Inapplicable } from '../src/ui/surfaceState.js';
import { resetDocument } from './dom-helpers.js';

const REVIEW: ReviewContent = {
  exposureScore: 62,
  groups: [
    {
      entityType: 'EMAIL',
      label: 'Email',
      items: [
        {
          id: 'a',
          confidence: 0.97,
          explanation: 'Looks like a personal email address.',
          surrogate: 'jane.doe@example.org',
          reverted: false,
        },
        {
          id: 'c',
          confidence: 0.91,
          explanation: 'Matched a known pattern.',
          surrogate: 'sam.reed@example.net',
          reverted: false,
        },
      ],
    },
    {
      entityType: 'IBAN',
      label: 'IBAN',
      items: [
        {
          id: 'b',
          confidence: 0.99,
          explanation: 'Passed the IBAN checksum.',
          surrogate: 'GB29NWBK60161331926819',
          reverted: true,
        },
      ],
    },
  ],
};

interface Calls {
  confirm: number;
  cancel: number;
  toggled: string[];
  anchorLost: number;
  surfaceLost: number;
}

function makeSurface(): { surface: Surface; root: ShadowRoot; calls: Calls } {
  const calls: Calls = { confirm: 0, cancel: 0, toggled: [], anchorLost: 0, surfaceLost: 0 };
  const surface = new Surface(document, {
    onConfirm: () => {
      calls.confirm += 1;
    },
    onCancel: () => {
      calls.cancel += 1;
    },
    onToggleItem: (id) => calls.toggled.push(id),
    onAnchorLost: () => {
      calls.anchorLost += 1;
    },
    onSurfaceLost: () => {
      calls.surfaceLost += 1;
    },
  });
  surface.mount();
  const root = surface.shadowRootForTesting();
  if (root === null) throw new Error('no shadow root');
  return { surface, root, calls };
}

beforeEach(resetDocument);

describe('isolation', () => {
  it('renders into a CLOSED shadow root the page cannot read', () => {
    const { surface } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    const host = document.querySelector('privacyshield-surface');
    expect(host).not.toBeNull();
    // The page's own route in is null: `mode: closed`. The panel lists which
    // entity TYPES were found in the user's text, and the page is the party
    // this extension exists to withhold that from.
    expect((host as Element).shadowRoot).toBeNull();
    // We still hold it.
    expect(surface.shadowRootForTesting()).not.toBeNull();
  });

  it('puts NOTHING of its content in the light DOM', () => {
    const { surface } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    // Nothing can leak out to be styled or read by the host.
    expect(document.body.textContent).not.toContain('EMAIL');
    expect(document.body.textContent).not.toContain('Mask and send');
  });

  it('declares every structural property with !important, which is what wins the cascade', () => {
    // The half of SPEC's requirement that shadow DOM does NOT give for free:
    // font-family, colour, line-height, direction and letter-spacing all
    // inherit across the boundary, so a host page can restyle the panel
    // without ever selecting it.
    //
    // WHAT THIS TEST CAN AND CANNOT ASSERT. It reads the stylesheet, not the
    // rendering: jsdom implements no cascade for shadow trees, so a
    // computed-style assertion here would pass whatever the CSS said and mean
    // nothing. What it checks is the mechanism the guarantee actually rests
    // on - the encapsulation-context step of the cascade puts the OUTER tree
    // ahead of the inner one for NORMAL declarations, so a bare `* { }` in the
    // page beats anything declared here that is not !important. The previous
    // version of this test looked for the substring `all: initial`, which was
    // present and losing.
    const { root } = makeSurface();
    const css = root.querySelector('style')?.textContent ?? '';
    const hostBlocks = css.match(/:host\s*\{[^}]*\}/gu)?.join('\n') ?? '';
    expect(hostBlocks).toContain('all: initial !important');
    for (const property of [
      'position',
      'z-index',
      'display',
      'pointer-events',
      // Not reset by `all`, and both inherit: an RTL page would otherwise
      // mirror the panel.
      'direction',
      'unicode-bidi',
    ]) {
      expect(hostBlocks).toMatch(new RegExp(`${property}\\s*:[^;]*!important`, 'u'));
    }
    // The hidden state has to survive the page too, or a page overriding
    // display leaves an empty band pinned over the composer.
    expect(css).toMatch(/data-hidden='true'\]\)\s*\{\s*display:\s*none\s*!important/u);
  });

  it('never uses innerHTML', () => {
    // SPEC: "No innerHTML with any untrusted content; construct nodes
    // programmatically." Kept absolute so no future caller has to know which
    // strings are safe.
    const { surface, root } = makeSurface();
    const hostile: ReviewContent = {
      exposureScore: 10,
      groups: [
        {
          entityType: 'EMAIL',
          label: '<img src=x onerror="alert(1)">',
          items: [
            {
              id: 'x',
              confidence: 0.5,
              explanation: '<script>alert(2)</script>',
              surrogate: '</style><b>bold</b>',
              reverted: false,
            },
          ],
        },
      ],
    };
    surface.setState({ kind: 'review', content: hostile });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror="alert(1)">');
  });
});

describe('the three states', () => {
  it('review is a dialog that does NOT trap focus', () => {
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    const panel = root.querySelector('.panel');

    expect(panel?.getAttribute('role')).toBe('dialog');
    // Trapping focus inside a panel floating over someone's chat would take
    // the page away from them.
    expect(panel?.getAttribute('aria-modal')).toBe('false');
    expect(panel?.getAttribute('aria-label')).toContain('PrivacyShield');
  });

  it('degraded is an assertive live region and does NOT steal focus', () => {
    const { surface, root } = makeSurface();
    const before = document.createElement('input');
    document.body.append(before);
    before.focus();

    surface.setState({
      kind: 'degraded',
      failures: [{ kind: 'not-found', target: 'composer', detail: 'x', triedStrategies: [] }],
    });

    const panel = root.querySelector('.panel');
    expect(panel?.getAttribute('role')).toBe('alert');
    expect(panel?.getAttribute('aria-live')).toBe('assertive');
    // It can appear while the user is mid-sentence; taking the caret would be
    // worse than the problem it reports.
    expect(document.activeElement).toBe(before);
    expect(root.textContent).toContain('not protecting this page');
  });

  it('inactive renders NOTHING and hides the host', () => {
    // The element is absent by design. A badge saying "waiting" on every page
    // load is noise the user learns to ignore, which is how a real warning
    // gets missed later.
    const composer = document.createElement('div');
    document.body.append(composer);
    const evidence = sendControlNotExpected(composer, () => '') as Inapplicable;

    const { surface, root } = makeSurface();
    surface.setState({ kind: 'inactive', evidence: [evidence] });

    const host = document.querySelector('privacyshield-surface');
    expect(host?.getAttribute('data-hidden')).toBe('true');
    expect(root.querySelector('.panel')?.childElementCount).toBe(0);
  });
});

describe('keyboard and controls', () => {
  it('every control is a real button, so it is reachable and activatable', () => {
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    const buttons = Array.from(root.querySelectorAll('button'));
    // Three per-item toggles plus Cancel and Mask-and-send.
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('type')).toBe('button');
    }
  });

  it('Escape cancels, and only from inside the panel', () => {
    const { surface, root, calls } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    root.querySelector('.panel')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(calls.cancel).toBe(1);

    // A global handler would steal Escape from the page; this one is bound on
    // the shadow root, so a page-level Escape does not reach it.
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(calls.cancel).toBe(1);
  });

  it('Escape does nothing when there is no decision to cancel', () => {
    const { surface, root, calls } = makeSurface();
    surface.setState({
      kind: 'degraded',
      failures: [{ kind: 'not-found', target: 'composer', detail: 'x', triedStrategies: [] }],
    });
    root.querySelector('.panel')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(calls.cancel).toBe(0);
  });

  it('reports confirm, cancel and per-item reverts', () => {
    const { surface, root, calls } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    // Found by what they say rather than by index: the grouped list moves
    // items around, and a positional assertion would pass or fail for reasons
    // having nothing to do with the controls.
    const byText = (label: string): HTMLButtonElement | undefined =>
      Array.from(root.querySelectorAll('button')).find((b) => b.textContent === label);

    root.querySelector('.item button')?.dispatchEvent(new MouseEvent('click'));
    expect(calls.toggled).toEqual(['a']);
    byText('Cancel')?.click();
    expect(calls.cancel).toBe(1);
    byText('Mask and send')?.click();
    expect(calls.confirm).toBe(1);
  });

  it('shows a reverted item as reverted, and offers to re-mask it', () => {
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    const items = Array.from(root.querySelectorAll('.item'));
    const reverted = items.filter((i) => i.getAttribute('data-reverted') === 'true');
    expect(items).toHaveLength(3);
    expect(reverted).toHaveLength(1);
    expect(reverted[0]?.querySelector('button')?.textContent).toBe('Mask this');
    expect(items[0]?.querySelector('button')?.textContent).toBe('Keep original');
  });

  it('restores focus when a blocking panel closes', () => {
    const { surface } = makeSurface();
    const before = document.createElement('input');
    document.body.append(before);
    before.focus();

    surface.setState({ kind: 'review', content: REVIEW });
    surface.setState({ kind: 'hidden' });
    // Focus must not be stranded on a panel that no longer exists.
    expect(document.activeElement).toBe(before);
  });
});

describe('survival', () => {
  it('re-attaches itself if the page removes the host', async () => {
    // Angular, React and ProseMirror all reconcile foreign nodes away. A panel
    // that silently vanished would leave the extension believing it had warned
    // the user.
    const { surface } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    document.querySelector('privacyshield-surface')?.remove();
    expect(document.querySelector('privacyshield-surface')).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('privacyshield-surface')).not.toBeNull();
    surface.destroy();
  });

  it('destroy removes the host and stops listening', async () => {
    const { surface } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    surface.destroy();
    expect(document.querySelector('privacyshield-surface')).toBeNull();

    // And it must not resurrect itself after destroy.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector('privacyshield-surface')).toBeNull();
  });

  it('mount is idempotent', () => {
    const { surface } = makeSurface();
    surface.mount();
    expect(document.querySelectorAll('privacyshield-surface')).toHaveLength(1);
  });

  it('positions itself without an anchor rather than at the origin', () => {
    // At 0,0 it would cover the page's own controls.
    const { surface } = makeSurface();
    surface.setAnchor(null);
    surface.setState({ kind: 'review', content: REVIEW });
    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(host.style.getPropertyValue('--ps-left')).toBe('50%');
    expect(host.style.getPropertyValue('--ps-bottom')).toBe('16px');
  });
});

describe('theme', () => {
  it('follows the page background rather than the OS preference', () => {
    // The OS preference answers a different question: all three sites have
    // their own theme switcher, and a dark page on a light OS is ordinary.
    const anchor = document.createElement('div');
    document.body.append(anchor);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      backgroundColor: 'rgb(20, 22, 26)',
      cursor: 'auto',
    } as unknown as CSSStyleDeclaration);

    const { surface } = makeSurface();
    surface.setAnchor(anchor);
    surface.setState({ kind: 'review', content: REVIEW });

    const host = document.querySelector('privacyshield-surface');
    expect(host?.getAttribute('data-theme')).toBe('dark');
    vi.restoreAllMocks();
  });
});

describe('semantics do not survive a state change', () => {
  const FAILURE = { kind: 'not-found', target: 'composer', detail: 'x', triedStrategies: [] } as const;

  it('drops the dialog role and label when review becomes degraded', () => {
    // Each renderer used to set only the attributes it cared about, so
    // renderDegraded left the dialog's aria-label in place and the alert was
    // announced as "PrivacyShield: review what will be masked before sending"
    // - a label describing a panel that is no longer there, read out instead
    // of the failure that replaced it.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    surface.setState({ kind: 'degraded', failures: [FAILURE] });

    const panel = root.querySelector('.panel');
    expect(panel?.getAttribute('role')).toBe('alert');
    expect(panel?.getAttribute('aria-label')).toBeNull();
    expect(panel?.getAttribute('aria-modal')).toBeNull();
  });

  it('drops the alert role when degraded becomes review', () => {
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'degraded', failures: [FAILURE] });
    surface.setState({ kind: 'review', content: REVIEW });

    const panel = root.querySelector('.panel');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-live')).toBeNull();
    expect(panel?.getAttribute('aria-atomic')).toBeNull();
  });

  it('leaves no role at all on a hidden panel', () => {
    // A role="dialog" on a display:none panel is a dialog the accessibility
    // tree still knows about and the user cannot reach.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    surface.setState({ kind: 'hidden' });

    const panel = root.querySelector('.panel');
    expect(panel?.getAttribute('role')).toBeNull();
    expect(panel?.getAttribute('aria-label')).toBeNull();
    expect(panel?.hasAttribute('tabindex')).toBe(false);
  });
});

describe('focus moves on transitions, not on paints', () => {
  const FAILURE = { kind: 'not-found', target: 'composer', detail: 'x', triedStrategies: [] } as const;

  it('does not pull focus back to the panel when a review re-renders', () => {
    // Toggling an item re-renders the list. Taking focus on every render would
    // drag the user off the button they just pressed, back to the panel, so
    // reverting three detections in a row means finding your place three
    // times.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    const toggle = root.querySelectorAll('button')[0] as HTMLButtonElement;
    toggle.focus();
    expect(root.activeElement).toBe(toggle);

    // Same kind, new content - exactly what a revert produces.
    surface.setState({ kind: 'review', content: { ...REVIEW, exposureScore: 40 } });
    expect(root.activeElement).not.toBe(root.querySelector('.panel'));
  });

  it('returns focus when review becomes degraded, not only when it hides', () => {
    // review -> degraded is a real transition out of a blocking panel. Leaving
    // focus on a panel whose contents were just replaced by an alert strands
    // the user inside a live region with nothing to operate.
    const { surface } = makeSurface();
    const before = document.createElement('input');
    document.body.append(before);
    before.focus();

    surface.setState({ kind: 'review', content: REVIEW });
    surface.setState({ kind: 'degraded', failures: [FAILURE] });
    expect(document.activeElement).toBe(before);
  });

  it('returns focus on destroy', () => {
    // If the host goes while the panel holds focus, the active element becomes
    // <body> and a keyboard user loses their place with no way back.
    const { surface } = makeSurface();
    const before = document.createElement('input');
    document.body.append(before);
    before.focus();

    surface.setState({ kind: 'review', content: REVIEW });
    surface.destroy();
    expect(document.activeElement).toBe(before);
  });
});

describe('the anchor is borrowed, and the page takes it back', () => {
  // D34i at the surface layer. The panel is positioned from the composer's
  // rect, so it depends on that element being resolved AND connected - and on
  // all three sites the composer is replaced out from under us: Gemini swaps
  // it on SPA navigation, ChatGPT on a conversation switch.

  function anchored(): { surface: Surface; calls: Calls; composer: HTMLElement } {
    const { surface, calls } = makeSurface();
    const composer = document.createElement('div');
    composer.getBoundingClientRect = () =>
      ({ left: 100, top: 300, right: 500, bottom: 340, width: 400, height: 40 }) as DOMRect;
    document.body.append(composer);
    surface.setAnchor(composer);
    return { surface, calls, composer };
  }

  it('reports the loss instead of silently measuring a detached node', () => {
    // A detached element still answers getBoundingClientRect() - with all
    // zeros. Nothing throws and nothing looks wrong: the panel just pins
    // itself to the fallback position and stays there forever, because nothing
    // would ever notice the anchor had died.
    const { surface, calls, composer } = anchored();
    surface.setState({ kind: 'review', content: REVIEW });
    expect(calls.anchorLost).toBe(0);

    composer.remove();
    // Any measurement afterwards - a scroll, a resize, a re-render - finds it.
    surface.setState({ kind: 'review', content: { ...REVIEW, exposureScore: 12 } });
    expect(calls.anchorLost).toBe(1);
  });

  it('reports the loss only once, not on every scroll event afterwards', () => {
    const { surface, calls, composer } = anchored();
    surface.setState({ kind: 'review', content: REVIEW });
    composer.remove();
    surface.setState({ kind: 'review', content: { ...REVIEW, exposureScore: 12 } });
    surface.setState({ kind: 'review', content: { ...REVIEW, exposureScore: 13 } });
    expect(calls.anchorLost).toBe(1);
  });

  it('keeps a blocking panel VISIBLE when the anchor dies', () => {
    // Hiding a panel because we lost track of an element would be fail-open:
    // the send it was guarding would proceed unreviewed.
    const { surface, composer } = anchored();
    surface.setState({ kind: 'review', content: REVIEW });
    composer.remove();
    surface.setState({ kind: 'review', content: { ...REVIEW, exposureScore: 12 } });

    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(host.getAttribute('data-hidden')).toBe('false');
    expect(host.style.getPropertyValue('--ps-left')).toBe('50%');
  });

  it('refuses a detached element as an anchor in the first place', () => {
    // Accepting one would defer the discovery to the next measurement and then
    // report the loss as if it had just happened, when in fact the caller
    // handed over a dead node.
    const { surface, calls } = makeSurface();
    const dead = document.createElement('div');
    surface.setAnchor(dead);
    surface.setState({ kind: 'review', content: REVIEW });
    // Nothing was lost - nothing was ever accepted.
    expect(calls.anchorLost).toBe(0);
    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(host.style.getPropertyValue('--ps-left')).toBe('50%');
  });

  it('follows a REPLACEMENT anchor once the owner re-resolves', () => {
    const { surface, composer } = anchored();
    surface.setState({ kind: 'review', content: REVIEW });
    composer.remove();

    const replacement = document.createElement('div');
    replacement.getBoundingClientRect = () =>
      ({ left: 40, top: 500, right: 360, bottom: 540, width: 320, height: 40 }) as DOMRect;
    document.body.append(replacement);
    surface.setAnchor(replacement);

    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(host.style.getPropertyValue('--ps-left')).toBe('40px');
    expect(host.style.getPropertyValue('--ps-width')).toBe('320px');
  });
});

describe('positioning stays inside the viewport', () => {
  it('does not shrink below a readable width', () => {
    // The panel carries a blocking decision. Matching a very narrow composer
    // exactly would produce a panel too narrow to read the decision in, which
    // is worse than a panel slightly wider than the thing it points at.
    const { surface } = makeSurface();
    const narrow = document.createElement('div');
    narrow.getBoundingClientRect = () =>
      ({ left: 10, top: 300, right: 90, bottom: 340, width: 80, height: 40 }) as DOMRect;
    document.body.append(narrow);
    surface.setAnchor(narrow);
    surface.setState({ kind: 'review', content: REVIEW });

    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(Number.parseInt(host.style.getPropertyValue('--ps-width'), 10)).toBeGreaterThanOrEqual(240);
  });

  function anchorAt(rect: Partial<DOMRect>): HTMLElement {
    const composer = document.createElement('div');
    composer.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect }) as DOMRect;
    document.body.append(composer);
    return composer;
  }

  it('clamps a composer that starts off the left edge', () => {
    // A horizontally scrolled page can put the composer partly off-screen. A
    // panel positioned faithfully to it would be partly unreachable, with no
    // scrollbar to reach it, because the host is fixed.
    const { surface } = makeSurface();
    surface.setAnchor(
      anchorAt({ left: -220, top: 300, right: 180, bottom: 340, width: 400, height: 40 }),
    );
    surface.setState({ kind: 'review', content: REVIEW });

    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(Number.parseInt(host.style.getPropertyValue('--ps-left'), 10)).toBeGreaterThanOrEqual(0);
  });

  it('clamps a composer wider than the window', () => {
    const { surface } = makeSurface();
    const wide = window.innerWidth + 400;
    surface.setAnchor(
      anchorAt({ left: 0, top: 300, right: wide, bottom: 340, width: wide, height: 40 }),
    );
    surface.setState({ kind: 'review', content: REVIEW });

    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(Number.parseInt(host.style.getPropertyValue('--ps-width'), 10)).toBeLessThanOrEqual(window.innerWidth);
  });
});

describe('stacking and survival bounds', () => {
  it('declares itself a manual popover so it renders in the top layer', () => {
    // z-index cannot win this: 2147483000 loses to 2147483647, and a page
    // transform on <body> or <html> would take the fixed-positioning
    // containing block away entirely. A top-layer box is positioned against
    // the viewport and paints above every stacking context in the document.
    // "manual" because an auto popover light-dismisses on an outside click,
    // and a panel blocking a send must not vanish because the user clicked the
    // page behind it.
    makeSurface();
    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(host.getAttribute('popover')).toBe('manual');
  });

  it('gives up re-attaching after a bound, and says so', async () => {
    // Unbounded re-attachment turns a page that removes unknown children on a
    // schedule into a mutation loop that never settles. Bounded, the failure is
    // loud: the surface is showing nothing and can no longer claim to have
    // warned anyone.
    const { surface, calls } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    for (let attempt = 0; attempt < 40; attempt += 1) {
      document.querySelector('privacyshield-surface')?.remove();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(calls.surfaceLost).toBe(1);
    expect(document.querySelector('privacyshield-surface')).toBeNull();
    surface.destroy();
  });
});

describe('findings: what was detected, not a decision', () => {
  it('is a labelled region, not a dialog and not an alert', () => {
    // It appears and updates while someone is writing. `role="alert"` would
    // interrupt them on every keystroke that changed the count, and
    // `role="dialog"` would announce a question that is not being asked.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'findings', content: REVIEW });

    const panel = root.querySelector('.panel');
    expect(panel?.getAttribute('role')).toBe('region');
    expect(panel?.getAttribute('aria-live')).toBeNull();
    expect(panel?.getAttribute('aria-modal')).toBeNull();
    expect(panel?.getAttribute('aria-label')).toContain('detected');
  });

  it('does NOT take focus, because the user is mid-sentence', () => {
    const { surface } = makeSurface();
    const composer = document.createElement('input');
    document.body.append(composer);
    composer.focus();

    surface.setState({ kind: 'findings', content: REVIEW });
    expect(document.activeElement).toBe(composer);
  });

  it('offers NO Cancel and NO "Mask and send", because there is no send to gate', () => {
    // A button that silently does nothing is worse than an absent one, and
    // SPEC's no-stubs rule applies to UI as much as to functions. The
    // per-item reverts are here because they record a real decision; the
    // actions are not, because there is nothing for them to act on yet.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'findings', content: REVIEW });

    const labels = Array.from(root.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).not.toContain('Cancel');
    expect(labels).not.toContain('Mask and send');
    expect(labels.filter((l) => l === 'Keep original' || l === 'Mask this')).toHaveLength(3);
  });

  it('says what will actually happen when the user sends', () => {
    // This assertion moved WITH the send gate rather than after it. Before the
    // gate it read "does not yet intercept sends", which was the honest thing
    // while that was true; leaving it once the gate landed would have been the
    // same failure in the opposite direction - a panel whose text no longer
    // describes what the software does.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'findings', content: REVIEW });
    expect(root.textContent).toContain('asked to confirm');
    expect(root.textContent).not.toContain('does not yet intercept');
  });
});

describe('detections are grouped by type', () => {
  // SPEC.md: "detections grouped by type".
  it('renders one section per type, each with its own count', () => {
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    const groups = Array.from(root.querySelectorAll('.group'));
    expect(groups).toHaveLength(2);
    expect(groups[0]?.getAttribute('data-entity-type')).toBe('EMAIL');
    expect(groups[0]?.querySelector('.group-title')?.textContent).toBe('Email (2)');
    expect(groups[1]?.querySelector('.group-title')?.textContent).toBe('IBAN (1)');
  });

  it('labels each list by its heading rather than repeating the type per row', () => {
    // A screen-reader user hears the group name once on entering the list,
    // not once per row.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    for (const list of Array.from(root.querySelectorAll('ul.items'))) {
      const id = list.getAttribute('aria-labelledby');
      expect(id).not.toBeNull();
      expect(root.getElementById(id as string)).not.toBeNull();
    }
  });

  it('disambiguates same-type revert controls by position', () => {
    // Two detected email addresses otherwise produce two buttons with
    // identical accessible names, and a screen-reader user reading the button
    // list alone cannot tell which one reverts which detection.
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });

    const names = Array.from(root.querySelectorAll('.item button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(new Set(names).size).toBe(names.length);
    // WCAG 2.5.3: the accessible name starts with the visible text, so speech
    // input still activates the button by what is written on it.
    expect(names[0]).toBe('Keep original: Email, item 1 of 3');
    expect(names[2]).toBe('Mask this: IBAN, item 3 of 3');
  });
});

describe('the degraded panel says what actually went wrong', () => {
  // Found by reading a screenshot of the live run. The panel took only the
  // failure TARGETS and printed one fixed sentence - "this site's layout
  // changed" - so every send-gate refusal rendered as a claim about the site
  // being broken. That is not a vaguer truth, it is a different and false one,
  // and it tells the user to do nothing when there is something they can do.
  const failure = (target: string, detail: string) =>
    ({ kind: 'invariant', target, detail, triedStrategies: [] }) as const;

  it('renders the reason the caller gave', () => {
    const { surface, root } = makeSurface();
    surface.setState({
      kind: 'degraded',
      failures: [failure('send', 'Your message is masked and ready. Press send again to send it.')],
    });
    expect(root.textContent).toContain('Press send again');
  });

  it('does not claim the site changed when a single send was refused', () => {
    const { surface, root } = makeSurface();
    surface.setState({
      kind: 'degraded',
      failures: [failure('send', 'This message was not sent: the write did not stick.')],
    });
    expect(root.textContent).toContain('did not send this message');
    expect(root.textContent).not.toContain("layout changed");
  });

  it('still reports a page-level failure as one', () => {
    const { surface, root } = makeSurface();
    surface.setState({
      kind: 'degraded',
      failures: [
        { kind: 'not-found', target: 'composer', detail: 'x', triedStrategies: [] },
      ],
    });
    expect(root.textContent).toContain('not protecting this page');
    expect(root.textContent).toContain('Could not find: composer');
  });
});

describe('the panel is actually positioned where it is computed to be', () => {
  // Found in a live screenshot, not by a test. `styles.ts` declares
  // `all: initial !important` on :host to stop the page restyling the panel,
  // and an author-important declaration outranks a non-important INLINE one -
  // so the stylesheet protecting the panel was resetting the panel's own
  // position, and `position: fixed` with no offsets falls back to the static
  // position: the top-left of <body>. It rendered in the corner of every page
  // for several batches. The assertions that existed checked STATE and TEXT,
  // and nothing looked at WHERE.
  function anchorAt(rect: Partial<DOMRect>): HTMLElement {
    const node = document.createElement('div');
    node.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect }) as DOMRect;
    document.body.append(node);
    return node;
  }

  it('sets its offsets as IMPORTANT, so the reset cannot win', () => {
    const { surface } = makeSurface();
    surface.setAnchor(anchorAt({ left: 120, top: 400, right: 560, bottom: 448, width: 440, height: 48 }));
    surface.setState({ kind: 'review', content: REVIEW });

    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    // Written as CUSTOM PROPERTIES, which is the only channel that reaches the
    // host past `all: initial !important` - inline `left: ... !important` was
    // tried first and lost, because for important declarations the INNER tree
    // beats the outer one.
    expect(host.style.getPropertyValue('--ps-left')).toBe('120px');
    expect(host.style.getPropertyValue('--ps-width')).toBe('440px');
    // And the stylesheet must actually consume them, or setting them is inert.
    const css = makeSurface().root.querySelector('style')?.textContent ?? '';
    expect(css).toContain('left: var(--ps-left, auto) !important');
  });

  it('clears the previous branch offsets rather than layering on them', () => {
    // The anchored branch sets top/left; the fallback sets bottom/transform. A
    // `bottom` left over from the fallback would pin the panel to two edges at
    // once.
    const { surface } = makeSurface();
    surface.setAnchor(null);
    surface.setState({ kind: 'review', content: REVIEW });
    const host = document.querySelector('privacyshield-surface') as HTMLElement;
    expect(host.style.getPropertyValue('--ps-bottom')).toBe('16px');

    surface.setAnchor(anchorAt({ left: 120, top: 400, right: 560, bottom: 448, width: 440, height: 48 }));
    expect(host.style.getPropertyValue('--ps-bottom')).toBe('');
    expect(host.style.getPropertyValue('--ps-transform')).toBe('');
    // Above the anchor, per SPEC's "panel above the composer". Asserted as a
    // relationship rather than a number: jsdom gives the panel zero height, so
    // a literal would pin the test environment's arithmetic.
    expect(Number.parseInt(host.style.getPropertyValue('--ps-top'), 10)).toBeLessThan(400);
  });
});
