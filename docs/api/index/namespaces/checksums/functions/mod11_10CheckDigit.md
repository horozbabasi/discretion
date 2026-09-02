[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [checksums](../README.md) / mod11\_10CheckDigit

# Function: mod11\_10CheckDigit()

> **mod11\_10CheckDigit**(`payload`): `number` \| `null`

Defined in: [packages/core/src/checksums/iso7064.ts:137](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/checksums/iso7064.ts#L137)

ISO 7064 MOD 11-10, a hybrid system. Unlike the pure systems this carries
the running value through a different recurrence and closes with a single
decimal check digit.

    P ← 10  (seed)
    for each digit d:  P ← ((P mod 11) + d) mod 10, folding 0 to 10, ×2 mod 11

Expressed in the standard's own terms below.

## Parameters

### payload

`string`

## Returns

`number` \| `null`
