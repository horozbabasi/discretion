[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / runStage1

# Function: runStage1()

> **runStage1**(`normalization`, `options?`): [`Stage1Candidate`](../interfaces/Stage1Candidate.md)[]

Defined in: [packages/core/src/detect/runner.ts:79](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/runner.ts#L79)

Run Stage 1 over an already-normalized text.

Takes the whole `NormalizationResult` rather than a bare string because the
offset map is not optional: a candidate without a correct original-text span
cannot be masked, and accepting a string would let a caller forget it.

## Parameters

### normalization

[`NormalizationResult`](../interfaces/NormalizationResult.md)

### options?

[`Stage1Options`](../interfaces/Stage1Options.md) = `{}`

## Returns

[`Stage1Candidate`](../interfaces/Stage1Candidate.md)[]
