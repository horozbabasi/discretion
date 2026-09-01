"""Which way of replacing a contenteditable's contents actually replaces it?

D42 left the send gate refusing with `readback-mismatch`: the masked text was
written, but 26 characters of the composer's previous structure survived, so
the verified write correctly refused. The fix must be to the WRITE, never to
the comparison - a loosened readback is how a write that did not take starts
passing.

This answers the question empirically, in a real browser, against the DOM
shapes the three adapters actually resolve. It needs no extension and no
model: it is about what `execCommand` does to a selection.

Each strategy is scored on the only thing that matters: after writing, does
reading the element back give EXACTLY the string that was written?

Run:  python packages/extension/scripts/probe-write-strategies.py
"""

import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent

# The DOM shapes the three adapters actually resolve, taken from the
# committed fixtures rather than invented.
#
# INDENTATION IS PART OF THE SHAPE, and leaving it out is what made the first
# run of this probe report that every strategy already worked. The fixtures
# are pretty-printed HTML, so the whitespace between the editable's tag and
# its first child is a REAL TEXT NODE inside the contenteditable - and that
# node is what the shipped write leaves behind. A minified shape has no such
# node and cannot reproduce the defect.
INDENT_BEFORE = '\n            '
INDENT_AFTER = '\n          '

SHAPES = {
    'claude/prosemirror-indented':
        '<div class=\'ProseMirror\' contenteditable=\'true\' role=\'textbox\'>'
        + INDENT_BEFORE + '<p>lorem ipsum</p>' + INDENT_AFTER + '</div>',
    'claude/prosemirror-tight':
        '<div class=\'ProseMirror\' contenteditable=\'true\' role=\'textbox\'><p>lorem ipsum</p></div>',
    'chatgpt/prosemirror-indented':
        '<div id=\'prompt-textarea\' contenteditable=\'true\' class=\'ProseMirror\'>'
        + INDENT_BEFORE + '<p>hello there</p>' + INDENT_AFTER + '</div>',
    'gemini/quill-multi-indented':
        '<div class=\'ql-editor\' contenteditable=\'true\' role=\'textbox\'>'
        + INDENT_BEFORE + '<p>first line</p>' + INDENT_BEFORE + '<p>second line</p>'
        + INDENT_AFTER + '</div>',
    'chatgpt/textarea': '<textarea id=\'prompt-textarea\'>hello there</textarea>',
    'plain-text-node': '<div contenteditable=\'true\'>bare text</div>',
    'nested-decorated':
        '<div contenteditable=\'true\'><p>a</p>'
        + '<div contenteditable=\'false\'>WIDGET</div><p>b</p></div>',
}

# `readEditableText` from src/adapters/text.ts, transcribed so the probe scores
# what production would read rather than what innerText happens to give. Kept
# beside the original deliberately: if they drift, this probe is measuring
# something the extension does not do.
READ_JS = """
(el) => {
  // The textarea branch, which the first version of this transcription
  // omitted: a textarea's childNodes hold its ORIGINAL text, not its current
  // value, so reading them scored a write that had actually landed as a
  // failure. The production reader has always had this branch.
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  const BLOCK = new Set(['P','DIV','LI','TR','SECTION','ARTICLE','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','PRE']);
  const parts = [];
  const walk = (node) => {
    if (node.nodeType === 3) { parts.push(node.nodeValue ?? ''); return; }
    if (node.nodeType !== 1) return;
    if (node.tagName === 'BR') { parts.push('\\n'); return; }
    const isBlock = BLOCK.has(node.tagName);
    if (isBlock && parts.length > 0 && !parts[parts.length - 1].endsWith('\\n')) parts.push('\\n');
    for (const child of Array.from(node.childNodes)) walk(child);
    if (isBlock && !(parts[parts.length - 1] ?? '').endsWith('\\n')) parts.push('\\n');
  };
  walk(el);
  return parts.join('').replace(/\\n$/u, '');
}
"""

