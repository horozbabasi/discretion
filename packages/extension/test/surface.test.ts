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
  items: [
    {
      id: 'a',
      entityType: 'EMAIL',
      confidence: 0.97,
      explanation: 'Looks like a personal email address.',
      surrogate: 'jane.doe@example.org',
      reverted: false,
    },
    {
      id: 'b',
      entityType: 'IBAN',
      confidence: 0.99,
      explanation: 'Passed the IBAN checksum.',
      surrogate: 'GB29NWBK60161331926819',
      reverted: true,
    },
  ],
};

function makeSurface(): {
  surface: Surface;
  root: ShadowRoot;
  calls: { confirm: number; cancel: number; toggled: string[] };
} {
  const calls = { confirm: 0, cancel: 0, toggled: [] as string[] };
  const surface = new Surface(document, {
    onConfirm: () => {
      calls.confirm += 1;
    },
    onCancel: () => {
      calls.cancel += 1;
    },
    onToggleItem: (id) => calls.toggled.push(id),
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

  it('resets inherited properties at :host, which the shadow boundary does not', () => {
    // The half of SPEC's requirement that shadow DOM does NOT give for free:
    // font-family, colour, line-height and letter-spacing all inherit across
    // the boundary, so a host page can restyle the panel without ever
    // selecting it.
    const { root } = makeSurface();
    const style = root.querySelector('style');
    expect(style?.textContent).toContain('all: initial');
  });

  it('never uses innerHTML', () => {
    // SPEC: "No innerHTML with any untrusted content; construct nodes
    // programmatically." Kept absolute so no future caller has to know which
    // strings are safe.
    const { surface, root } = makeSurface();
    const hostile: ReviewContent = {
      exposureScore: 10,
      items: [
        {
          id: 'x',
          entityType: '<img src=x onerror="alert(1)">',
          confidence: 0.5,
          explanation: '<script>alert(2)</script>',
          surrogate: '</style><b>bold</b>',
          reverted: false,
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
    const evidence = sendControlNotExpected(composer, '') as Inapplicable;

    const { surface, root } = makeSurface();
    surface.setState({ kind: 'inactive', evidence });

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
    // Two per-item toggles plus Cancel and Mask-and-send.
    expect(buttons).toHaveLength(4);
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
    const buttons = Array.from(root.querySelectorAll('button'));

    buttons[0]?.click();
    expect(calls.toggled).toEqual(['a']);
    buttons[2]?.click();
    expect(calls.cancel).toBe(1);
    buttons[3]?.click();
    expect(calls.confirm).toBe(1);
  });

  it('shows a reverted item as reverted, and offers to re-mask it', () => {
    const { surface, root } = makeSurface();
    surface.setState({ kind: 'review', content: REVIEW });
    const items = Array.from(root.querySelectorAll('.item'));
    expect(items[0]?.getAttribute('data-reverted')).toBe('false');
    expect(items[1]?.getAttribute('data-reverted')).toBe('true');
    expect(items[1]?.querySelector('button')?.textContent).toBe('Mask this');
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
    expect(host.style.left).toBe('50%');
    expect(host.style.bottom).toBe('16px');
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
