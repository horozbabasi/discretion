[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / CalibrationBin

# Interface: CalibrationBin

Defined in: [packages/core/src/fuse/calibrate.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L39)

One step of a fitted curve: scores in [from, to) map to `precision`.

## Properties

### from

> `readonly` **from**: `number`

Defined in: [packages/core/src/fuse/calibrate.ts:40](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L40)

***

### precision

> `readonly` **precision**: `number`

Defined in: [packages/core/src/fuse/calibrate.ts:43](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L43)

Empirical precision of candidates whose raw score fell in this bin.

***

### samples

> `readonly` **samples**: `number`

Defined in: [packages/core/src/fuse/calibrate.ts:45](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L45)

How many candidates the step was fitted on, for reporting weight.

***

### to

> `readonly` **to**: `number`

Defined in: [packages/core/src/fuse/calibrate.ts:41](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/calibrate.ts#L41)
