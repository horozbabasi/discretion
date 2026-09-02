[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / detectorsForRegion

# Function: detectorsForRegion()

> **detectorsForRegion**(`region?`): readonly [`Detector`](../interfaces/Detector.md)[]

Defined in: [packages/core/src/detect/registry.ts:64](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/registry.ts#L64)

Detectors applicable to a region.

Always includes `GLOBAL` detectors. Passing `undefined` returns everything,
which is the default scanning posture: a user pasting a foreign colleague's
national ID should still have it detected.

## Parameters

### region?

`string`

## Returns

readonly [`Detector`](../interfaces/Detector.md)[]
