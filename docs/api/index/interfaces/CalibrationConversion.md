[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / CalibrationConversion

# Interface: CalibrationConversion

Defined in: [packages/core/src/fuse/defaultCalibration.ts:40](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L40)

## Properties

### model

> `readonly` **model**: [`CalibrationModel`](CalibrationModel.md)

Defined in: [packages/core/src/fuse/defaultCalibration.ts:41](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L41)

***

### unknownTypes

> `readonly` **unknownTypes**: readonly `string`[]

Defined in: [packages/core/src/fuse/defaultCalibration.ts:50](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L50)

Keys in the generated model that are not `EntityType` members.

Non-empty means the committed model and the union have drifted apart. The
conversion still succeeds — dropping an unusable curve is better than
refusing to calibrate anything — but the caller can now see it, and
`calibration-model.test.ts` asserts it is empty.
