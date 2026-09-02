[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / ibanMod97Valid

# Function: ibanMod97Valid()

> **ibanMod97Valid**(`iban`): `boolean`

Defined in: [packages/core/src/checksums/mod97.ts:55](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/mod97.ts#L55)

Validate an IBAN's mod-97 checksum (ISO 13616 / ISO 7064 MOD 97-10).

Expects an IBAN already stripped of spaces and uppercased. Country-specific
length and structure rules are NOT checked here — that is the IBAN
detector's per-country table. This function answers exactly one question:
does the checksum close?

Procedure: move the first four characters (country code + check digits) to
the end, replace each letter with its base-36 value, and take mod 97. A
valid IBAN yields 1.

## Parameters

### iban

`string`

## Returns

`boolean`
