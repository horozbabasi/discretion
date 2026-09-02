[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ExposureReport

# Interface: ExposureReport

Defined in: [packages/core/src/exposure/index.ts:72](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L72)

## Properties

### byCategory

> `readonly` **byCategory**: readonly [`CategoryBreakdown`](CategoryBreakdown.md)[]

Defined in: [packages/core/src/exposure/index.ts:77](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L77)

***

### contributions

> `readonly` **contributions**: readonly [`ExposureContribution`](ExposureContribution.md)[]

Defined in: [packages/core/src/exposure/index.ts:81](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L81)

Every contribution, so the total demonstrably decomposes.

***

### limitation

> `readonly` **limitation**: `string`

Defined in: [packages/core/src/exposure/index.ts:83](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L83)

Stated wherever the score is shown, per SPEC.

***

### rawPoints

> `readonly` **rawPoints**: `number`

Defined in: [packages/core/src/exposure/index.ts:76](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L76)

The un-saturated sum, so the transform can be checked by a reader.

***

### score

> `readonly` **score**: `number`

Defined in: [packages/core/src/exposure/index.ts:74](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L74)

Overall exposure, 0–100.

***

### topContributors

> `readonly` **topContributors**: readonly [`ExposureContribution`](ExposureContribution.md)[]

Defined in: [packages/core/src/exposure/index.ts:79](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L79)

Highest-contributing entities first.
