[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / toCalibrationModel

# Function: toCalibrationModel()

> **toCalibrationModel**(`generated`): [`CalibrationConversion`](../interfaces/CalibrationConversion.md)

Defined in: [packages/core/src/fuse/defaultCalibration.ts:57](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/defaultCalibration.ts#L57)

Convert a generated calibration model to core's typed one, reporting any key
that is not a known entity type instead of assuming there are none.

## Parameters

### generated

[`GeneratedCalibrationModel`](../interfaces/GeneratedCalibrationModel.md)

## Returns

[`CalibrationConversion`](../interfaces/CalibrationConversion.md)
