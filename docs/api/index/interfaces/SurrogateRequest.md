[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / SurrogateRequest

# Interface: SurrogateRequest

Defined in: [packages/core/src/mask/surrogates.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/surrogates.ts#L39)

What the masker gives the registry about one detected value.

## Properties

### metadata?

> `readonly` `optional` **metadata?**: `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/core/src/mask/surrogates.ts:44](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/surrogates.ts#L44)

Detector metadata: scheme, country, issuer, chain, version, kind.

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/mask/surrogates.ts:42](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/surrogates.ts#L42)

The matched text (normalized). Used for shape and script inference.

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/mask/surrogates.ts:40](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/surrogates.ts#L40)
