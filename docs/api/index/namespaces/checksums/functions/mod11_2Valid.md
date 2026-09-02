[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / mod11\_2Valid

# Function: mod11\_2Valid()

> **mod11\_2Valid**(`payload`, `check`): `boolean`

Defined in: [packages/core/src/checksums/iso7064.ts:77](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/iso7064.ts#L77)

ISO 7064 MOD 11-2 over a decimal payload.

`payload` must be all ASCII digits; `check` is the trailing check character,
either a digit or 'X'/'x' representing 10. This is China's Resident
Identity Card checksum.

## Parameters

### payload

`string`

### check

`string`

## Returns

`boolean`
