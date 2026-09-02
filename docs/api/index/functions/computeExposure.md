[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / computeExposure

# Function: computeExposure()

> **computeExposure**(`entities`): [`ExposureReport`](../interfaces/ExposureReport.md)

Defined in: [packages/core/src/exposure/index.ts:141](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L141)

Compute a document's exposure.

Deterministic: the same entities in any order produce the same score, which
matters because the report is shown to a user and must not flicker as
detection order changes.

## Parameters

### entities

readonly [`ExposureInput`](../interfaces/ExposureInput.md)[]

## Returns

[`ExposureReport`](../interfaces/ExposureReport.md)
