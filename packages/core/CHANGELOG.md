# Changelog

All notable changes to `@discretion/core`.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [VERSIONING.md](https://github.com/horozbabasi/discretion/blob/main/VERSIONING.md),
which is stricter than 0.x requires: **in 0.x, a minor bump is the breaking
one.**

## [Unreleased]

Nothing yet.

## [0.1.0] — first published release

The engine has existed and been evaluated since well before this version; what
0.1.0 marks is the point at which it became usable as a standalone package
rather than as the extension's internals.

### Added

- **`protect(text, options)`** — the supported entry point. Runs Stages 0–4 in
  the one order that is correct and returns the masked text, the findings,
  an exposure score, and the vault needed to reverse it.

  It exists because composing the pipeline by hand meant eight calls in a
  specific order, an identity map held between two of them, and the fitted
  calibration model imported from a second package through an unchecked cast.
  Two of those orderings were bugs fixed in earlier milestones — resolving
  overlaps *before* scoring exposure, and taking surrogates from the masker
  rather than from `chooseSurrogate`, so that what is displayed is what is
  substituted.

- **`ALL_ENTITY_TYPES`, `NER_ENTITY_TYPES`, `detectableEntityTypes()`** — a
  runtime enumeration of the entity types, which a TypeScript union does not
  have. `detectableEntityTypes()` is derived from the detector registry rather
  than declared, so it cannot go stale: a type appears the moment something can
  produce it.

- **`toCalibrationModel()`** — converts a fitted model to core's typed shape and
  **reports** keys that are not entity types, replacing an
  `as unknown as CalibrationModel` cast that would have hidden a stale key
  while calibration silently fell back to the pooled curve.

- `exposureBand()`, `PersonPool`, `SeverityCategory` and
  `GeneratedCalibrationModel` are now exported. The last three were named in
  public signatures without being exported, so a consumer could receive one and
  had no way to name its type.

- Runnable examples under `examples/`, executed against the packed tarball by
  `scripts/verify-standalone-consumer.sh`, so the documentation cannot drift
  from the package.

### Changed

- **`@huggingface/transformers` is now an optional peer dependency** rather
  than a dependency. It is needed only for Stage 2, which is reached through
  the separate `./ner-transformers` entry point, and it pulls in
  `onnxruntime-node`. Installing the package in an empty project now produces
  **20 MB of `node_modules`** instead of a little over 220 MB.

  If you use Stage 2, add `@huggingface/transformers` to your own
  dependencies.

- `@discretion/data` is pinned to an exact version instead of `*`, so core
  and its data tables cannot drift apart across releases.

### Fixed

- **API_KEY matches no longer swallow a trailing full stop.** The body charset
  legitimately includes `.`, and the match ran on into sentence punctuation, so
  a key at the end of a sentence and the same key mid-sentence were two
  different values — which quietly broke the guarantee that a value seen twice
  gets the same stand-in, and left the masked text missing its punctuation.

  Measured, Stage 1 + Stage 2 over 2,611 documents and 6,645 ground-truth
  entities:

  | | before | after |
  | --- | --- | --- |
  | API_KEY recall | 99.6% | **100.0%** |
  | API_KEY F1 | 97.6% | **97.9%** |
  | API_KEY false negatives | 2 | **0** |
  | API_KEY false positives | 20 | 20 |
  | GENERIC_SECRET false positives | 2,075 | 2,077 |

  Two keys previously missed are now found. Two additional GENERIC_SECRET
  false positives appear alongside them, in the same two Dutch documents.
  GENERIC_SECRET's published precision, recall and F1 (2.0% / 56.8% / 3.8%)
  are unchanged at one decimal place, and no other entity type moved at all.

  **The mechanism behind those two extra false positives was not isolated.**
  The direction is consistent with the shorter API_KEY span leaving text that
  the generic high-entropy detector then matches, but that was not confirmed,
  and it is recorded as unexplained rather than given a tidy reason.

### Removed

- `DetectionResult` and `StageTiming`. Both were declared as shapes for "later
  milestones" and never implemented — no function returned one and nothing
  referenced them. A type in a published API is a promise that something
  produces it. Use `ProtectResult`, whose `stagesRun` is derived from what
  actually ran.

### Known limitations

Published rather than smoothed; the full table is in
[BENCHMARKS.md](https://github.com/horozbabasi/discretion/blob/main/BENCHMARKS.md).

- `GENERIC_SECRET` recall is 56.8% and its precision is 2.0% before Stage 4
  overlap resolution reassigns most of those matches to a specific type.
- `TAX_ID` precision is 46.0%; `DRIVERS_LICENSE`, `POSTAL_CODE`,
  `US_ROUTING_NUMBER` and `URL_WITH_CREDENTIALS` are all below 40% precision.
- Stage 2 recognises `PERSON`, `ORG` and `LOCATION` only, and needs a model
  this package does not ship.
- `DATE_OF_BIRTH` is in the `EntityType` union but nothing produces it; it is
  correctly absent from `detectableEntityTypes()`.
