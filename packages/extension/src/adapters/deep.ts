/**
 * Querying across open shadow roots.
 *
 * `document.querySelectorAll` does not descend into shadow roots. Gemini is an
 * Angular application built from custom elements, and its composer has lived
 * inside a `<rich-textarea>` element that may attach a shadow root — so a
 * document-wide query can return NOTHING while the composer is plainly on
 * screen. That would surface as a `not-found` failure and a blocked send on a
 * healthy page.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS DOES NOT WEAKEN THE AMBIGUITY RULE
 *
 * Piercing shadow boundaries widens what a strategy can see, and widening a
 * search is normally how you acquire a decoy. It does not here, because the
 * contract's admission rules are applied to whatever this returns, unchanged:
 * candidates still have to satisfy every invariant, and two surviving
 * candidates are still a hard failure. Reaching into a shadow root changes
 * WHERE candidates come from, not WHICH ones are accepted.
 *
 * CLOSED shadow roots are deliberately not reachable. `element.shadowRoot` is
 * null for them and there is no supported way in. An adapter that cannot see
 * the composer reports `not-found`, which blocks — the loud failure, which is
 * the correct one. What must never happen is silently resolving some other
 * element because the real one was invisible to the query.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** A bound on traversal depth, so a pathological tree cannot hang the page. */
const MAX_SHADOW_DEPTH = 12;

/**
 * Like `querySelectorAll`, but also descends into open shadow roots.
 *
 * Returns nodes in document order within each root, roots visited
 * breadth-first. Order is not relied on by any caller: the ambiguity rule
 * means a strategy that matches more than one node fails rather than picking,
 * so "which came first" is never a question the system asks.
 */
export function deepQueryAll<E extends Element = Element>(
  root: ParentNode,
  selector: string,
): E[] {
  const found: E[] = [];
  const seen = new Set<Element>();

  const visit = (node: ParentNode, depth: number): void => {
    if (depth > MAX_SHADOW_DEPTH) return;

    for (const element of Array.from(node.querySelectorAll<E>(selector))) {
      if (seen.has(element)) continue;
      seen.add(element);
      found.push(element);
    }

    // Every element in this root may host a shadow root of its own.
    for (const element of Array.from(node.querySelectorAll('*'))) {
      const shadow = element.shadowRoot;
      if (shadow !== null) visit(shadow, depth + 1);
    }
  };

  visit(root, 0);
  return found;
}

/**
 * Like `closest`, but climbs out of open shadow roots via their hosts.
 *
 * `Element.closest` stops at a shadow boundary, so a send button inside a
 * shadow root would appear to have no composer region at all — and the button
 * path of the submit binding would report the send undecidable, blocking it.
 */
export function closestAcrossShadow(start: Element, selector: string): Element | null {
  let node: Element | null = start;
  let hops = 0;
  while (node !== null && hops < MAX_SHADOW_DEPTH) {
    const match = node.closest(selector);
    if (match !== null) return match;

    const root = node.getRootNode();
    if (root instanceof ShadowRoot) {
      node = root.host;
      hops += 1;
      continue;
    }
    return null;
  }
  return null;
}

/** The parent of an element, stepping out of an open shadow root if needed. */
export function parentAcrossShadow(element: Element): Element | null {
  if (element.parentElement !== null) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}
