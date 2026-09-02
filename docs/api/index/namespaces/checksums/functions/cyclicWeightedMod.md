[**@privacyshield/core**](../../../../README.md)

***

[@privacyshield/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / cyclicWeightedMod

# Function: cyclicWeightedMod()

> **cyclicWeightedMod**(`digits`, `weights`, `modulus`): `number` \| `null`

Defined in: [packages/core/src/checksums/weighted.ts:86](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/checksums/weighted.ts#L86)

A cycling weight vector: position i uses `weights[i % weights.length]`.

Used by schemes whose weights repeat over a long identifier (Russia's INN
and SNILS, several VAT formats) rather than being listed per position.

## Parameters

### digits

readonly `number`[]

### weights

readonly `number`[]

### modulus

`number`

## Returns

`number` \| `null`
