# How site adapters are verified

Written before the second and third adapters exist, on purpose. Deciding what
"verified" means once there are three adapters and a deadline produces a
definition shaped to whatever was already done. This one was written while the
answer could still be inconvenient.

## The problem

SPEC calls selector resilience the highest-risk area in the project, and it is
right for a reason that is worth stating precisely. Three parties are involved:
the user, this extension, and a third party who changes their markup whenever
they like, without notice, without versioning, and with no obligation to
anyone. There is no contract to hold them to and no API to depend on.

That rules out the usual answer. You cannot test your way to confidence about
someone else's HTML, because any test you write encodes what their page looked
like when you wrote it.

## The two claims, kept separate

Almost every mistake in this area comes from sliding between two claims that
sound alike:

> **Claim A — the adapter logic is correct.** Given a page of shape X, the
> adapter resolves the right element, or refuses.

> **Claim B — claude.ai currently has shape X.**

Fixture tests establish **Claim A** and say nothing whatsoever about **Claim
B**. A green test suite means the code does the right thing on the shapes we
know about. It does not mean the site still has those shapes; a fixture is a
photograph, and the subject keeps moving.

Everything below follows from taking that separation seriously.

## What is verified offline, and how

### 1. Fixture tests — Claim A

`test/claude-adapter.test.ts`, against committed fixtures in
`test/fixtures/claude/`. SPEC: *"Adapter tests against committed HTML fixture
snapshots; never against live sites."*

The fixtures are chosen adversarially rather than representatively. A fixture of
a healthy page proves very little; the ones that earn their place are the
awkward ones:

| Fixture | Pins |
| --- | --- |
| `composer.html` | The happy path resolves at the strongest tier, with no health warnings. |
| `composer-decoy.html` | Two *valid* candidates produce a hard `ambiguous` failure — and, critically, the decoy comes FIRST in document order, so a "first match wins" resolver would pick exactly the wrong one. |
| `composer-hidden-clone.html` | An inert `aria-hidden` duplicate does **not** trip the ambiguity rule. Blocking a healthy page is its own failure mode. |

ChatGPT and Gemini have their own suites, with fixtures chosen for what makes
each site different: for ChatGPT, duplicate `id="prompt-textarea"` elements, an
open message-edit editor (a second *real* editor that must NOT block), the
legacy `textarea` build, and a streaming stop button; for Gemini, open and
closed shadow roots, an immersive Canvas editor beside the composer, an Arabic
RTL page with the send button first in its row, and a page where only the
English label matches.

That last Claude fixture has already earned its keep: it caught a real ordering bug,
in which the ambiguity count was taken before invariants were applied, so any
hidden clone would have blocked every send on a working page. The invariants
now run first — they decide what counts as a candidate; ambiguity then
adjudicates between candidates.

The fixtures are **synthetic and labelled as such** in a comment at the top of
each file. They are modelled on claude.ai's structure but are not captured from
it. A synthetic fixture supports Claim A exactly as well as a captured one,
since Claim A is about logic; and it carries none of the data-protection
problems set out below.

### 2. The load test — the manifest is real

`scripts/verify-loads.py` builds nothing and asserts nothing about selectors.
It loads the built extension into a real browser and checks that Chrome
accepts it: the service worker registers, and `chrome.runtime.getManifest()`
returns manifest v3, exactly three host permissions, exactly `["storage"]`, and
no remote origin anywhere.

This exists because "the build wrote some files" and "Chrome accepts this
extension" are different claims, and only the second one matters. The check
reads Chrome's *parsed* manifest rather than the source file, so it tests what
the browser concluded, not what we wrote.

### 3. The injection test — the mechanism is real

`scripts/verify-injection.py` loads the BUILT extension into a real browser,
intercepts `https://claude.ai/**` and serves a committed fixture in its place,
then instruments the running service worker to record what the content script
reported. It modifies nothing about the extension: attaching a listener to an
already-loaded service worker is observation, and the code under test is
byte-for-byte what a user would run.

It answers a question fixtures cannot: *does Chrome actually inject this content
script, and does anything observable come out?*

### 4. The design itself

The strongest verification is not a test. It is that a wrong selector cannot
cause a silent leak, because the submit-time identity binding
(`src/adapters/binding.ts`) compares the element detection ran on against the
element the user's own event resolves to. That check knows nothing about any
site's markup, so no redesign can break it. See the header of
`src/adapters/types.ts` for the four constructions and how they interlock.

This is what makes it acceptable for the selectors to be uncertain. They are
the part of the system allowed to be wrong.

