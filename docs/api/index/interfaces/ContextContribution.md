[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ContextContribution

# Interface: ContextContribution

Defined in: [packages/core/src/context/types.ts:62](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L62)

One named, signed reason the confidence moved.

## Properties

### delta

> `readonly` **delta**: `number`

Defined in: [packages/core/src/context/types.ts:66](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L66)

Signed adjustment applied to the raw confidence.

***

### detail?

> `readonly` `optional` **detail?**: `string`

Defined in: [packages/core/src/context/types.ts:68](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L68)

Safe supporting detail — a lexicon term or rule name, never a value.

***

### signal

> `readonly` **signal**: `string`

Defined in: [packages/core/src/context/types.ts:64](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/types.ts#L64)

Stable signal name, e.g. `trigger:NATIONAL_ID`, `negative:uri-authority`.
