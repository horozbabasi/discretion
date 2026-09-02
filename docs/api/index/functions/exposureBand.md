[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / exposureBand

# Function: exposureBand()

> **exposureBand**(`score`): `"none"` \| `"low"` \| `"moderate"` \| `"high"` \| `"severe"`

Defined in: [packages/core/src/exposure/index.ts:183](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/exposure/index.ts#L183)

A band for presentation. Thresholds are presentational only — every decision
the pipeline makes uses calibrated confidence, never this label.

## Parameters

### score

`number`

## Returns

`"none"` \| `"low"` \| `"moderate"` \| `"high"` \| `"severe"`
