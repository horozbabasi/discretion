# Versioning policy

Applies to the published packages — `@privacyshield/core` and
`@privacyshield/data`. The extension is versioned separately and is not on npm.

## Where we are: 0.x, and what that means here

The packages are `0.y.z`. Under semver, 0.x grants the right to break anything
in a minor bump, and plenty of projects use it that way. This one does not.
The rules below are the ones actually followed, and they are stricter than 0.x
requires:

| change | version |
| --- | --- |
| Removing or renaming an export; narrowing a parameter type; widening a return type | **minor** (`0.1.0` → `0.2.0`) — the only kind of change that gets one |
| Adding an export; adding an optional option; adding a detector | patch |
| Detection *behaviour* changes — a detector's precision or recall moves | patch, and it goes in the CHANGELOG with the measured before-and-after |
| Bug fixes, documentation, internal refactoring | patch |

So in 0.x: **a minor bump is the breaking one**. When the API stops moving,
`1.0.0` is cut and the table shifts up one column — breaking becomes major,
additive becomes minor.

## What counts as the public API

Exactly what `packages/core/src/index.ts` exports, and nothing else.

- Deep imports (`@privacyshield/core/dist/src/…`) are not supported and can
  change in any release. The `exports` map blocks them.
- The `./ner-transformers` subpath is public and covered by this policy.
- `@privacyshield/data` is a **generated** package. Its contents change with
  every corpus and model refit. Treat its data as versioned but not stable in
  value: a confusables entry or a calibration curve can change in a patch. Its
  *type* surface follows the table above.

`packages/core/test/public-api.test.ts` pins the export list. It fails on any
addition or removal, so a version decision has to be made deliberately rather
than discovered after publication.

## Detection numbers are part of the contract

A change to what the engine detects is a real change even when no type
signature moves. A caller's false-positive rate is as much part of the
behaviour as a function's return type.

So: any release that alters detection re-runs the evaluation and records the
delta in the CHANGELOG with numbers, not adjectives. The API_KEY boundary fix
in the initial release is the worked example of the format — recall 99.6% →
100.0%, false positives unchanged at 35, every other type identical.

## Deprecation

An export scheduled for removal is marked `@deprecated` in a patch release,
with the replacement named in the tag, and removed no sooner than the next
minor. Nothing is removed without having been deprecated in a shipped release
first.

## What is not covered

- **Exact surrogate values.** They depend on the seed and on the surrogate
  pools, and the pools grow. Fix `seed` for reproducibility within one
  version; do not depend on a specific stand-in across versions.
- **Confidence scores.** Recalibration moves them. The calibrated/uncalibrated
  distinction and the [0, 1] range are stable; the numbers are not.
- **Explanation strings.** Structured fields on `EntityExplanation` are
  covered; prose rendered from them is not.
- **Anything reachable only through a deep import.**

## Release process

1. `npm test`, `npm run typecheck`, `npm run lint` — all clean.
2. If detection changed, re-run the eval and paste the delta into the
   CHANGELOG.
3. Update `CHANGELOG.md` and the version in both `package.json` files.
4. Tag `v<version>` and push. The tag triggers
   `.github/workflows/publish.yml`, which publishes with npm provenance.

Publishing happens from CI only. There is no manual `npm publish` path,
because provenance attestation requires the CI identity — a locally published
package would be indistinguishable from one built anywhere else.
