[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / reliability

# Function: reliability()

> **reliability**(`model`, `heldOut`, `buckets?`): `object`

Defined in: [packages/core/src/fuse/calibrate.ts:192](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L192)

Measure a fitted model against HELD-OUT observations.

This is the number that means something: a curve scored on the documents it
was fitted on measures memorisation, not calibration.

## Parameters

### model

[`CalibrationModel`](../interfaces/CalibrationModel.md)

### heldOut

readonly [`CalibrationSample`](../interfaces/CalibrationSample.md)[]

### buckets?

`number` = `10`

## Returns

`object`

### expectedCalibrationError

> `readonly` **expectedCalibrationError**: `number`

### points

> `readonly` **points**: readonly [`ReliabilityPoint`](../interfaces/ReliabilityPoint.md)[]
