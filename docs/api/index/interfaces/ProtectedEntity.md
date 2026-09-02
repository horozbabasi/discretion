[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ProtectedEntity

# Interface: ProtectedEntity

Defined in: [packages/core/src/protect.ts:117](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L117)

One finding, with everything needed to show it and nothing that leaks it.

## Properties

### confidence

> `readonly` **confidence**: `number`

Defined in: [packages/core/src/protect.ts:128](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L128)

Calibrated, comparable across types. Never the raw detector score.

***

### explanation

> `readonly` **explanation**: [`EntityExplanation`](EntityExplanation.md)

Defined in: [packages/core/src/protect.ts:130](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L130)

Which evidence fired. Structured, so callers can render it in any language.

***

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/protect.ts:125](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L125)

The vault id, stable across re-analyses of the same value.

Derived from the value rather than from position, so a caller tracking a
user's per-item decisions keeps them when text is edited earlier in the
document. An index-based id would silently move the decision.

***

### originalEnd

> `readonly` **originalEnd**: `number`

Defined in: [packages/core/src/protect.ts:135](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L135)

***

### originalStart

> `readonly` **originalStart**: `number`

Defined in: [packages/core/src/protect.ts:134](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L134)

Offsets into the ORIGINAL text, not the normalized text.

***

### surrogate

> `readonly` **surrogate**: `string`

Defined in: [packages/core/src/protect.ts:132](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L132)

What replaced it in `maskedText`.

***

### type

> `readonly` **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/protect.ts:126](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L126)
