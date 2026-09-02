[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / exposureBand

# Function: exposureBand()

> **exposureBand**(`score`): `"none"` \| `"low"` \| `"moderate"` \| `"high"` \| `"severe"`

Defined in: [packages/core/src/exposure/index.ts:183](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/exposure/index.ts#L183)

A band for presentation. Thresholds are presentational only — every decision
the pipeline makes uses calibrated confidence, never this label.

## Parameters

### score

`number`

## Returns

`"none"` \| `"low"` \| `"moderate"` \| `"high"` \| `"severe"`
