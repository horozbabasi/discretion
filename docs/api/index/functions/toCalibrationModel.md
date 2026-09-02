[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / toCalibrationModel

# Function: toCalibrationModel()

> **toCalibrationModel**(`generated`): [`CalibrationConversion`](../interfaces/CalibrationConversion.md)

Defined in: [packages/core/src/fuse/defaultCalibration.ts:57](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L57)

Convert a generated calibration model to core's typed one, reporting any key
that is not a known entity type instead of assuming there are none.

## Parameters

### generated

[`GeneratedCalibrationModel`](../interfaces/GeneratedCalibrationModel.md)

## Returns

[`CalibrationConversion`](../interfaces/CalibrationConversion.md)
