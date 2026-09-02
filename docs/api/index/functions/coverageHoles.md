[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / coverageHoles

# Function: coverageHoles()

> **coverageHoles**(`before`, `after`): `object`[]

Defined in: [packages/core/src/fuse/resolve.ts:215](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/resolve.ts#L215)

Every character a sensitive candidate covered is still covered.

The invariant resolution exists to preserve, exposed so callers and tests
can assert it directly rather than trusting the ordering to imply it.

## Parameters

### before

readonly [`ScoredForResolution`](../interfaces/ScoredForResolution.md)[]

### after

readonly [`ScoredForResolution`](../interfaces/ScoredForResolution.md)[]

## Returns

`object`[]
