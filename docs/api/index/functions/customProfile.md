[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / customProfile

# Function: customProfile()

> **customProfile**(`thresholds`, `defaultThreshold?`): [`SensitivityProfile`](../interfaces/SensitivityProfile.md)

Defined in: [packages/core/src/fuse/profiles.ts:178](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/profiles.ts#L178)

Build a custom profile from explicit per-type thresholds.

## Parameters

### thresholds

`Partial`\<`Record`\<[`EntityType`](../type-aliases/EntityType.md), `number`\>\>

### defaultThreshold?

`number` = `0.5`

## Returns

[`SensitivityProfile`](../interfaces/SensitivityProfile.md)
