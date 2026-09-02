[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / detect

# Function: detect()

> **detect**(`normalization`, `options?`): `Promise`\<[`DetectionOutcome`](../interfaces/DetectionOutcome.md)\>

Defined in: [packages/core/src/pipeline.ts:64](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L64)

Run Stages 0–3 over an already-normalized document.

Takes the `NormalizationResult` rather than a string for the same reason
`runStage1` does: without the offset map a candidate cannot be mapped back
to the original text, and accepting a bare string would let a caller lose
it silently.

## Parameters

### normalization

[`NormalizationResult`](../interfaces/NormalizationResult.md)

### options?

[`DetectOptions`](../interfaces/DetectOptions.md) = `{}`

## Returns

`Promise`\<[`DetectionOutcome`](../interfaces/DetectionOutcome.md)\>
