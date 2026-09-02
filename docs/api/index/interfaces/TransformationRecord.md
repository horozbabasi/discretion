[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / TransformationRecord

# Interface: TransformationRecord

Defined in: [packages/core/src/types.ts:274](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L274)

One transform application, recorded for debugging and for the review UI.

## Properties

### kind

> **kind**: [`TransformKind`](../type-aliases/TransformKind.md)

Defined in: [packages/core/src/types.ts:275](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L275)

***

### original

> **original**: `string`

Defined in: [packages/core/src/types.ts:281](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L281)

The affected slice of the ORIGINAL text.

***

### originalEnd

> **originalEnd**: `number`

Defined in: [packages/core/src/types.ts:279](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L279)

End of the affected range in the ORIGINAL text (exclusive).

***

### originalStart

> **originalStart**: `number`

Defined in: [packages/core/src/types.ts:277](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L277)

Start of the affected range in the ORIGINAL text (inclusive).

***

### replacement

> **replacement**: `string`

Defined in: [packages/core/src/types.ts:283](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L283)

What this transform emitted for that range ('' for deletions).
