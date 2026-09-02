[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / LanguageTriggers

# Interface: LanguageTriggers

Defined in: [packages/core/src/context/triggers.ts:34](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/triggers.ts#L34)

One language's triggers, keyed by the entity type each vouches for.

## Properties

### code

> `readonly` **code**: `string`

Defined in: [packages/core/src/context/triggers.ts:36](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/triggers.ts#L36)

BCP-47 primary subtag, e.g. 'tr', 'zh', 'he'.

***

### triggers

> `readonly` **triggers**: `Readonly`\<`Partial`\<`Record`\<[`EntityType`](../type-aliases/EntityType.md), readonly `string`[]\>\>\>

Defined in: [packages/core/src/context/triggers.ts:37](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/triggers.ts#L37)
