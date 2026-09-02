[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / DetectedEntity

# Interface: DetectedEntity

Defined in: [packages/core/src/types.ts:135](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L135)

A post-fusion entity: what the pipeline actually reports.

## Properties

### calibratedConfidence

> **calibratedConfidence**: `number`

Defined in: [packages/core/src/types.ts:144](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L144)

Calibrated confidence in [0, 1], comparable across types and stages.

***

### end

> **end**: `number`

Defined in: [packages/core/src/types.ts:142](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L142)

End offset (exclusive).

***

### explanation

> **explanation**: [`EntityExplanation`](EntityExplanation.md)

Defined in: [packages/core/src/types.ts:145](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L145)

***

### start

> **start**: `number`

Defined in: [packages/core/src/types.ts:140](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L140)

Start offset (inclusive), UTF-16 code units into the normalized text.

***

### text

> **text**: `string`

Defined in: [packages/core/src/types.ts:137](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L137)

The matched substring of the normalized text.

***

### type

> **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/types.ts:138](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L138)
