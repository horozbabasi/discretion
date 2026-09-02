[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / CalibrationModel

# Interface: CalibrationModel

Defined in: [packages/core/src/fuse/calibrate.ts:53](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L53)

## Properties

### fittedOn

> `readonly` **fittedOn**: `string`

Defined in: [packages/core/src/fuse/calibrate.ts:59](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L59)

Documents the model was fitted on, for the split statement.

***

### perType

> `readonly` **perType**: `Readonly`\<`Partial`\<`Record`\<[`EntityType`](../type-aliases/EntityType.md), [`CalibrationCurve`](CalibrationCurve.md)\>\>\>

Defined in: [packages/core/src/fuse/calibrate.ts:55](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L55)

Per-type curves. Types absent here use `pooled`.

***

### pooled

> `readonly` **pooled**: [`CalibrationCurve`](CalibrationCurve.md)

Defined in: [packages/core/src/fuse/calibrate.ts:57](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L57)

Fallback for types with too little data to fit their own curve.
