[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / ExposureReport

# Interface: ExposureReport

Defined in: [packages/core/src/exposure/index.ts:72](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L72)

## Properties

### byCategory

> `readonly` **byCategory**: readonly [`CategoryBreakdown`](CategoryBreakdown.md)[]

Defined in: [packages/core/src/exposure/index.ts:77](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L77)

***

### contributions

> `readonly` **contributions**: readonly [`ExposureContribution`](ExposureContribution.md)[]

Defined in: [packages/core/src/exposure/index.ts:81](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L81)

Every contribution, so the total demonstrably decomposes.

***

### limitation

> `readonly` **limitation**: `string`

Defined in: [packages/core/src/exposure/index.ts:83](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L83)

Stated wherever the score is shown, per SPEC.

***

### rawPoints

> `readonly` **rawPoints**: `number`

Defined in: [packages/core/src/exposure/index.ts:76](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L76)

The un-saturated sum, so the transform can be checked by a reader.

***

### score

> `readonly` **score**: `number`

Defined in: [packages/core/src/exposure/index.ts:74](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L74)

Overall exposure, 0–100.

***

### topContributors

> `readonly` **topContributors**: readonly [`ExposureContribution`](ExposureContribution.md)[]

Defined in: [packages/core/src/exposure/index.ts:79](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L79)

Highest-contributing entities first.
