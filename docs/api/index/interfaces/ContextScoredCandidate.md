[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ContextScoredCandidate

# Interface: ContextScoredCandidate

Defined in: [packages/core/src/context/types.ts:72](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L72)

A candidate after Stage 3, carrying its adjustment and its reasons.

## Properties

### candidate

> `readonly` **candidate**: [`PipelineCandidate`](../type-aliases/PipelineCandidate.md)

Defined in: [packages/core/src/context/types.ts:73](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L73)

***

### contextConfidence

> `readonly` **contextConfidence**: `number`

Defined in: [packages/core/src/context/types.ts:75](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L75)

Confidence after applying every contribution, clamped to [0, 1].

***

### contributions

> `readonly` **contributions**: readonly [`ContextContribution`](ContextContribution.md)[]

Defined in: [packages/core/src/context/types.ts:76](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L76)

***

### suppressed

> `readonly` **suppressed**: `boolean`

Defined in: [packages/core/src/context/types.ts:85](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L85)

Stage 3 concluded this candidate should not be emitted at all.

Suppression is reserved for evidence that the candidate is NOT sensitive
(a documentation example, a value inside a URI's authority, a lab
reference range) — never for mere weakness of evidence, which is what the
confidence score is for.

***

### suppressionReason?

> `readonly` `optional` **suppressionReason?**: `string`

Defined in: [packages/core/src/context/types.ts:87](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L87)

Rule id that suppressed it. Present exactly when `suppressed`.
