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

/**
 * Normalises any CSS colour to an rgb()/rgba() string.
 *
 * `getComputedStyle().backgroundColor` PRESERVES THE AUTHORED COLOUR SPACE for
 * CSS Color 4 functions, so a site using `oklch()`, `lab()`, `hwb()` or
 * `color(srgb ...)` — which is what a relative-colour or wide-gamut palette
 * serialises to — hands back a string no rgb() regex matches. The sampler then
 * finds nothing opaque, walks to the top, and falls back to the OS preference:
 * the panel silently stops following the page's theme on exactly the modern
 * sites most likely to use those functions.
 *
 * The 2D canvas colour parser accepts every CSS colour syntax and returns sRGB,
 * with no network access and no layout. It is used when available, with the
 * regex kept as the fallback for environments that have no canvas.
 */
/**
 * One 2D context per document, created on first use.
 *
 * `detectTheme` walks up to twelve ancestors and parses a colour at each, so a
 * fresh canvas per parse is up to twelve elements created and discarded per
 * theme decision. It is also the difference between one failed getContext in
 * an environment without canvas and one per parse.
 */
const COLOUR_CONTEXTS = new WeakMap<Document, CanvasRenderingContext2D | null>();

function colourContext(doc: Document): CanvasRenderingContext2D | null {
  const cached = COLOUR_CONTEXTS.get(doc);
  if (cached !== undefined) return cached;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = doc.createElement('canvas').getContext('2d');
  } catch {
    context = null;
  }
  COLOUR_CONTEXTS.set(doc, context);
  return context;
}

function normaliseColour(value: string, doc: Document): string {
  const context = colourContext(doc);
  if (context === null) return value;
  try {
    // Parsed against two different sentinels. A value the CSS parser REJECTS
    // leaves fillStyle untouched, so a single pass would read the sentinel
    // back and report opaque black - making every unrecognised colour look
    // like a dark page. Agreement across two sentinels means the value was
    // actually parsed.
    context.fillStyle = '#000000';
    context.fillStyle = value;
    const first = String(context.fillStyle);
    context.fillStyle = '#ffffff';
    context.fillStyle = value;
    return first === String(context.fillStyle) ? first : value;
  } catch {
    return value;
  }
}

/** Parsed sRGB, or null if the colour is transparent or unparseable. */
function parseOpaqueColour(value: string): { r: number; g: number; b: number } | null {
  const hex = /^#([0-9a-f]{6})$/iu.exec(value.trim());
  if (hex !== null) {
    const n = Number.parseInt(hex[1] as string, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
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
    const raw = view.getComputedStyle(node).backgroundColor;
    const colour = parseOpaqueColour(normaliseColour(raw, doc));
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
