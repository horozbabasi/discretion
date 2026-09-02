[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / maskOriginal

# Function: maskOriginal()

> **maskOriginal**(`original`, `candidates`, `vault`, `options?`): [`MaskResult`](../interfaces/MaskResult.md)

Defined in: [packages/core/src/mask/masker.ts:104](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/masker.ts#L104)

Mask the given ORIGINAL text using the candidates found in it.
The candidates' `originalStart`/`originalEnd` must index into `original`.

Takes `PipelineCandidate` rather than `Stage1Candidate` because Stage 2's
PERSON/ORG/LOCATION entities must be masked too, and nothing in this file
reads the `stage` discriminant — the two candidate shapes are otherwise
identical. Typing it to Stage 1 alone was the narrower claim, not the safer
one: it silently excluded the entities SPEC most wants surrogates for.

## Parameters

### original

`string`

### candidates

readonly [`PipelineCandidate`](../type-aliases/PipelineCandidate.md)[]

### vault

[`Vault`](../classes/Vault.md)

### options?

[`MaskOptions`](../interfaces/MaskOptions.md) = `{}`

## Returns

[`MaskResult`](../interfaces/MaskResult.md)
