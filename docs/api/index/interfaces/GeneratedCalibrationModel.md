[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / GeneratedCalibrationModel

# Interface: GeneratedCalibrationModel

Defined in: [packages/core/src/fuse/defaultCalibration.ts:34](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L34)

The generated shape, restated so this module does not depend on data's types.

Exported because it is `toCalibrationModel`'s parameter type: a consumer who
fits their own model needs to name what the function accepts. It was local
when this file was written, and `public-api.test.ts` caught it on its first
run - which is the whole reason that test exists.

## Properties

### fittedOn

> `readonly` **fittedOn**: `string`

Defined in: [packages/core/src/fuse/defaultCalibration.ts:37](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L37)

***

### perType

> `readonly` **perType**: `Readonly`\<`Record`\<`string`, [`CalibrationCurve`](CalibrationCurve.md)\>\>

Defined in: [packages/core/src/fuse/defaultCalibration.ts:35](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L35)

***

### pooled

> `readonly` **pooled**: [`CalibrationCurve`](CalibrationCurve.md)

Defined in: [packages/core/src/fuse/defaultCalibration.ts:36](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/defaultCalibration.ts#L36)
