[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / ProtectResult

# Interface: ProtectResult

Defined in: [packages/core/src/protect.ts:138](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/protect.ts#L138)

## Properties

### entities

> `readonly` **entities**: readonly [`ProtectedEntity`](ProtectedEntity.md)[]

Defined in: [packages/core/src/protect.ts:141](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/protect.ts#L141)

***

### exposure

> `readonly` **exposure**: [`ExposureReport`](ExposureReport.md)

Defined in: [packages/core/src/protect.ts:143](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/protect.ts#L143)

How exposed the document was, before masking.

***

### maskedText

> `readonly` **maskedText**: `string`

Defined in: [packages/core/src/protect.ts:140](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/protect.ts#L140)

The input with every reported value replaced. Safe to send.

***

### stagesRun

> `readonly` **stagesRun**: readonly [`DetectionStage`](../type-aliases/DetectionStage.md)[]

Defined in: [packages/core/src/protect.ts:151](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/protect.ts#L151)

Which stages actually ran.

DERIVED from the options, never declared, so "Stage 2 ran" is a claim the
code supports rather than a comment. Absence of `'stage2-ner'` is how a
caller knows names were not looked for.

***

### vault

> `readonly` **vault**: [`Vault`](../classes/Vault.md)

Defined in: [packages/core/src/protect.ts:159](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/protect.ts#L159)

The vault holding the originals. Pass it to `restore()` to reverse this.

The same instance passed in `options.vault`, or the one created for this
call. It holds plaintext originals in memory: SPEC.md forbids persisting
it, and the extension clears it per tab session.
