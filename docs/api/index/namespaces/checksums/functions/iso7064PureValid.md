[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / iso7064PureValid

# Function: iso7064PureValid()

> **iso7064PureValid**(`payloadValues`, `checkValue`, `modulus`, `radix`): `boolean`

Defined in: [packages/core/src/checksums/iso7064.ts:60](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/iso7064.ts#L60)

Verify a payload plus its check value under a pure ISO 7064 system.

The standard verification processes the payload with the multiplying
recurrence, then adds the check value once and requires a result of 1.

## Parameters

### payloadValues

readonly `number`[]

### checkValue

`number`

### modulus

`number`

### radix

`number`

## Returns

`boolean`
