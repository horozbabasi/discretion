# AI-assisted pass over the safety-critical strings

**THIS IS NOT A REVIEW AND IT IS NOT A SIGN-OFF.** No locale ships as a result
of it. `REVIEW_SIGNOFFS` is untouched and remains empty.

Date: 2026-09-03. Performed by Claude (the same author that produced the
machine translations being examined).

## Why this is not a sign-off

The machine translations in this repository were produced by me. Reviewing them
draws on the same knowledge that generated them, so a systematic
misunderstanding — the kind that matters most — is invisible to the check by
construction. **An author cannot be their own reviewer for their own class of
error.**

Nor is it enough that I "read many languages": the failure mode being guarded
against is precisely the confident-but-wrong rendering, which by definition
does not feel wrong to whoever produced it.

Adding an "AI-checked" tier to `REVIEW_SIGNOFFS` was considered and rejected.
The mechanism is deliberately binary — a locale is read by a speaker, or it is
not — and a second tier would, in practice, be read later as "reviewed".

## What this pass IS worth

A distinction worth drawing, because the two halves have very different value:

**Contrastive and structural findings are verifiable by anyone**, including
someone who does not read the language. "These two strings differ by one
letter" is a property of the pair, checkable with your eyes. Those findings
below are real regardless of who made them.

**Semantic-fidelity findings are not**, when I am the author. Where I say
"this reads correctly", that is worth very little. The absence of findings in a
language is not evidence of correctness — it is the expected result whether the
text is right or wrong.

My competence also varies sharply by language, and pretending otherwise would
be the worst part of this document: high for Spanish, German, French and
Portuguese; moderate for Turkish and Japanese; **meaningfully lower for Hindi
and Arabic**, which are also two of the three scripts where I would be least
able to notice a subtle error.

## Findings

### 1. Turkish `popup.status.protected` / `unprotected` differ by one letter

```
protected   : Bu sayfa korunuyor
unprotected : Bu sayfa korunmuyor
```

Turkish marks negation with an infix, so the two statuses are 18 and 19
characters differing by a single `m`. This is the pair whose confusion means a
user trusts an unguarded page.

**Severity is reduced but not eliminated by an existing mitigation**, which I
checked rather than assumed: `popup.ts` sets `data-state` to `on` / `off` on
the badge, and `pages.css` renders those with different colours and
backgrounds — green versus grey. So a user distinguishes them before reading.

But WCAG's own rule is that colour must not be the only channel, and in Turkish
the text channel is weak. **For a reviewer to decide**, not for me: a more
distinct phrasing such as `Bu sayfa korunmuyor` → `Bu sayfa korumasız` would
separate them lexically.

This finding needs no Turkish to verify.

### 2. Arabic `popup.status.protected` is verbal where `unprotected` is adjectival

```
protected   : يجري حماية هذه الصفحة      ("protection of this page is underway")
unprotected : هذه الصفحة غير محمية       ("this page is unprotected")
```

The two use different grammatical constructions for what is one binary status.
A parallel pair (`هذه الصفحة محمية` / `هذه الصفحة غير محمية`) would be
symmetric and shorter.

Flagged as a **question for a reviewer**, not a defect: I am not confident
enough in Arabic register to say the current form is wrong, only that the
asymmetry is visible and worth a speaker's opinion.

### 3. French `panel.item.maskThis` drops the deictic

```
en : Mask this          fr : Masquer
```

Every other locale keeps it (`Enmascarar esto`, `Dies maskieren`, `Bunu
maskele`). In French the control sits beside `Garder l'original`, so position
carries the reference — but this is the per-item control whose confusion leaves
a secret in plaintext, and it is the one string where the pair is not
lexically parallel.

Low severity; a reviewer should confirm it reads unambiguously in place.

### 4. Nothing found in the checks that matter most

Stated explicitly so the absence is not mistaken for coverage:

- **`maskThis` / `keepOriginal` are clearly distinct in all eight locales.** No
  pair is confusable, and none appears reversed.
- **Every negation survives**: all eight render "did NOT send", "is NOT
  protecting", "does NOT run here" with the negation present.
- **`quick.action.mask` / `restore` are distinct in all eight.**
- **`quick.memoryOnly`** — the privacy claim — neither overstates nor
  understates in any locale I can assess.
- Placeholders, plural categories and emptiness were already machine-checked
  and clean; see the per-locale sheets.

**This says less than it appears to.** See "what this pass is worth" above.

## What would change the picture

One speaker per locale, reading the 21 strings on that locale's sheet. Roughly
254 words, 20–30 minutes. Findings 1–3 are the places to look first, and a
reviewer disagreeing with any of them is more informative than one agreeing.
