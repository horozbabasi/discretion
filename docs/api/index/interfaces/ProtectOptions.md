[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ProtectOptions

# Interface: ProtectOptions

Defined in: [packages/core/src/protect.ts:71](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L71)

## Properties

### calibration?

> `readonly` `optional` **calibration?**: [`CalibrationModel`](CalibrationModel.md)

Defined in: [packages/core/src/protect.ts:113](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L113)

Overrides the shipped calibration model. For eval work, not for use.

***

### defaultRegion?

> `readonly` `optional` **defaultRegion?**: `string`

Defined in: [packages/core/src/protect.ts:87](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L87)

The region used for identifiers that are ambiguous without one.

Not a tie-breaker: a phone number written in national form cannot be
validated at all without a region, so leaving this unset does not lower
its confidence — the detector reports nothing.

***

### lists?

> `readonly` `optional` **lists?**: [`UserLists`](UserLists.md)

Defined in: [packages/core/src/protect.ts:79](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L79)

Values to always report (`deny`) or never report (`allow`).

***

### mode?

> `readonly` `optional` **mode?**: [`SubstitutionMode`](../type-aliases/SubstitutionMode.md)

Defined in: [packages/core/src/protect.ts:91](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L91)

`'surrogate'` (realistic stand-ins, default) or `'token'` (`[EMAIL_1]`).

***

### ner?

> `readonly` `optional` **ner?**: [`NerRecognizer`](NerRecognizer.md)

Defined in: [packages/core/src/protect.ts:111](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L111)

Stage 2. Omit to run Stages 0, 1, 3 and 4 only.

Not defaulted to a model on purpose: the recogniser pulls in the ONNX
runtime, which this package does not depend on. See the "Stage 2" section
of the usage guide.

***

### profile?

> `readonly` `optional` **profile?**: [`ProfileName`](../type-aliases/ProfileName.md) \| [`SensitivityProfile`](SensitivityProfile.md)

Defined in: [packages/core/src/protect.ts:77](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L77)

Which findings are worth reporting. A `ProfileName` selects one of the
three SPEC profiles; a `SensitivityProfile` supplies your own.
Default: `'balanced'`.

***

### seed?

> `readonly` `optional` **seed?**: `number`

Defined in: [packages/core/src/protect.ts:93](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L93)

Varies surrogate selection. Fixed input plus fixed seed is reproducible.

***

### typeAllowed?

> `readonly` `optional` **typeAllowed?**: (`type`) => `boolean`

Defined in: [packages/core/src/protect.ts:89](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L89)

Per-type opt-out, applied before a surrogate is minted.

#### Parameters

##### type

[`EntityType`](../type-aliases/EntityType.md)

#### Returns

`boolean`

***

### vault?

> `readonly` `optional` **vault?**: [`Vault`](../classes/Vault.md)

Defined in: [packages/core/src/protect.ts:103](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/protect.ts#L103)

The vault that remembers which surrogate stood in for which value.

REQUIRED FOR RESTORATION, and required for consistency across calls: pass
the same vault to every `protect()` in a conversation and a value seen
twice gets the same surrogate. Omit it and a fresh vault is created for
this call alone, which is correct for one-shot masking and wrong for
anything that restores a reply later.
