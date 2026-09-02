[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / MaskOptions

# Interface: MaskOptions

Defined in: [packages/core/src/mask/masker.ts:40](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/masker.ts#L40)

## Properties

### mode?

> `readonly` `optional` **mode?**: [`SubstitutionMode`](../type-aliases/SubstitutionMode.md)

Defined in: [packages/core/src/mask/masker.ts:42](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/masker.ts#L42)

'surrogate' (default) or 'token' — SPEC.md's user-selectable modes.

***

### seed?

> `readonly` `optional` **seed?**: `number`

Defined in: [packages/core/src/mask/masker.ts:44](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/mask/masker.ts#L44)

Base seed; a session should vary this so two sessions differ.
