[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / mask

# Function: mask()

> **mask**(`text`, `vault`, `options?`): [`MaskResult`](../interfaces/MaskResult.md)

Defined in: [packages/core/src/mask/masker.ts:180](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/mask/masker.ts#L180)

End-to-end: normalize, run Stage 1, and mask the original text. The
convenience entry point for the playground (M5) and the tests; the
extension (M9) wires the same pieces with its own detection options.

## Parameters

### text

`string`

### vault

[`Vault`](../classes/Vault.md)

### options?

[`MaskOptions`](../interfaces/MaskOptions.md) & [`Stage1Options`](../interfaces/Stage1Options.md) = `{}`

## Returns

[`MaskResult`](../interfaces/MaskResult.md)
