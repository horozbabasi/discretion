[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / Candidate

# Interface: Candidate

Defined in: [packages/core/src/types.ts:107](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L107)

A pre-fusion detection produced by a single detector.
Offsets are indices into the NORMALIZED text (see NormalizationResult for
how they map back to the original).

## Properties

### detectorId

> **detectorId**: `string`

Defined in: [packages/core/src/types.ts:119](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L119)

Stable identifier of the detector that produced this, e.g. "email-rfc5322".

***

### end

> **end**: `number`

Defined in: [packages/core/src/types.ts:114](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L114)

End offset (exclusive).

***

### metadata?

> `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/types.ts:121](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L121)

Detector-specific extras (e.g. { scheme: 'ssn', country: 'US' } for national_id).

***

### rawConfidence

> **rawConfidence**: `number`

Defined in: [packages/core/src/types.ts:116](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L116)

Detector-local confidence in [0, 1]; NOT calibrated across detectors.

***

### stage

> **stage**: [`DetectionStage`](../type-aliases/DetectionStage.md)

Defined in: [packages/core/src/types.ts:117](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L117)

***

### start

> **start**: `number`

Defined in: [packages/core/src/types.ts:112](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L112)

Start offset (inclusive), UTF-16 code units into the normalized text.

***

### text

> **text**: `string`

Defined in: [packages/core/src/types.ts:109](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L109)

The matched substring of the normalized text.

***

### type

> **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/types.ts:110](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L110)
