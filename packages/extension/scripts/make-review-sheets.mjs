/**
 * Generates one translation review sheet per locale, into
 * docs/translation-review/.
 *
 * WHAT A SHEET IS FOR. A reviewer is being asked to read 21 strings, not 116,
 * and to answer one question about each: could a reader who acted on this
 * wrongly end up sending something they meant to keep? So each row carries the
 * English source, the current machine translation, and the CONSEQUENCE of
 * getting it wrong - because "is this a good translation" is a harder and less
 * useful question than "does this say the opposite of what it should".
 *
 * The sheet also carries the digest of the strings as generated. That digest is
 * what a completed sign-off records, so the review cannot silently outlive the
 * words it covered.
 *
 * Run: node packages/extension/scripts/make-review-sheets.mjs
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..');
const REPO = join(EXT, '..', '..');
const OUT_DIR = join(REPO, 'docs', 'translation-review');
const TMP = join(EXT, 'build', '.review.tmp.mjs');

/**
 * Why each string is safety-critical, in terms a reviewer can check against.
 * Written as the FAILURE, not the intent: "if this reads as X" is answerable
 * by someone who has never seen the extension.
 */
const CONSEQUENCE = {
  'panel.action.cancel': 'If this reads as "send", the user sends unmasked text while trying to stop.',
  'panel.action.maskAndSend': 'The button that sends. If it reads as "cancel", the user sends when they meant to stop.',
  'panel.action.protectAndSend': 'Same as above; this is the wording used when items are being replaced.',
  'panel.item.keepOriginal': 'If this and "mask this" read as each other, the user LEAVES A SECRET IN PLAINTEXT believing they masked it.',
  'panel.item.maskThis': 'If this and "keep original" read as each other, the user leaves a secret in plaintext believing they masked it.',
  'panel.degraded.pageTitle': 'Says the extension is NOT protecting this page. If it reads as protected, the user trusts a page that is not guarded.',
  'panel.degraded.sendTitle': 'Says the message was NOT sent. If it reads as sent, the user believes something left that did not - or the reverse.',
  'panel.degraded.couldNotFind': 'Names what the extension could not locate. Must read as a failure, not as a result.',
  'panel.degraded.noReason': 'Says the extension failed without explaining why. Must not read as "nothing was found".',
  'panel.unwitnessed.title': 'Warns the message may not be what the user wrote. Must read as a warning.',
  'panel.unwitnessed.body': 'Explains that warning. Must not read as reassurance.',
  'panel.findings.note': 'Promises that these items WILL be replaced on send, and that the user will be asked first. A wrong tense or a negation changes what the user expects to happen.',
  'panel.paste.body': 'Says pasted items will be masked when sending, and can be masked now instead. Must not read as "already masked".',
  'panel.paste.none': 'Says nothing sensitive was found. If this reads as an error, the user distrusts a correct result; if an error reads as this, they trust a failure.',
  'popup.status.protected': 'Says this page IS protected. Must not be confusable with the next string.',
  'popup.status.unprotected': 'Says this page is NOT protected. If these two read alike, the status display is worse than none.',
  'popup.status.unsupported': 'Says the extension does not run here at all. Must not read as "protected".',
  'quick.action.mask': 'Turns text into masked text. If it swaps with "restore", the user reveals values they meant to hide.',
  'quick.action.restore': 'Turns masked text back into the real values. If it swaps with "mask", the user reveals values they meant to hide.',
  'quick.unavailable': 'Says masking did NOT happen and nothing was changed. If it reads as success, the user copies unmasked text believing it is safe.',
  'quick.memoryOnly': 'A privacy claim about where the text goes. Must not overstate or understate it.',
};

const LANGUAGE = {
  es: 'Spanish', de: 'German', fr: 'French', pt_BR: 'Portuguese (Brazil)',
  tr: 'Turkish', ja: 'Japanese', hi: 'Hindi', ar: 'Arabic',
};

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];

function render(value) {
  if (typeof value === 'string') return value;
  return PLURAL_CATEGORIES.filter((c) => value[c] !== undefined)
    .map((c) => `*${c}:* ${value[c]}`)
    .join('<br>');
}

/** Placeholders must survive translation; $1 dropped means a blank in the UI. */
function placeholders(value) {
  const text = typeof value === 'string' ? value : PLURAL_CATEGORIES.map((c) => value[c] ?? '').join(' ');
  return [...text.matchAll(/\$\d/g)].map((m) => m[0]).sort().join(',');
}

function escapePipes(text) {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

await build({
  root: EXT,
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: 'build',
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
    lib: { entry: join(EXT, 'src', 'i18n', 'locales', 'index.ts'), formats: ['es'], fileName: () => '.review.tmp.mjs' },
    rollupOptions: { external: [] },
  },
});
const { LOCALES, SAFETY_CRITICAL_KEYS, safetyCriticalDigest, REVIEW_SIGNOFFS } =
  await import(pathToFileURL(TMP).href);
rmSync(TMP, { force: true });

const english = LOCALES.find((l) => l.dir === 'en').catalogue;
mkdirSync(OUT_DIR, { recursive: true });

