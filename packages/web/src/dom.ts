/**
 * dom.ts — programmatic node construction, the only way this package builds
 * DOM. SPEC.md's extension-security rule ("no innerHTML with any untrusted
 * content; construct nodes programmatically") is adopted for the playground
 * too: user text and corpus text only ever enter the page as Text nodes.
 */

type Attrs = Readonly<Record<string, string>>;
type Child = Node | string;

/** Create an element; string children become Text nodes (never parsed). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') node.className = value;
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

/** Replace an element's children wholesale (clears, then appends). */
export function setChildren(parent: HTMLElement, children: readonly Child[]): void {
  parent.replaceChildren(...children);
}
