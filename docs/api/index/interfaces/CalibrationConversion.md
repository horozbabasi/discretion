[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / CalibrationConversion

# Interface: CalibrationConversion

Defined in: [packages/core/src/fuse/defaultCalibration.ts:40](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/defaultCalibration.ts#L40)

## Properties

### model

> `readonly` **model**: [`CalibrationModel`](CalibrationModel.md)

Defined in: [packages/core/src/fuse/defaultCalibration.ts:41](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/defaultCalibration.ts#L41)

***

### unknownTypes

> `readonly` **unknownTypes**: readonly `string`[]

Defined in: [packages/core/src/fuse/defaultCalibration.ts:50](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/defaultCalibration.ts#L50)

Keys in the generated model that are not `EntityType` members.

Non-empty means the committed model and the union have drifted apart. The
conversion still succeeds — dropping an unusable curve is better than
refusing to calibrate anything — but the caller can now see it, and
`calibration-model.test.ts` asserts it is empty.
