[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ResolutionResult

# Interface: ResolutionResult

Defined in: [packages/core/src/fuse/resolve.ts:119](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/resolve.ts#L119)

## Properties

### dropped

> `readonly` **dropped**: readonly `object`[]

Defined in: [packages/core/src/fuse/resolve.ts:123](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/resolve.ts#L123)

Candidates yielded to a winner, retained so the choice is explainable.

***

### emitted

> `readonly` **emitted**: readonly [`ScoredForResolution`](ScoredForResolution.md)[]

Defined in: [packages/core/src/fuse/resolve.ts:121](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/resolve.ts#L121)

Non-overlapping survivors, in document order.