## What healthCheck covers, per adapter — and what it cannot

`healthCheck()` is a LIVENESS check, not a correctness check. It answers "can
the adapter still find its elements", never "did it find the right ones". That
distinction is the whole reason `binding.ts` exists, and it is worth being
explicit about because a green health badge is easy to over-read.

**Covered by every adapter:**

| Detects | How it surfaces |
| --- | --- |
| Composer missing entirely | `not-found` failure, degraded state, sends blocked |
| Two valid composer candidates | `ambiguous` failure, sends blocked |
| Composer present but the wrong kind of element | `invariant` failure |
| Composer found only by a weak tier | **warning**, not failure — still works, but one redesign from breaking |
| Response root missing or ambiguous | `not-found` / `ambiguous` failure |

**Per-adapter specifics:**

- **Claude** — additionally fails when no send button matches, because Claude's
  send control is always present when the composer is.
- **ChatGPT** — deliberately does **not** require a *send* button. During a
  response stream the same slot holds a stop control, so demanding a send
  button would drop the extension into a degraded state every time the
  assistant replied. It requires a *submit control* (send **or** stop) instead.
  Pinned by `streaming-stop-button`.
- **Gemini** — additionally **warns** when the send control matched only via
  its English `aria-label`. Every locale-independent marker being gone means
  pointer sends would be undecidable on a non-English UI, while looking
  perfectly healthy to an English-speaking developer. Pinned by
  `composer-english-label-only`.

**What healthCheck cannot detect, on any site:**

1. **Whether the composer it found is the right one.** A confident wrong answer
   and a correct answer are indistinguishable to it. This is the gap that
   submit-time identity binding closes, and the reason health is not treated as
   a safety mechanism.
2. **Whether a write will stick.** Only attempting one tells you, and a health
   check that wrote into the composer would clobber the user's text. The
   read-back in `writeAndVerify` covers this at send time instead.
3. **Whether the site will actually submit what we wrote.** Unknowable without
   sending.
4. **Whether the send button it found is the send button.** It could be some
   other submit control in the same region.
5. **Localisation, except where explicitly checked.** A strategy that matched
   via an English attribute value passes health in English and fails elsewhere.
   Gemini warns about this specific case; the general problem is unsolved by
   health checking and is why the fixtures include non-English pages.
6. **Races.** Health is a snapshot. The composer can be replaced a millisecond
   later. Mitigated by re-resolving at submit rather than trusting the snapshot.

## Live verification cannot be automated — a finding, not a missing feature

An automated live-verification harness was built (`verify-live.py`) and has been
**retired**. The reason is durable and worth more than the script was:

**All three target sites run bot detection, and an automated browser cannot get
past it.** claude.ai sits behind a Cloudflare interstitial that loops
indefinitely for a driven browser; Gemini has Google's equivalent. This is not a
bug in the harness and not something a better harness fixes — the sites are
working as intended, and an extension-verification tool is indistinguishable to
them from the automation they are built to stop.

Nor should it be worked around. Defeating a site's bot detection to test an
extension that reads that site would be a poor thing for a privacy tool to ship,
and any technique that worked would be fragile in exactly the way the adapters
already are.

**So live verification is manual, permanently.** The procedure below is the
supported one. Automating around it will keep looking attractive and will keep
being wrong, which is why this section exists rather than a deleted file.

**What automation CAN still do**, and does: `scripts/verify-injection.py`
answers "does the content script inject and produce output" without touching a
real site, by intercepting the origin and serving a committed fixture in its
place. Chrome matches content scripts on the URL, so injection behaves
identically. That covers the mechanism; it cannot cover the site's shape.

## The manual live procedure

This is the only way to establish Claim B. It takes about two minutes per site.

**1. Build.**

```
npm.cmd run build --workspace @privacyshield/extension
```

The loadable extension is at **`packages/extension/build`** — *not* `dist/`,
which holds TypeScript declaration output and is not loadable.

**2. Load it unpacked.** In Edge or Chrome: `chrome://extensions` → enable
Developer mode → *Load unpacked* → select `packages/extension/build`.

**3. Open the site, signed in**, and get to a page with the composer visible.
Use a throwaway account if you have one.

**4. Open the console** (F12 → Console) and look for a line beginning
`PrivacyShield [<site>]`. It is emitted when the content script runs and again
on every change of state. Expand it.

**SAVE THE WHOLE BLOCK TO A FILE. Do not copy from the viewport.** In devtools:
right-click in the console → *Save as…*, or select all and save. Then read it
from the file.

