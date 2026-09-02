[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / ResolutionResult

# Interface: ResolutionResult

Defined in: [packages/core/src/fuse/resolve.ts:119](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/resolve.ts#L119)

## Properties

### dropped

> `readonly` **dropped**: readonly `object`[]

Defined in: [packages/core/src/fuse/resolve.ts:123](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/resolve.ts#L123)

Candidates yielded to a winner, retained so the choice is explainable.

***

### emitted

> `readonly` **emitted**: readonly [`ScoredForResolution`](ScoredForResolution.md)[]

Defined in: [packages/core/src/fuse/resolve.ts:121](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/resolve.ts#L121)

Non-overlapping survivors, in document order.
