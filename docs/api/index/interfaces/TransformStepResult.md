[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / TransformStepResult

# Interface: TransformStepResult

Defined in: [packages/core/src/offsetMap.ts:190](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L190)

What every transform returns; null means "nothing to do" (identity).

## Properties

### changes

> **changes**: [`StepChange`](StepChange.md)[]

Defined in: [packages/core/src/offsetMap.ts:194](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L194)

***

### map

> **map**: `Int32Array`

Defined in: [packages/core/src/offsetMap.ts:193](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L193)

output index → input index, with sentinel (length text.length + 1).

***

### text

> **text**: `string`

Defined in: [packages/core/src/offsetMap.ts:191](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L191)
