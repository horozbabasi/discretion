/**
 * Node construction for the extension's own pages.
 *
 * SPEC.md, security of the extension itself: "No innerHTML with any untrusted
 * content; construct nodes programmatically." These helpers are how that rule
 * is kept without it having to be remembered — there is no parameter here that
 * takes markup, so the popup and options pages cannot express the mistake.
 *
 * Text always arrives through `textContent`, which is why a translation
 * containing `<` or an entity type name is inert rather than parsed.
 */

/** Creates an element, optionally with a class and text. Never parses markup. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined && className.length > 0) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Appends children and returns the parent, so trees read as trees. */
export function append<T extends HTMLElement>(parent: T, ...children: (Node | null)[]): T {
  for (const child of children) {
    if (child !== null) parent.append(child);
  }
  return parent;
}

/** Empties a node without touching innerHTML. */
export function clear(node: HTMLElement): void {
  while (node.firstChild !== null) node.firstChild.remove();
}

/** `document.getElementById`, but it throws rather than returning null. */
export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`missing element #${id}`);
  return node as T;
}
