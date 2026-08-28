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
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
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
    for (const child of Array.from(node.childNodes)) walk(child);
    if (isBlock && !(parts[parts.length - 1] ?? '').endsWith('\n')) parts.push('\n');
  };
  walk(element);

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

  if (!doc.execCommand('insertText', false, text)) {
    throw new Error('InsertTextRejected');
  }
}
