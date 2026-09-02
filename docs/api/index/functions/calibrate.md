[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / calibrate

# Function: calibrate()

> **calibrate**(`model`, `type`, `score`): `number`

Defined in: [packages/core/src/fuse/calibrate.ts:168](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L168)

Map a raw score to a calibrated probability.

PIECEWISE CONSTANT — the containing step's empirical precision, which is the
standard prediction for an isotonic fit. An earlier revision interpolated
between step midpoints to smooth the output, and that was an embellishment
with no justification behind it: because the step function is coarse where
data is sparse, interpolating systematically pulled predictions toward the
step below and left the model under-confident through 0.7-0.8. Returning the
step's own measured precision is both the standard method and the one whose
meaning is readable — "candidates in this band were right this often".

## Parameters

### model

[`CalibrationModel`](../interfaces/CalibrationModel.md)

### type

[`EntityType`](../type-aliases/EntityType.md)

### score

`number`

## Returns

`number`
