# Probes what a REAL browser does with editing events on a ProseMirror-shaped
# contenteditable, because the input witness depends on the answer and jsdom
# cannot give it.
#
# The witness records `composedPath()[0]` for beforeinput/input. If a real
# browser targets those events at the inner <p> rather than at the editing
# host, the witness would record the <p> while getComposer() resolves the host
# - and every send would be blocked with 'no-input-witness'. The unit tests
# cannot catch that: they dispatch synthetic events directly at the composer
# node, which assumes the answer.
#
# Also establishes which composer-filling paths raise editing events at all,
# which is what decides whether a restored draft or a suggestion chip can ever
# be bound.
#
# Run: python packages/extension/scripts/probe-input-events.py
import json
from playwright.sync_api import sync_playwright

PAGE = """<!doctype html>
<html><body>
  <div id="host" class="ProseMirror" contenteditable="true" role="textbox"><p id="para">seed</p></div>
  <div id="prefilled" contenteditable="true" role="textbox"><p>restored draft text</p></div>
  <textarea id="ta">textarea seed</textarea>
  <script>
    window.__EVENTS__ = [];
    const describe = (n) => {
      if (!n) return 'null';
      if (n === window) return 'Window';
      if (n.nodeType === 3) return 'TEXT(' + JSON.stringify((n.nodeValue || '').slice(0, 10)) + ')';
      return n.id ? n.tagName + '#' + n.id : n.tagName;
    };
    for (const type of ['beforeinput', 'input']) {
      document.addEventListener(type, (e) => {
        window.__EVENTS__.push({
          type: type,
          inputType: e.inputType || null,
          target: describe(e.target),
          path0: describe(e.composedPath()[0]),
          path0IsHost: e.composedPath()[0] === document.getElementById('host'),
          path0IsTextarea: e.composedPath()[0] === document.getElementById('ta')
        });
      }, true);
    }
  </script>
</body></html>"""

results = {}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page()
    page.set_content(PAGE)

    # 1. Real typing into the contenteditable. THE question.
    page.click('#host')
    page.keyboard.type('abc')
    results['typing_contenteditable'] = page.evaluate('() => window.__EVENTS__.splice(0).slice(0, 4)')

    # 2. Real typing into a textarea, for comparison.
    page.evaluate('() => { window.__EVENTS__ = []; }')
    page.click('#ta')
    page.keyboard.type('xy')
    results['typing_textarea'] = page.evaluate('() => window.__EVENTS__.splice(0).slice(0, 3)')

    # 3. Real paste through the browser's own clipboard, driven by the
    #    keyboard. The async clipboard API needs a secure origin and a
    #    permission grant; copy-then-paste needs neither and exercises the
    #    same editing pipeline.
    page.click('#host')
    page.keyboard.press('Control+A')
    page.keyboard.press('Control+C')
    page.evaluate('() => { window.__EVENTS__ = []; }')
    page.keyboard.press('Control+V')
    page.wait_for_timeout(250)
    results['paste'] = page.evaluate('() => window.__EVENTS__.splice(0).slice(0, 3)')

    # 4. execCommand('insertText') - the path setComposerText uses.
    page.evaluate('() => { window.__EVENTS__ = []; }')
    results['execCommand'] = page.evaluate("""() => {
        const host = document.getElementById('host');
        host.focus();
        const r = document.createRange();
        r.selectNodeContents(host);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
        const returned = document.execCommand('insertText', false, 'MASKED');
        return { returned: returned, textAfter: host.textContent, events: window.__EVENTS__.slice(0, 3) };
    }""")

    # 5. Programmatic fill - the restored-draft / suggestion-chip case.
    page.evaluate('() => { window.__EVENTS__ = []; }')
    results['programmatic_fill'] = page.evaluate("""() => {
        const el = document.getElementById('prefilled');
        el.innerHTML = '<p>filled by the site</p>';
        return { events: window.__EVENTS__.slice(0, 3), textAfter: el.textContent };
    }""")

    # 6. Focus/click only, no typing - clicking send on a restored draft.
    page.evaluate('() => { window.__EVENTS__ = []; }')
    page.click('#prefilled')
    results['focus_only'] = page.evaluate('() => window.__EVENTS__.slice(0, 3)')

    browser.close()

print(json.dumps(results, indent=2))
