[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / DetectionOutcome

# Interface: DetectionOutcome

Defined in: [packages/core/src/pipeline.ts:41](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L41)

## Properties

### emitted

> `readonly` **emitted**: readonly [`ContextScoredCandidate`](ContextScoredCandidate.md)[]

Defined in: [packages/core/src/pipeline.ts:43](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L43)

Candidates Stage 3 kept, with their adjusted confidence and reasons.

***

### profile

> `readonly` **profile**: [`DocumentProfile`](DocumentProfile.md)

Defined in: [packages/core/src/pipeline.ts:53](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L53)

***

### suppressed

> `readonly` **suppressed**: readonly [`ContextScoredCandidate`](ContextScoredCandidate.md)[]

Defined in: [packages/core/src/pipeline.ts:52](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L52)

Candidates Stage 3 suppressed, retained for eval and explanation.

Kept rather than discarded because a suppression is a decision the
pipeline must be able to justify: the review UI explains why something
was NOT reported, and the eval measures whether a suppression rule is
removing errors or removing detections.
