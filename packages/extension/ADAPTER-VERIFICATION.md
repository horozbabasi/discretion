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

That last fixture has already earned its keep: it caught a real ordering bug,
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

### 3. The design itself

The strongest verification is not a test. It is that a wrong selector cannot
cause a silent leak, because the submit-time identity binding
(`src/adapters/binding.ts`) compares the element detection ran on against the
element the user's own event resolves to. That check knows nothing about any
site's markup, so no redesign can break it. See the header of
`src/adapters/types.ts` for the four constructions and how they interlock.

This is what makes it acceptable for the selectors to be uncertain. They are
the part of the system allowed to be wrong.

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

## The irreducible manual step

Points 1–5 do not have an offline answer, so they get an honest manual one.
Before any release, and after any adapter change, on each supported site:

1. Load the unpacked build and open the site.
2. Confirm the badge shows healthy.
3. Type a known synthetic value — a test card number, never anything real —
   and confirm it is detected and masked.
4. Send it. Confirm what arrives in the conversation is the masked text.
5. Confirm the response restores correctly as it streams.
6. Break it deliberately: in devtools, add a second `contenteditable`
   `role="textbox"` element to the page. Confirm the extension goes to a
   degraded state and **blocks the send** rather than picking one.

Step 6 is the important one and the one that will be skipped under time
pressure. It is the only step that tests the actual guarantee.

This checklist is a stopgap, not a solution: it verifies the sites on the day
someone runs it. The README's LIMITATIONS section says so to users directly —
SPEC already requires the statement *"These sites change their interfaces;
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