# Candidates. Each receives (element, text) and must leave the element holding
# exactly `text`. All of them go through execCommand rather than assigning
# DOM properties, because the write has to raise the beforeinput/input events
# a rich editor listens for - a direct DOM assignment is invisible to
# ProseMirror and gets reconciled away.
STRATEGIES = {
    # What ships today.
    'selectNodeContents+insertText': """
      (el, text) => {
        el.focus();
        const sel = el.ownerDocument.defaultView.getSelection();
        const range = el.ownerDocument.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        return el.ownerDocument.execCommand('insertText', false, text);
      }
    """,
    # Delete the selection first, as its own command, then insert into the
    # emptied element.
    'selectNodeContents+delete+insertText': """
      (el, text) => {
        el.focus();
        const sel = el.ownerDocument.defaultView.getSelection();
        const range = el.ownerDocument.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        el.ownerDocument.execCommand('delete', false);
        return el.ownerDocument.execCommand('insertText', false, text);
      }
    """,
    # Let the browser decide what "everything" means.
    'selectAll+insertText': """
      (el, text) => {
        el.focus();
        el.ownerDocument.execCommand('selectAll', false);
        return el.ownerDocument.execCommand('insertText', false, text);
      }
    """,
    'selectAll+delete+insertText': """
      (el, text) => {
        el.focus();
        el.ownerDocument.execCommand('selectAll', false);
        el.ownerDocument.execCommand('delete', false);
        return el.ownerDocument.execCommand('insertText', false, text);
      }
    """,
    # selectAll can escape the editable and select the whole document; scoping
    # the selection to the element first and then deleting avoids that.
    'selectAllChildren+delete+insertText': """
      (el, text) => {
        el.focus();
        const sel = el.ownerDocument.defaultView.getSelection();
        sel.removeAllRanges();
        sel.selectAllChildren(el);
        el.ownerDocument.execCommand('delete', false);
        return el.ownerDocument.execCommand('insertText', false, text);
      }
    """,
    # A textarea is written through the VALUE PROPERTY SETTER, not
    # execCommand - React tracks the property and reverts a plain
    # assignment. Modelled here so the textarea row scores the branch
    # production actually takes; the earlier version ran execCommand at a
    # textarea and scored a failure that no shipping code could produce.
    'valueSetter (textarea branch)': """
      (el, text) => {
        if (!('value' in el)) return false;
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc.set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    """,
    # THE CANDIDATE FIX. Strip the formatting whitespace FIRST, then write
    # through execCommand exactly as before, so the text change still
    # travels through the editor's own beforeinput/input pipeline.
    #
    # Scoped to whitespace-only text nodes that are DIRECT CHILDREN of an
    # editable which also has element children - that is HTML source
    # indentation between blocks, which renders as nothing. An editable
    # whose content is only text is left alone.
    'stripFormattingWS+SNC+delete+ins': """
      (el, text) => {
        const hasElementChild = Array.from(el.childNodes).some((n) => n.nodeType === 1);
        if (hasElementChild) {
          for (const node of Array.from(el.childNodes)) {
            if (node.nodeType === 3 && (node.nodeValue ?? '').trim() === '') node.remove();
          }
        }
        el.focus();
        const sel = el.ownerDocument.defaultView.getSelection();
        const range = el.ownerDocument.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        el.ownerDocument.execCommand('delete', false);
        return el.ownerDocument.execCommand('insertText', false, text);
      }
    """,
}

TYPED = 'please wire it to GB33BUKB20201555555555 today'
MASKED = 'please wire it to GB97BFDE26054573938622 today'

results = {}
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, channel='msedge')
    page = browser.new_page()
    try:
        for shape_name, html in SHAPES.items():
            results[shape_name] = {}
            for strategy_name, fn in STRATEGIES.items():
                page.set_content(f'<body>{html}</body>')
                el = page.locator('[contenteditable="true"], textarea').first
                # Type like a user, so the starting state is one a user could
                # actually produce rather than one assigned into place.
                # Appended, NOT typed into a cleared field: clearing first
                # would remove the whitespace text nodes under test.
                el.click()
                el.type(TYPED, delay=1)

                before = page.evaluate(
                    '([el, read]) => eval(read)(el)',
                    [el.element_handle(), READ_JS],
                )
                accepted = page.evaluate(
                    '([el, fn, text]) => eval(fn)(el, text)',
                    [el.element_handle(), fn, MASKED],
                )
                after = page.evaluate(
                    '([el, read]) => eval(read)(el)',
                    [el.element_handle(), READ_JS],
                )
                is_textarea = 'textarea' in shape_name
                is_value_branch = strategy_name.startswith('valueSetter')
                if is_textarea != is_value_branch:
                    # Not this element's branch; scoring it would report a
                    # failure no shipping code could produce.
                    results[shape_name][strategy_name] = {'n/a': True, 'exact': True}
                    continue
                results[shape_name][strategy_name] = {
                    'accepted': accepted,
                    'exact': after == MASKED,
                    'before_len': len(before),
                    'after_len': len(after),
                    'after': after if after != MASKED else '<exact>',
                }
    finally:
        browser.close()

print(json.dumps(results, indent=1))

print('\n--- strategies that are EXACT on every shape ---')
winners = [
    name
    for name in STRATEGIES
    if all(results[shape][name]['exact'] for shape in SHAPES)
]
print(winners if winners else 'NONE')
