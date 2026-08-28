/**
 * Deciding whether the host page is light or dark.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SPEC: "Respect the host page's LIGHT/DARK THEME."
 *
 * The obvious implementation is `prefers-color-scheme`, and it answers a
 * different question: that is the OPERATING SYSTEM's preference, not the
 * page's. All three target sites have their own theme switcher, and a user
 * running ChatGPT in dark mode on a light-themed OS is entirely ordinary. A
 * panel that followed the OS would be a bright card in the middle of a dark
 * conversation — visibly not part of the page, which is exactly the failure
 * SPEC is guarding against.
 *
 * So the page's own rendered background is measured, and the OS preference is
 * used only as a fallback for when nothing conclusive can be sampled (a
 * transparent body over a painted html element, an unusual stacking, a page
 * that has not painted yet).
 *
 * Sampling walks up from the composer rather than reading `document.body`,
 * because a site can paint its conversation area differently from the document
 * background, and the panel sits beside the composer rather than beside the
 * body.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Theme = 'light' | 'dark';

/** Parsed sRGB, or null if the colour is transparent or unparseable. */
function parseOpaqueColour(value: string): { r: number; g: number; b: number } | null {
  const match = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/iu.exec(
    value.trim(),
  );
  if (match === null) return null;
  const alpha = match[4] === undefined ? 1 : Number.parseFloat(match[4]);
  // Anything materially transparent tells us nothing about what is behind it.
  if (!Number.isFinite(alpha) || alpha < 0.5) return null;
  return {
    r: Number.parseFloat(match[1] ?? '0'),
    g: Number.parseFloat(match[2] ?? '0'),
    b: Number.parseFloat(match[3] ?? '0'),
  };
}

/**
 * Relative luminance, WCAG's definition.
 *
 * Used rather than a plain average because perceived brightness is not the
 * mean of the channels: a saturated blue and a saturated yellow of the same
 * average are nowhere near equally light, and picking the wrong one puts light
 * text on a light panel.
 */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The OS preference. Only a fallback — see the header. */
function systemPreference(view: Window): Theme {
  try {
    return view.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * The effective theme, measured from what the page actually paints near
 * `anchor`, falling back to the OS preference.
 */
export function detectTheme(anchor: Element | null, doc: Document): Theme {
  const view = doc.defaultView;
  if (view === null) return 'light';

  let node: Element | null = anchor ?? doc.body;
  let hops = 0;
  while (node !== null && hops < 12) {
    const colour = parseOpaqueColour(view.getComputedStyle(node).backgroundColor);
    if (colour !== null) {
      // 0.5 is the midpoint of the luminance range, not of the 0-255 range;
      // WCAG luminance is already perceptual, so a simple threshold is right.
      return relativeLuminance(colour) < 0.5 ? 'dark' : 'light';
    }
    node = node.parentElement;
    hops += 1;
  }
  return systemPreference(view);
}

/**
 * Re-evaluates on OS preference change and returns an unsubscribe.
 *
 * A site's own theme toggle does not fire this — nothing does, since a class
 * change on `<html>` is not an observable event on its own. The surface
 * re-detects whenever it is shown, which covers the case a user actually
 * notices: toggle the theme, then open the panel.
 */
export function onSystemThemeChange(doc: Document, listener: () => void): () => void {
  const view = doc.defaultView;
  if (view === null) return () => undefined;
  try {
    const query = view.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  } catch {
    return () => undefined;
  }
}
