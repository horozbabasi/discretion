/**
 * Composer invariants: the properties that separate "an element was found"
 * from "the right KIND of element was found".
 *
 * These are deliberately about the element's NATURE rather than its
 * appearance. A check like "it is near the bottom of the screen" would pass
 * for a decoy and fail on a legitimate redesign, which is the wrong way round
 * on both counts.
 */

import type { Invariant } from './types.js';

const EDITABLE_INPUT_TYPES = new Set(['text', 'search', 'url', 'email', 'tel', '']);

/**
 * Whether an element is a surface a user can type into.
 *
 * Shared with binding.ts, which needs the same notion when deriving the
 * submitted element from a keyboard event. They must agree: if the two
 * disagreed about what counts as editable, the identity binding could compare
 * a node against a differently-scoped answer and pass when it should block.
 */
export function isEditableSurface(node: unknown): node is HTMLElement {
  // `unknown` rather than `Node`: callers pass entries from composedPath(),
  // which are EventTargets and may not be nodes at all (Window, for one).
  if (!(node instanceof Element)) return false;
  const element = node;

  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (element instanceof HTMLInputElement) {
    return (
      EDITABLE_INPUT_TYPES.has(element.type.toLowerCase()) && !element.disabled && !element.readOnly
    );
  }
  if (!(element instanceof HTMLElement)) return false;

  // `isContentEditable` is the browser's own resolved answer and is preferred
  // when present. It is not universally implemented, though - jsdom omits it -
  // and an editability check that silently returns false in some environment
  // would make every composer look like a non-composer. So fall back to
  // resolving the attribute the way the HTML spec says it inherits, rather
  // than to a bare attribute test that would miss inherited editability and
  // would wrongly accept a node inside a contenteditable="false" island.
  if (typeof element.isContentEditable === 'boolean') return element.isContentEditable;
  return resolveInheritedEditability(element);
}

/** Nearest ancestor (inclusive) with an explicit contenteditable state. */
function resolveInheritedEditability(element: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node !== null) {
    const value = node.getAttribute('contenteditable');
    if (value !== null) {
      const normalised = value.toLowerCase();
      if (normalised === 'false') return false;
      return normalised === '' || normalised === 'true' || normalised === 'plaintext-only';
    }
    node = node.parentElement;
  }
  return false;
}

function isRendered(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style === undefined) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  const rect = element.getBoundingClientRect();
  // A composer the user can type into is never smaller than a line of text.
  return rect.width >= 40 && rect.height >= 12;
}

export const COMPOSER_INVARIANTS: readonly Invariant<HTMLElement>[] = [
  {
    id: 'connected',
    requirement: 'The element is attached to the live document.',
    holds: (element) => element.isConnected,
  },
  {
    id: 'editable',
    requirement:
      'The element is a textarea, a text-like input, or contenteditable, and is neither disabled nor read-only.',
    holds: isEditableSurface,
  },
  {
    id: 'rendered',
    requirement:
      'The element is displayed, visible, and at least one line of text in size. Hidden or zero-size editable nodes are template fragments and offscreen measurement clones, never the composer.',
    holds: isRendered,
  },
  {
    id: 'not-aria-hidden',
    requirement:
      'The element is not inside an aria-hidden subtree. Sites mark inert duplicates that way, and an inert duplicate is exactly the decoy this check exists to reject.',
    holds: (element) => element.closest('[aria-hidden="true"]') === null,
  },
];

/**
 * Invariants for the element that holds the assistant's streamed reply.
 *
 * Weaker than the composer's, and deliberately so: getting the response root
 * wrong means restoration does not happen or happens in the wrong place, which
 * is a visible bug. It is not a leak, because nothing sensitive is written
 * anywhere as a result. The strict machinery is spent where the consequence is
 * a leak.
 */
export const RESPONSE_ROOT_INVARIANTS: readonly Invariant<Element>[] = [
  {
    id: 'connected',
    requirement: 'The element is attached to the live document.',
    holds: (element) => element.isConnected,
  },
  {
    id: 'not-the-composer',
    requirement:
      'The response root is not itself an editable surface. If these ever resolved to the same node, restoration would write assistant text into the composer.',
    holds: (element) => !isEditableSurface(element),
  },
];
