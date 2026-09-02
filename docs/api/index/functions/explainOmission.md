[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / explainOmission

# Function: explainOmission()

> **explainOmission**(`scored`, `decision?`): `string`

Defined in: [packages/core/src/fuse/explain.ts:97](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/explain.ts#L97)

A one-line reason a candidate was NOT reported.

SPEC's explanation requirement covers emitted entities, but the review UI
has to answer "why did you miss this?" too, and a suppression with no
recorded reason is exactly the failure D18 was written about. Kept in the
same module so the two stay consistent.

## Parameters

### scored

[`ContextScoredCandidate`](../interfaces/ContextScoredCandidate.md)

### decision?

[`ProfileDecision`](../interfaces/ProfileDecision.md)

## Returns

`string`
