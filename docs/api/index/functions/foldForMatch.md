[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / foldForMatch

# Function: foldForMatch()

> **foldForMatch**(`value`): `string`

Defined in: [packages/core/src/context/triggers.ts:75](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L75)

Fold a string for comparison: lowercase, then strip combining marks via NFD.

Order matters. Turkish 'İ' lowercases to 'i' + U+0307 COMBINING DOT ABOVE,
so the mark strip has to come after the case fold to remove it.

## Parameters

### value

`string`

## Returns

`string`
