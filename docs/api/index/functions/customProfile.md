[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / customProfile

# Function: customProfile()

> **customProfile**(`thresholds`, `defaultThreshold?`): [`SensitivityProfile`](../interfaces/SensitivityProfile.md)

Defined in: [packages/core/src/fuse/profiles.ts:178](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/profiles.ts#L178)

Build a custom profile from explicit per-type thresholds.

## Parameters

### thresholds

`Partial`\<`Record`\<[`EntityType`](../type-aliases/EntityType.md), `number`\>\>

### defaultThreshold?

`number` = `0.5`

## Returns

[`SensitivityProfile`](../interfaces/SensitivityProfile.md)
