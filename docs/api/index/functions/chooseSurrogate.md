[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / chooseSurrogate

# Function: chooseSurrogate()

> **chooseSurrogate**(`req`, `seed`): `string` \| `null`

Defined in: [packages/core/src/mask/surrogates.ts:144](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/surrogates.ts#L144)

Choose a surrogate for a detected entity. Returns the surrogate string, or
`null` when the type has no sensible surrogate (masker → bracket token).
`seed` varies across collision retries so a fresh value is produced.

## Parameters

### req

[`SurrogateRequest`](../interfaces/SurrogateRequest.md)

### seed

`number`

## Returns

`string` \| `null`
