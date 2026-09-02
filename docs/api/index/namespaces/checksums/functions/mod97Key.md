[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / mod97Key

# Function: mod97Key()

> **mod97Key**(`payload`): `number` \| `null`

Defined in: [packages/core/src/checksums/mod97.ts:87](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/mod97.ts#L87)

The "97 minus remainder" key used by France's NIR and Belgium's national
register number: `97 − (payload mod 97)`, in the range 1..97.

Returns `null` if the payload is not a decimal string.

## Parameters

### payload

`string`

## Returns

`number` \| `null`
