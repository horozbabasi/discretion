/**
 * Restoring surrogates in the response, as it streams into the DOM.
 *
 * SPEC.md, content-script step 8: "Observe the response stream and restore
 * surrogates in the DOM as it arrives."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `Restorer` FROM CORE, WHICH ALREADY EXISTS
 *
 * `packages/core`'s `Restorer` is a LINEAR stream processor: text goes in as
 * chunks, text comes out, and its central guarantee is that it HOLDS BACK a
 * suffix that could still turn out to be a surrogate. That guarantee needs
 * control over what is rendered, and here the site renders. By the time a
 * mutation is observed the characters are already on screen; there is nothing
 * to hold.
 *
 * So the DOM needs the same PROPERTIES arrived at differently:
 *
 *   HOLD ON PARTIAL becomes DO NOTHING ON PARTIAL. A half-arrived surrogate
 *   simply does not match, so it is not replaced. It stays on screen as
 *   whatever the model wrote until the rest arrives and a later mutation
 *   completes it. Nothing is held back because nothing needs to be: not
 *   replacing is already the safe direction.
 *
 *   LONGEST MATCH FIRST is kept exactly. A surrogate that is a prefix of a
 *   longer one must never steal the longer one's match, so candidates are
 *   ordered by descending length.
 *
 *   IDEMPOTENCE is free, and for the reason core relies on: the masker
 *   guarantees originals are collision-distinct from every surrogate, so
 *   re-scanning restored text finds nothing left to replace. That matters
 *   here more than in core, because sites re-render streaming markdown and
 *   the same node is visited many times.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO TOUCH
 *
 * Restoration puts the ORIGINAL back on screen. That is the point - the user
 * should see their own data - but it means being exact about where.
 *
 *   - Never inside an editable. Putting an original into something the user
 *     can send would re-introduce the value into an outgoing path, and while
 *     the gate would mask it again on the way out, the right place to not have
 *     that problem is here.
 *   - Never inside our own surface. The panel shows surrogates deliberately.
 *   - Only within the response root the adapter resolved, never document-wide.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KNOWN LIMITATION, stated rather than discovered later: a surrogate SPLIT
 * ACROSS TEXT NODES is not restored. Markdown rendering can put a value's
 * characters in separate nodes (an emphasis span mid-token). Joining them
 * would mean rewriting the site's element structure while it is streaming
 * into it, which is a much larger risk than the failure it prevents - and the
 * failure is visible and safe: the user sees a surrogate where their value
 * should be, rather than seeing something wrong. The settle pass below gives
 * every such case a second chance once the DOM stops moving.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Vault } from '@discretion/core';

import { isEditableSurface } from '../adapters/index.js';

export interface RestoreStats {
  /** Text nodes actually rewritten. */
  readonly nodesChanged: number;
  /** Individual surrogate occurrences replaced. */
  readonly occurrences: number;
}

export class DomRestorer {
  private readonly vault: Vault;
  private readonly hostTag: string;

  constructor(vault: Vault, hostTag: string) {
    this.vault = vault;
    this.hostTag = hostTag.toUpperCase();
  }

  /**
   * Restore every complete surrogate occurrence in these text nodes.
   *
   * Safe to call repeatedly on the same nodes; see IDEMPOTENCE above.
   */
  apply(nodes: Iterable<Text>): RestoreStats {
    let nodesChanged = 0;
    let occurrences = 0;

    for (const node of nodes) {
      if (!this.mayRestoreIn(node)) continue;
      const before = node.nodeValue ?? '';
      if (before.length === 0) continue;

      const { text, replaced } = this.restoreText(before);
      if (replaced === 0) continue;

      // Written straight to nodeValue rather than by replacing the node: the
      // site owns this subtree, and swapping nodes out from under a renderer
      // mid-stream is how you get a reconciliation fight. Editing the value in
      // place is the smallest possible change.
      node.nodeValue = text;
      nodesChanged += 1;
      occurrences += replaced;
    }
    return { nodesChanged, occurrences };
  }

  /** Re-scan an entire subtree. For the settle pass once streaming stops. */
  applyToSubtree(root: Node): RestoreStats {
    const doc = root.ownerDocument ?? (root as Document);
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current !== null) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }
    return this.apply(nodes);
  }

  // ── internals ──────────────────────────────────────────────────────────

  /**
   * Longest surrogate first.
   *
   * Read fresh each call rather than cached: the vault gains entries as the
   * user sends more messages in the same session, and a list captured at
   * construction would silently stop restoring anything masked after it.
   */
  private surrogatesLongestFirst(): readonly string[] {
    return [...this.vault.replacements()].sort((a, b) => b.length - a.length);
  }

  private restoreText(input: string): { text: string; replaced: number } {
    let text = input;
    let replaced = 0;
    for (const surrogate of this.surrogatesLongestFirst()) {
      if (surrogate.length === 0 || !text.includes(surrogate)) continue;
      const entry = this.vault.getBySurrogate(surrogate);
      if (entry === undefined) continue;
      const parts = text.split(surrogate);
      replaced += parts.length - 1;
      text = parts.join(entry.original);
    }
    return { text, replaced };
  }

  private mayRestoreIn(node: Text): boolean {
    if (!node.isConnected) return false;
    // Typed as Element, not HTMLElement: `isEditableSurface` is a type guard
    // for HTMLElement, so a narrower loop variable is narrowed to `never`
    // after the check and the walk cannot continue.
    for (let el: Element | null = node.parentElement; el !== null; el = el.parentElement) {
      if (el.tagName === this.hostTag) return false;
      // The adapters' own editability predicate, not a local
      // `isContentEditable` test. That property is not implemented in jsdom,
      // so a local test returns undefined there and the guard silently stops
      // guarding - which a test caught by restoring into a contenteditable it
      // was supposed to refuse. `isEditableSurface` already resolves inherited
      // editability the way the HTML spec says it inherits.
      if (isEditableSurface(el)) return false;
    }
    return true;
  }
}
