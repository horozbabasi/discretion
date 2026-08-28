// Captures a site-adapter fixture from a live page, SCRUBBED BEFORE IT IS
// WRITTEN.
//
// ─────────────────────────────────────────────────────────────────────────
// WHY THE SCRUB HAPPENS AT CAPTURE TIME AND NOT AFTERWARDS
//
// A fixture is a snapshot of a third-party page taken while someone is signed
// in to their own account. The raw DOM therefore contains that person's
// conversation text, their name, their email, and whatever they had been
// discussing. This repository is public.
//
// Scrubbing as a later step would mean the unscrubbed DOM exists on disk, in a
// shell buffer, or in an editor's undo history first — and "we cleaned it
// before committing" is the sentence that precedes most accidental
// disclosures. So the raw HTML is never serialised. Scrubbing runs INSIDE the
// page, and the only string that crosses back to Node is the scrubbed one.
//
// This is ARCHITECTURE.md D20's reasoning applied to test data: a licence is
// not a data-protection instrument, and neither is a .gitignore entry.
//
// THE SCRUB IS AN ALLOWLIST, NOT A DENYLIST. Attributes are dropped unless
// named, and every text node is replaced unconditionally. A denylist would
// need to anticipate every attribute a site might put content into; an
// allowlist only needs to know what the adapter reads.
// ─────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node packages/extension/scripts/capture-fixture.mjs <url> <output-name>
//
// A real browser window opens. Sign in, get the page into the state you want
// captured, then press Enter in the terminal.

import { chromium } from 'playwright';
import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [url, name] = process.argv.slice(2);
if (!url || !name) {
  console.error('usage: capture-fixture.mjs <url> <output-name>');
  process.exit(1);
}

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

/**
 * Runs in the page. Returns scrubbed HTML and nothing else.
 *
 * Kept as a single self-contained function because it is serialised into the
 * browser context; it cannot close over anything from this module.
 */
const SCRUB = () => {
  // Attributes the adapter's strategies actually read, plus the ones that
  // determine whether an element is editable/visible. Everything else is
  // dropped, including every event handler and every URL.
  const KEEP = new Set([
    'role', 'aria-label', 'aria-hidden', 'aria-live', 'aria-expanded',
    'contenteditable', 'type', 'disabled', 'readonly', 'tabindex',
    'data-testid', 'data-is-streaming', 'data-test-render-count',
    'class', 'id', 'name', 'placeholder', 'hidden', 'inert',
  ]);

  // Values that may themselves be user content. A site can localise or
  // interpolate into any of these, e.g. aria-label="Edit message: <text>".
  const VALUE_MAY_CONTAIN_CONTENT = new Set(['aria-label', 'placeholder', 'id', 'name']);

  const looksLikeContent = (value) =>
    value.length > 60 || /[@]/.test(value) || /\d{4,}/.test(value);

  const scrubValue = (attribute, value) => {
    if (!VALUE_MAY_CONTAIN_CONTENT.has(attribute)) return value;
    return looksLikeContent(value) ? `scrubbed-${attribute}` : value;
  };

  // Filler preserves LENGTH CLASS but no content: the adapter's behaviour can
  // depend on whether a node has text, never on which text.
  const filler = (original) => (original.trim().length === 0 ? original : 'lorem ipsum');

  const clone = document.documentElement.cloneNode(true);

  // Scripts and styles are dropped whole. A stylesheet can carry content via
  // generated `content:` strings, and a script certainly can.
  for (const node of clone.querySelectorAll('script, style, link, noscript, svg, img, video, audio, canvas, iframe')) {
    node.remove();
  }

  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      node.nodeValue = filler(node.nodeValue ?? '');
      return;
    }
    if (node.nodeType === Node.COMMENT_NODE) {
      node.nodeValue = '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    for (const attribute of [...node.attributes]) {
      const lower = attribute.name.toLowerCase();
      if (!KEEP.has(lower)) {
        node.removeAttribute(attribute.name);
        continue;
      }
      node.setAttribute(attribute.name, scrubValue(lower, attribute.value));
    }
    for (const child of [...node.childNodes]) walk(child);
  };
  walk(clone);

  return `<!doctype html>\n${clone.outerHTML}`;
};

/** Belt and braces: refuse to write anything that still smells like content. */
function assertScrubbed(html) {
  const suspicious = [
    [/[\w.+-]+@[\w-]+\.[\w.]{2,}/, 'an email address'],
    [/\b(?:\d[ -]?){13,19}\b/, 'a card-length digit run'],
    [/\b[A-Z]{2}\d{2}[A-Z0-9]{10,}\b/, 'an IBAN-shaped token'],
    [/\b(?:sk|pk|ghp|xox[baprs])[-_][A-Za-z0-9]{16,}\b/, 'an API-key-shaped token'],
  ];
  const hits = suspicious.filter(([pattern]) => pattern.test(html));
  if (hits.length > 0) {
    throw new Error(
      `Refusing to write fixture: output still matches ${hits.map(([, what]) => what).join(', ')}. ` +
        'The scrub allowlist needs tightening before this site can be captured.',
    );
  }
}

const browser = await chromium.launch({ channel: 'msedge', headless: false });
const page = await browser.newPage();
await page.goto(url);

console.log('\nSign in and arrange the page as you want it captured.');
console.log('Type some THROWAWAY text in the composer - never anything real.');
const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Press Enter to capture... ');
rl.close();

const html = await page.evaluate(SCRUB);
await browser.close();

assertScrubbed(html);

mkdirSync(join(OUT_DIR, name.split('/')[0] ?? ''), { recursive: true });
const file = join(OUT_DIR, `${name}.html`);
writeFileSync(file, html, 'utf8');
console.log(`\nwrote ${file} (${html.length} bytes, scrubbed in-page before serialisation)`);
console.log('READ IT BEFORE COMMITTING. The scrub is an allowlist, not a guarantee.');
