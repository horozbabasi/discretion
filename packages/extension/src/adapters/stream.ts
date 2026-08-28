/**
 * Turning MutationObserver records into the text nodes that changed.
 *
 * Shared by every adapter: the three sites differ in where the transcript
 * lives, not in how a streamed token arrives. A token appears either as a
 * characterData mutation on an existing text node or as an added node
 * containing one, and restoration has to see both.
 */

/** Collects text nodes from an added subtree. */
function collectTextNodes(node: Node, into: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    into.push(node as Text);
    return;
  }
  for (const child of Array.from(node.childNodes)) collectTextNodes(child, into);
}

export function collectChangedTextNodes(records: readonly MutationRecord[]): Text[] {
  const changed: Text[] = [];
  for (const record of records) {
    if (record.type === 'characterData' && record.target.nodeType === Node.TEXT_NODE) {
      changed.push(record.target as Text);
    }
    for (const added of Array.from(record.addedNodes)) collectTextNodes(added, changed);
  }
  return changed;
}