Three readings were lost to this. The block is long — strategy tables, the
probe table, editable and control candidates, the region hop table, the
discriminator attempts — and the part pasted was the tail, which is the
*conclusion* rather than the evidence it rests on. **Twice that produced a
confident wrong diagnosis** that took another round-trip to undo: once the
region trace was assumed absent when it had been emitted and truncated, and
once a summary line was read without the table that contradicted it.

What must be in whatever you capture, at minimum:

- the verdict line and `resolver results this reading is based on`
- the per-strategy tables for composer and response root
- `environment forensics`, including the probe table and `mat-icon ligature names`
- the editable-candidate and control-candidate tables **with their attribute columns**
- the region hop table and the discriminator attempts
- every `READING:` line

Debug output is **on by default for an unpacked load** and off for a store
install — see `src/debug.ts`. Nothing it prints contains page text.

**5. Read the verdict.** The collapsed line says one of:

| Line | Means |
| --- | --- |
| `WORKING` | Composer resolved at the strongest tier. |
| `WORKING, but only at the 'structural'/'class' tier` | Resolving, but the strong markers are gone. **The site changed; the adapter is one redesign from failing.** |
| `DEGRADED — sends will be blocked` | Resolution failed. The expanded output names the failure kind and every strategy tried. |

Expanded, it reports which strategy resolved each element, a table of every
strategy with how many nodes it matched and how many were admitted (**the
ambiguity count**), which invariant rejected the rest, and `healthCheck`'s
`failures[]` in full.

**6. Type synthetic text into the composer** — never anything real, and do not
send it. This exercises the read path, and on Gemini it is what makes the send
control exist at all.

**7. Re-run the diagnostic in the state you actually care about** with
**Ctrl+Alt+Shift+P**. It emits a fresh block on demand and does not consume the
keystroke.

This exists because **the findings live in states that do not survive a
reload**: a composer with text already typed, a response mid-generation, the
moment after a paste. Every automatic emission is tied to page load or to a
change of verdict, so reaching those states otherwise means being lucky about
when the 15-second poll lands.

It cost four rounds on Gemini. Its send control does not exist while the
composer is empty, and an empty composer is what every page load produces — so
every reading was taken in the one state where the element was absent, and
produced a confident wrong diagnosis each time.

**States worth capturing separately**, because each has produced a distinct
finding:

| State | How to reach it | What it exposes |
| --- | --- | --- |
| empty composer | page load | elements that are absent by design (Gemini's send control) |
| composer with text | type, then Ctrl+Alt+Shift+P | the normal working state |
| mid-generation | send, then trigger while streaming | disabled-composer handling (ChatGPT) |
| just after a paste | paste, then trigger | the paste guard's path |

**7. Record the result** in the status table below, with the date and the tier.

## Current verification status

**All three adapters VERIFIED-WORKING live, 2026-08-29.** Dated per D35: a
Claim B result is evidence about the day it was taken, and "verified" decays.

| | Claim A (logic) | Claim B (live) | Verified in state | Date |
| --- | --- | --- | --- | --- |
| Claude | verified — 20 fixture tests | **WORKING** | composer idle | 2026-08-29 |
| ChatGPT | verified — 23 fixture tests | **WORKING** | composer **idle, not generating** | 2026-08-29 |
| Gemini | verified — 40 fixture tests | **WORKING** | composer **non-empty** | 2026-08-29 |

**The state each was verified in is part of the result, not a footnote.** Two
of the three report DEGRADED in states where an element is *correctly* absent:

- **ChatGPT** mid-generation — the composer is disabled, so `isEditableSurface`
  rejects it.
- **Gemini** with an **empty composer** — no send control is rendered at all.
  An empty composer is the default state of every page load, so Gemini reports
  DEGRADED to every user until they type.

Neither is an adapter defect. Both are the health model lacking the distinction
between *"I cannot find this element"* and *"this element is not applicable in
the current state"* — ARCHITECTURE.md D34v, an M9 blocker.

### Gemini — four wrong diagnoses, and what actually resolved it

Recorded because the sequence is worth more than the outcome. **The adapter was
correct throughout; no selector, `CONTROL_SELECTOR` or walk change was ever
needed.**

| # | Diagnosis | Why it was wrong |
| --- | --- | --- |
| 1 | stale marker selectors | markers were fine — the element was absent |
| 2 | wrong region; walk stopped at the tools menu | region was fine — the element was absent |
| 3 | icon is `arrow_upward`, not `send` | true, and irrelevant — no control existed to carry it |
| 4 | not exposed as a control by the site | landing-page state only; on a conversation page it is a normal control |

Diagnoses 1 and 2 were corrected by adding instrument visibility. **3 and 4
were not** — they were made with an instrument that could already see
everything it needed. What was missing was the **page state**: every reading had
been taken on an empty composer, the one state in which Gemini renders no send
control.

**The rule this produces: before diagnosing an absent element, establish that
the element should be present in the state you are looking at.** Four rounds
went to answering *"why can we not find it"* when *"is it there at all"* had
never been asked.

### Earlier Gemini readings — PRE-FIX, INVALID, kept deliberately

Two readings preceded the one above. Both are wrong, and both are kept because
**the record of what a bad instrument reported is what makes the fix legible.**

| Reading | Reported | Why invalid |
| --- | --- | --- |
| 1st (2026-08-28) | composer `not-found`, all 5 strategies 0, send-button 0 | Taken at `document_idle`, before the Angular app painted. The diagnostic emitted only on a change of `health.ok`, so this shell snapshot then stood forever. |
| 2nd (2026-08-28) | 0 shadow roots, 0 iframes, `mat-icon` likely-closed, every editable probe 0 except `textarea`=1, **`button`=0** | Same un-painted page. `button: 0` on a chat UI was the tell, and it was what exposed the defect. |
| 3rd (2026-08-29) | composer resolves; `READING: withheld — page had not painted` printed **alongside** 6 buttons, a rich-textarea, 34 custom elements | The paint gate used an invented 400-element floor as a proxy and contradicted its own probe data. The composer/strategy rows are valid; **the READING line and everything downstream of it are not**. |
| 4th (2026-08-29) | `READING: ...no strategy matched one. THE SELECTORS ARE STALE` on a page where the composer **had resolved** | The READING line was keyed on the editable PROBE, never on the resolver, so it fired generically on any health failure. Health had failed for the **send control**; the composer was fine. The probe and editable tables are valid; **the READING line is not**. |

**The 3rd and 4th readings disagreed with each other about the same unchanged
composer.** That disagreement is what exposed D34g — and it is the reason
readings are kept rather than deleted.

The second reading produced a confident, specific and completely wrong
conclusion — that Gemini had migrated to a native textarea. It is the clearest
evidence in this repository for why a reading must carry its conditions:
nothing in that output said "this page had not painted", so nothing stopped it
being believed.

Both defects are fixed. Readings now carry `readyState`, elapsed time, attempt
number and DOM element count; below 400 elements the block refuses to draw a
conclusion; re-checks run at 400 ms → 12 s; and the console re-emits on a change
of *verdict* rather than only of `health.ok`.

### ChatGPT — earlier readings, retained as D34i evidence

Two earlier painted readings showed the composer failing. Both are now
understood as the composer in a **disabled** state, not as selector rot:

| | Reading A | Reading B | Idle reading |
| --- | --- | --- | --- |
| composer | visible contenteditable, failing no invariants | no contenteditable; 4 surfaces, all file inputs + a **DISABLED** textarea | **RESOLVED** by `chatgpt/composer-id` |
| strategies | 0 | `composer-in-composer-form` matched 1, admitted 0 | **all four match** |
| health | failing | failing | **ok, no failures** |

`isEditableSurface` returns false for a disabled textarea, so the `editable`
invariant rejects it. That is why B showed *found-and-rejected* rather than
*not-found* — and **selector rot cannot produce `matched 1`**.

**Why the disabled state only ever appeared right after a page load:** the
re-checks run 400 ms → 12 s from load and then hand over to a 15-second poll. A
generation starting after that window is observed only if a poll happens to land
inside it. Generations last seconds. See ARCHITECTURE.md D34i-a — the health
model cannot currently observe the state the composer spends most of its time
in.

## The fixture boundary — what two live failures proved

Two of three adapters failed on first live contact **with every fixture test
passing**. That is worth stating precisely, because it is easy to read as a
testing failure and it is not one.

**Fixtures encode a working state.** Each was written against the markup as it
was understood at the time, and a fixture test asks: *given a page of this
shape, does the adapter resolve correctly?* It can prove a strategy parses what
it was written against. **It can never detect that the site has moved**, because
the fixture moves with the author's belief, not with the site.

So a green fixture suite means the logic is right about a shape. It carries no
information about whether that shape still exists. Every passing test can stay
green forever while all three adapters are dead.

**This is the fixtures' boundary, not a defect in them.** Writing more
fixtures, or better ones, does not move it — a captured fixture has exactly the
same property as a synthetic one here. The only instrument that crosses the
boundary is a person opening the real site.

Three consequences, each already acted on:

- The status table above tracks Claim A and Claim B in **separate columns**,
  because a green suite must never be reported as a working adapter.
- The diagnostic exists so that crossing the boundary costs about two minutes
  rather than a debugging session.
- Live checks are dated in the table, because "verified" decays. A Claim B
  result is evidence about the day it was taken and nothing more.

## What fixtures CANNOT catch — stated plainly

1. **That the site changed.** The whole of Claim B. A fixture captured today
   passes forever, including long after the page it depicts has ceased to
   exist. This is the big one, and no offline technique closes it.
2. **Whether an element is the one the user types into.** A fixture is inert.
   Only a person typing into a real page can establish that, which is why the
   input witness exists in the product rather than only in the tests.
3. **Framework write semantics.** Whether `execCommand('insertText')` actually
   updates ProseMirror's internal document — as opposed to only the DOM — is a
   property of the live editor. jsdom has no ProseMirror, so the tests
   *simulate* both the success and the silent-swallow cases and verify the
   read-back check catches the bad one. That verifies our handling of the
   failure, not that the failure does or does not occur on claude.ai.
4. **Layout and visibility.** jsdom performs no layout, so every
   `getBoundingClientRect` is 0×0. The test suite simulates plausible boxes
   rather than weakening the `rendered` invariant to suit the test environment —
   deleting a real check to make a fake one pass is worse than not testing it.
   The consequence is that the `rendered` invariant's *thresholds* are
   unverified offline.
5. **Timing.** SPA navigation, streaming, and composer re-creation are races.
   Fixtures are static and cannot exercise them.

## The pre-release checklist

"The manual live procedure" above establishes that the adapter resolves. This
is the fuller check, run before any release and after any adapter change, on
each supported site. Steps 3-5 require the detection pipeline, which lands with
the content-script batch; until then only 1, 2 and 6 are runnable.

1. Load the unpacked build (`packages/extension/build`) and open the site.
2. Read the console diagnostic. Confirm `WORKING`, at the `attribute` tier,
   with an ambiguity count of 1.
3. Type a known synthetic value - a test card number, never anything real -
   and confirm it is detected and masked.
4. Send it. Confirm what arrives in the conversation is the masked text.
5. Confirm the response restores correctly as it streams.
6. **Break it deliberately.** In devtools, add a second `contenteditable`
   `role="textbox"` element to the page. Confirm the diagnostic flips to
   `DEGRADED`, reports `ambiguous`, and the send is **blocked** rather than a
   candidate being picked.

Step 6 is the important one and the one that will be skipped under time
pressure. It is the only step that tests the actual guarantee, and it is now
cheap: the console says what happened.

This checklist is a stopgap, not a solution - it verifies the sites on the day
someone runs it. The README's LIMITATIONS section says so to users directly,
and SPEC already requires the statement *"These sites change their interfaces;
adapters will break until updated."*

## Capturing a real fixture, if one is ever needed

`scripts/capture-fixture.mjs` exists for the case where a synthetic fixture
cannot reproduce some structure that matters. It carries a data-protection
obligation that is easy to underrate:

**A capture is a snapshot of a third party's page taken while a real person is
signed in to their real account.** It contains their conversation text, their
name, their email, and whatever they had been discussing. This repository is
public.

So the tool scrubs **inside the page**, and only the scrubbed string is
returned to Node. The raw HTML is never serialised — not to a temp file, not to
a shell buffer, not to an editor's undo history. "We cleaned it before
committing" is the sentence that precedes most accidental disclosures, and it
depends on remembering. This does not.

The scrub is an **allowlist**: every text node is replaced unconditionally, and
attributes are dropped unless explicitly named. A denylist would have to
anticipate every attribute a site might interpolate content into; an allowlist
only has to know what the adapter reads. A final pattern check refuses to write
output still matching an email, a card-length digit run, an IBAN shape, or a
common API-key prefix.

Rules for anyone using it:

- Use a throwaway account, or a conversation containing nothing real.
- Type only synthetic values into the composer before capturing.
- **Read the file before committing it.** The scrub is an allowlist, not a
  guarantee, and the person capturing is the last line of defence.

This is ARCHITECTURE.md D20's reasoning applied to test data: a licence is not
a data-protection instrument, and neither is a `.gitignore` entry.
