[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / LanguageTriggers

# Interface: LanguageTriggers

Defined in: [packages/core/src/context/triggers.ts:34](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L34)

One language's triggers, keyed by the entity type each vouches for.

## Properties

### code

> `readonly` **code**: `string`

Defined in: [packages/core/src/context/triggers.ts:36](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L36)

BCP-47 primary subtag, e.g. 'tr', 'zh', 'he'.

***

### triggers

> `readonly` **triggers**: `Readonly`\<`Partial`\<`Record`\<[`EntityType`](../type-aliases/EntityType.md), readonly `string`[]\>\>\>

Defined in: [packages/core/src/context/triggers.ts:37](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L37)
