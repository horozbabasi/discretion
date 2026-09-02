[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ExposureContribution

# Interface: ExposureContribution

Defined in: [packages/core/src/exposure/index.ts:49](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L49)

## Properties

### category

> `readonly` **category**: [`SeverityCategory`](../type-aliases/SeverityCategory.md)

Defined in: [packages/core/src/exposure/index.ts:51](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L51)

***

### confidence

> `readonly` **confidence**: `number`

Defined in: [packages/core/src/exposure/index.ts:53](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L53)

The entity's calibrated confidence, as it entered the sum.

***

### detail

> `readonly` **detail**: `string`

Defined in: [packages/core/src/exposure/index.ts:61](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L61)

Short human-readable text for the report.

***

### factor

> `readonly` **factor**: `number`

Defined in: [packages/core/src/exposure/index.ts:57](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L57)

Per-type factor applied within the category.

***

### points

> `readonly` **points**: `number`

Defined in: [packages/core/src/exposure/index.ts:59](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L59)

confidence × weight × factor — this entity's share of the raw sum.

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/exposure/index.ts:50](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L50)

***

### weight

> `readonly` **weight**: `number`

Defined in: [packages/core/src/exposure/index.ts:55](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L55)

Category severity weight, 0–100.
