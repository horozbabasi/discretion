/**
 * Reading and writing composer text, shared by every adapter.
 *
 * Extracted from claude.ts when the second and third adapters arrived: all
 * three sites use either a plain textarea or a framework-owned contenteditable
 * (ProseMirror on Claude and ChatGPT, Quill on Gemini), and the failure modes
 * are properties of those two shapes rather than of any site.
 */

const BLOCK_TAGS = new Set([
  'P',
  'DIV',
  'LI',
  'BLOCKQUOTE',
  'PRE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
]);

/**
 * Reads a composer as plain text with block structure intact.
 *
 * `textContent` is wrong here, and dangerously so: rich editors render each
 * paragraph as its own block element, and textContent concatenates them with
 * no separator. "4111 1111 1111 1111" typed across two lines reads back as one
 * run of digits, so detection finds a card number the user never typed — and,
 * far worse, offsets computed against that string do not correspond to the
 * real document, so redaction targets the wrong characters.
 */
export function readEditableText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }

  const parts: string[] = [];
  const walk = (node: Node, parent: HTMLElement | null): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      // Source indentation is not content. See isFormattingWhitespace: the
      // read and the write have to agree on this or a verified write can
      // never match its own readback.
      if (parent !== null && isFormattingWhitespace(node, parent)) return;
      parts.push(node.nodeValue ?? '');
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.tagName === 'BR') {
      parts.push('\n');
      return;
    }
    const isBlock = BLOCK_TAGS.has(node.tagName);
    if (isBlock && parts.length > 0 && !parts[parts.length - 1]?.endsWith('\n')) parts.push('\n');
    for (const child of Array.from(node.childNodes)) walk(child, node as HTMLElement);
    if (isBlock && !(parts[parts.length - 1] ?? '').endsWith('\n')) parts.push('\n');
  };
  walk(element, null);

  // One trailing newline is an artefact of the final block, not user content.
  return parts.join('').replace(/\n$/u, '');
}

/**
 * Sets a `value` property through the prototype's own setter.
 *
 * REQUIRED FOR REACT-CONTROLLED INPUTS, which is what ChatGPT's textarea build
 * is. React installs its own `value` property on the element instance and
 * tracks the last value it wrote; assigning `element.value = x` updates the DOM
 * but leaves React's tracker unchanged, so React treats the next render as
 * having nothing to do and restores its own value. The composer then still
 * holds the user's ORIGINAL text.
 *
 * Calling the PROTOTYPE setter bypasses React's instance property, so the
 * tracker sees a value it did not write and the subsequent `input` event is
 * accepted as a genuine user edit.
 *
 * writeAndVerify's read-back is the backstop, not the mechanism: without this,
 * the read-back would fail and every send on the textarea build would be
 * blocked — safe, but the extension would be useless on that build.
 */
function setValueThroughPrototype(element: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter === undefined) {
    element.value = value;
    return;
  }
  setter.call(element, value);
}

/**
 * Replaces a composer's contents.
 *
 * For contenteditable, uses execCommand('insertText') rather than assigning
 * textContent. ProseMirror and Quill own their DOM: they maintain an internal
 * document model and reconcile the DOM against it, so a direct assignment is
 * either reverted on the next transaction or leaves the model disagreeing with
 * what is on screen — and THE MODEL IS WHAT GETS SUBMITTED. execCommand goes
 * through the browser's own editing pipeline and raises the beforeinput/input
 * events the editor listens for, so the model updates with it.
 *
 * It is deprecated and it is still the only mechanism that works across
 * contenteditable editors. writeAndVerify is what makes relying on it safe: if
 * it silently does nothing, the read-back check fails and the send blocks.
 */
export function writeEditableText(element: HTMLElement, text: string): void {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    setValueThroughPrototype(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  stripFormattingWhitespace(element);

  element.focus();
  const doc = element.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  if (selection === null || selection === undefined) {
    throw new Error('NoSelection');
  }
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  // Deleting first, as its own command, rather than relying on insertText to
  // replace the selection. Both work on every shape measured; the explicit
  // delete makes the intent - REPLACE, not insert - readable at the call site
  // rather than resting on execCommand's replace-the-selection behaviour.
  doc.execCommand('delete', false);
  if (!doc.execCommand('insertText', false, text)) {
    throw new Error('InsertTextRejected');
  }
}

/**
 * Remove HTML source indentation from inside an editable.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NEEDED, and why no execCommand replaces it.
 *
 * A pretty-printed editable holds whitespace-only TEXT NODES between its block
 * children - the newline and spaces from the HTML source. They render as
 * nothing, but they are real nodes, and `readEditableText` reads them.
 *
 * MEASURED, in a real browser, across the DOM shapes all three adapters
 * resolve (`scripts/probe-write-strategies.py`): NONE of
 * selectNodeContents+insertText, +delete, selectAll+insertText, +delete, or
 * selectAllChildren+delete removes them. Every one leaves 72 characters where
 * 46 were written. Chrome treats collapsed whitespace as having no editable
 * position, so a selection over the element's contents does not cover it and
 * the insert cannot delete it. This is not a case of picking the right
 * command; there is no command.
 *
 * That is what made the send gate refuse with `readback-mismatch` after
 * masking correctly (D42): the write DID happen, and 26 characters of
 * indentation survived beside it.
 *
 * SCOPE, kept as narrow as the problem. Only whitespace-only text nodes that
 * are DIRECT CHILDREN of an editable which also has ELEMENT children - that is
 * inter-block source formatting, and nothing else. An editable whose content is
 * text alone is left untouched, so a composer legitimately holding spaces is
 * not silently emptied.
 *
 * WHY MUTATING THE DOM HERE IS ACCEPTABLE when the whole point of using
 * execCommand is to go through the editor's own input pipeline: this removes
 * nodes that render as nothing and that a rich editor never creates - both
 * ProseMirror and Quill serialise without indentation, so on the real sites
 * there is nothing here to remove. The text change itself still goes through
 * execCommand, so the editor still sees the beforeinput/input it needs.
 * ─────────────────────────────────────────────────────────────────────────
 */
function stripFormattingWhitespace(element: HTMLElement): void {
  for (const node of Array.from(element.childNodes)) {
    if (isFormattingWhitespace(node, element)) node.parentNode?.removeChild(node);
  }
}

/**
 * Whether a node is HTML source indentation rather than content.
 *
 * ONE PREDICATE, USED BY BOTH THE READ AND THE WRITE, and that is the whole
 * point of it existing separately.
 *
 * The write learned to strip these first (see above) and the send gate still
 * refused - "wrote 83 characters but read back 83", the same length and not
 * the same string. The reason was the READ: `getComposerText` reported the
 * indentation AS CONTENT, so the masked text carried it, and writing that
 * back inserted literal spaces where structural whitespace had been. The two
 * sides disagreed about what the composer contained, and a verified write
 * cannot survive that disagreement - nor should it.
 *
 * A whitespace-only text node sitting among ELEMENT children is inter-block
 * source formatting: it renders as nothing and the user did not type it.
 * Whitespace inside a block, and an editable whose content is text alone, are
 * untouched - so a composer legitimately holding spaces still reads as
 * holding them.
 */
function isFormattingWhitespace(node: Node, parent: HTMLElement): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return false;
  if ((node.nodeValue ?? '').trim() !== '') return false;
  return Array.from(parent.childNodes).some((sibling) => sibling.nodeType === Node.ELEMENT_NODE);
}
