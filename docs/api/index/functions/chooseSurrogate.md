[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / chooseSurrogate

# Function: chooseSurrogate()

> **chooseSurrogate**(`req`, `seed`): `string` \| `null`

Defined in: [packages/core/src/mask/surrogates.ts:144](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/surrogates.ts#L144)

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
