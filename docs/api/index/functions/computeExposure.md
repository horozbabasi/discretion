[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / computeExposure

# Function: computeExposure()

> **computeExposure**(`entities`): [`ExposureReport`](../interfaces/ExposureReport.md)

Defined in: [packages/core/src/exposure/index.ts:141](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L141)

Compute a document's exposure.

Deterministic: the same entities in any order produce the same score, which
matters because the report is shown to a user and must not flicker as
detection order changes.

## Parameters

### entities

readonly [`ExposureInput`](../interfaces/ExposureInput.md)[]

## Returns

[`ExposureReport`](../interfaces/ExposureReport.md)
