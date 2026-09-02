[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / StepChange

# Interface: StepChange

Defined in: [packages/core/src/offsetMap.ts:178](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L178)

One change made by a single transform, in coordinates of THAT TRANSFORM'S
INPUT. normalize() re-maps these to original-text coordinates before
exposing them as TransformationRecord.

## Properties

### after

> **after**: `string`

Defined in: [packages/core/src/offsetMap.ts:186](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L186)

What the transform emitted instead ('' for deletions).

***

### before

> **before**: `string`

Defined in: [packages/core/src/offsetMap.ts:184](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L184)

input.slice(start, end) — what was there.

***

### end

> **end**: `number`

Defined in: [packages/core/src/offsetMap.ts:182](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L182)

***

### kind

> **kind**: [`TransformKind`](../type-aliases/TransformKind.md)

Defined in: [packages/core/src/offsetMap.ts:179](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L179)

***

### start

> **start**: `number`

Defined in: [packages/core/src/offsetMap.ts:181](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L181)

Range in the transform's input text.
