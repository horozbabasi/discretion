[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / SurrogateRequest

# Interface: SurrogateRequest

Defined in: [packages/core/src/mask/surrogates.ts:39](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/surrogates.ts#L39)

What the masker gives the registry about one detected value.

## Properties

### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/mask/surrogates.ts:44](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/surrogates.ts#L44)

Detector metadata: scheme, country, issuer, chain, version, kind.

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/mask/surrogates.ts:42](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/surrogates.ts#L42)

The matched text (normalized). Used for shape and script inference.

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/mask/surrogates.ts:40](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/surrogates.ts#L40)
