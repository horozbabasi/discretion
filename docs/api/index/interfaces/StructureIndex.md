[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / StructureIndex

# Interface: StructureIndex

Defined in: [packages/core/src/context/structure.ts:47](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L47)

Slots for one document, with containment lookup.

## Properties

### slots

> `readonly` **slots**: readonly [`StructuredSlot`](StructuredSlot.md)[]

Defined in: [packages/core/src/context/structure.ts:48](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L48)

## Methods

### slotAt()

> **slotAt**(`start`, `end`): [`StructuredSlot`](StructuredSlot.md) \| `undefined`

Defined in: [packages/core/src/context/structure.ts:50](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/structure.ts#L50)

The innermost slot whose value range contains the given span, if any.

#### Parameters

##### start

`number`

##### end

`number`

#### Returns

[`StructuredSlot`](StructuredSlot.md) \| `undefined`