const written = [];
for (const locale of LOCALES) {
  if (locale.dir === 'en') continue;
  const name = LANGUAGE[locale.dir] ?? locale.dir;
  const digest = safetyCriticalDigest(locale.catalogue);
  const signoff = REVIEW_SIGNOFFS[locale.dir];

  // Machine-checkable problems, surfaced FOR the reviewer rather than instead
  // of them. A matching placeholder set says nothing about whether the words
  // are right.
  const flags = [];
  for (const key of SAFETY_CRITICAL_KEYS) {
    const src = placeholders(english[key]);
    const dst = placeholders(locale.catalogue[key]);
    if (src !== dst) flags.push(`\`${key}\`: placeholders differ (English \`${src || 'none'}\`, ${name} \`${dst || 'none'}\`)`);
    const text = typeof locale.catalogue[key] === 'string' ? locale.catalogue[key] : locale.catalogue[key].other;
    if (text.trim().length === 0) flags.push(`\`${key}\`: empty`);
    const englishText = typeof english[key] === 'string' ? english[key] : english[key].other;
    if (text === englishText && locale.dir !== 'en') flags.push(`\`${key}\`: identical to English - may be untranslated`);
  }

  const rows = SAFETY_CRITICAL_KEYS.map((key) => {
    const en = escapePipes(render(english[key]));
    const tr = escapePipes(render(locale.catalogue[key]));
    return `| \`${key}\` | ${en} | **${tr}** | ${escapePipes(CONSEQUENCE[key] ?? '')} | | |`;
  }).join('\n');

  const body = `# Translation review — ${name} (\`${locale.dir}\`)

**Status: ${signoff ? `signed off by ${signoff.reviewer} on ${signoff.date}` : 'NOT REVIEWED — this locale is not shipped'}**

Digest of the strings below: \`${digest}\`

---

## What you are being asked

These 21 strings are the ones where a mistranslation causes a **wrong safety
decision** rather than confusion. This extension masks sensitive data before it
is sent to an AI chat service; these strings are the buttons and notices the
user reads when deciding whether to send something.

You do not need to see the extension, and you do not need to judge style. For
each row, answer one question:

> **Could someone reading only the ${name} text act in a way they did not
> intend — send something they meant to keep, or believe a page is protected
> when it is not?**

Mark the **Verdict** column:

- **OK** — says what the English says, and could not be acted on wrongly.
- **REWORD** — understandable but risky, unnatural, or easy to misread. Put a
  better version in the last column.
- **WRONG** — says something materially different, or the opposite.

Style notes are welcome in the last column but are not what gates the release.
A stiff translation ships; a misleading one does not.

## The strings

| key | English | ${name} | If this is wrong | Verdict | Suggested replacement |
| --- | --- | --- | --- | --- | --- |
${rows}

${flags.length > 0 ? `## Automated flags\n\nThese are mechanical checks, not judgements — the words can still be wrong when every check passes:\n\n${flags.map((f) => `- ${f}`).join('\n')}\n` : '## Automated flags\n\nNone. Placeholders match English, nothing is empty, nothing is left in English.\nThat says nothing about whether the words are right.\n'}
## Recording the result

When every row is marked, add to \`packages/extension/src/i18n/reviewed.ts\`:

\`\`\`ts
'${locale.dir}': {
  reviewer: '<name>',
  relationship: '<native speaker / fluent, how long>',
  date: '<YYYY-MM-DD>',
  digest: '${digest}',
},
\`\`\`

The digest ties the sign-off to these exact words. If any of them is edited
afterwards the digest stops matching and the locale drops out of the build
again, which is intended: the record must not outlive what it describes.
`;

  const file = join(OUT_DIR, `${locale.dir}.md`);
  writeFileSync(file, body, 'utf8');
  written.push({ dir: locale.dir, name, digest, flags: flags.length });
}

const index = `# Translation review

Eight locales are machine-translated and **no speaker of any of them has read
them**. Until one does, they are not shipped: \`scripts/build.mjs\` drops any
locale without a valid sign-off and \`chrome.i18n\` falls back to English.

That is deliberate. An English panel is honest — it says nothing in a language
the reader may not have. A confidently mistranslated "Mask this" is not: it
says the wrong thing in a language they trust.

## Scope

Of 116 catalogue keys, **21** are reviewed here: the ones where a
mistranslation causes a wrong safety decision rather than confusion. That is
roughly **254 words per locale**, a 20–30 minute read — not a translation
contract. The other 95 keys are usability bugs at worst and are not gating.

## Status

| locale | language | reviewer | shipped | sheet |
| --- | --- | --- | --- | --- |
| \`en\` | English | — (source) | **yes** | — |
${written.map((w) => `| \`${w.dir}\` | ${w.name} | — | no | [${w.dir}.md](${w.dir}.md) |`).join('\n')}

## How a locale starts shipping

1. A person who reads the language fills in the sheet.
2. Their name, relationship to the language, date and the sheet's digest go
   into \`REVIEW_SIGNOFFS\` in \`packages/extension/src/i18n/reviewed.ts\`.
3. \`npm test\` and \`npm run ext:build\` — the locale now builds into
   \`_locales/\`.

**A sign-off is a claim that a human who reads the language checked these
strings.** It must not be added on the strength of a machine translation, a
model's assessment of its own output, or a round-trip back to English. That is
the process that produced these strings; re-running it is not review.

Regenerate these sheets with
\`node packages/extension/scripts/make-review-sheets.mjs\`.
`;
writeFileSync(join(OUT_DIR, 'README.md'), index, 'utf8');

console.log(`wrote ${String(written.length)} review sheets to docs/translation-review/`);
for (const w of written) {
  console.log(`  ${w.dir.padEnd(6)} digest ${w.digest}  ${String(w.flags)} automated flag(s)`);
}
