[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / mrzCheckValid

# Function: mrzCheckValid()

> **mrzCheckValid**(`field`, `check`): `boolean`

Defined in: [packages/core/src/checksums/icao9303.ts:47](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/icao9303.ts#L47)

Verify a field against its trailing check character.

The check character may itself be '<' in the optional-data field of some
documents, which ICAO treats as zero — handled by `mrzCharValue`.

## Parameters

### field

`string`

### check

`string`

## Returns

`boolean`
