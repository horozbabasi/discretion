[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / abaValid

# Function: abaValid()

> **abaValid**(`value`): `boolean`

Defined in: [packages/core/src/checksums/aba.ts:26](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/aba.ts#L26)

Validate a nine-digit ABA routing number.

Length is enforced here because the checksum alone is weak — a shorter or
longer digit run can satisfy it by chance, and every real routing number is
exactly nine digits.

## Parameters

### value

`string`

## Returns

`boolean`
