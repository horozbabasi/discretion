[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / alphanumericValue

# Function: alphanumericValue()

> **alphanumericValue**(`ch`): `number` \| `null`

Defined in: [packages/core/src/checksums/digits.ts:57](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/digits.ts#L57)

Value of an alphanumeric character in base 36: '0'–'9' → 0–9,
'A'/'a'–'Z'/'z' → 10–35. Returns `null` for anything else.

This is the mapping IBAN's mod-97 and several VAT schemes use to fold
letters into the numeric checksum.

## Parameters

### ch

`string`

## Returns

`number` \| `null`
