[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / FusionInput

# Interface: FusionInput

Defined in: [packages/core/src/fuse/explain.ts:27](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/explain.ts#L27)

What Stage 4 knows about one candidate as it becomes an entity.

## Properties

### absorbedOverlap?

> `readonly` `optional` **absorbedOverlap?**: `boolean`

Defined in: [packages/core/src/fuse/explain.ts:32](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/explain.ts#L32)

Whether the entity's span was widened by overlap resolution.

***

### calibratedConfidence

> `readonly` **calibratedConfidence**: `number`

Defined in: [packages/core/src/fuse/explain.ts:30](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/explain.ts#L30)

Confidence after calibration; comparable across types.

***

### scored

> `readonly` **scored**: [`ContextScoredCandidate`](ContextScoredCandidate.md)

Defined in: [packages/core/src/fuse/explain.ts:28](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/explain.ts#L28)

***

### wonAgainst?

> `readonly` `optional` **wonAgainst?**: readonly [`EntityType`](../type-aliases/EntityType.md)[]

Defined in: [packages/core/src/fuse/explain.ts:34](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/explain.ts#L34)

Types this candidate won an overlap against.
