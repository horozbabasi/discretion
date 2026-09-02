[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / resolveForMasking

# Function: resolveForMasking()

> **resolveForMasking**\<`C`\>(`candidates`): `C`[]

Defined in: [packages/core/src/mask/masker.ts:74](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/masker.ts#L74)

Pre-fusion overlap resolution: greedily keep non-overlapping candidates,
preferring higher confidence, then longer span, then a stable detector id
for determinism. A documented stopgap until Stage 4 fusion (M8) resolves
overlaps against calibrated scores.

## Type Parameters

### C

`C` *extends* [`PipelineCandidate`](../type-aliases/PipelineCandidate.md)

## Parameters

### candidates

readonly `C`[]

## Returns

`C`[]
