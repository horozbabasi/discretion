[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / StructuredSlot

# Interface: StructuredSlot

Defined in: [packages/core/src/context/structure.ts:36](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L36)

A value position in the document, together with the key that labels it.

## Properties

### key

> `readonly` **key**: `string`

Defined in: [packages/core/src/context/structure.ts:38](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L38)

The key/label text exactly as written, minus quotes and surrounding space.

***

### kind

> `readonly` **kind**: [`StructureKind`](../type-aliases/StructureKind.md)

Defined in: [packages/core/src/context/structure.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L39)

***

### valueEnd

> `readonly` **valueEnd**: `number`

Defined in: [packages/core/src/context/structure.ts:43](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L43)

End offset of the VALUE (exclusive).

***

### valueStart

> `readonly` **valueStart**: `number`

Defined in: [packages/core/src/context/structure.ts:41](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L41)

Start offset of the VALUE in the normalized text (inclusive).
