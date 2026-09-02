[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / StructureIndex

# Interface: StructureIndex

Defined in: [packages/core/src/context/structure.ts:47](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/structure.ts#L47)

Slots for one document, with containment lookup.

## Properties

### slots

> `readonly` **slots**: readonly [`StructuredSlot`](StructuredSlot.md)[]

Defined in: [packages/core/src/context/structure.ts:48](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/structure.ts#L48)

## Methods

### slotAt()

> **slotAt**(`start`, `end`): [`StructuredSlot`](StructuredSlot.md) \| `undefined`

Defined in: [packages/core/src/context/structure.ts:50](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/structure.ts#L50)

The innermost slot whose value range contains the given span, if any.

#### Parameters

##### start

`number`

##### end

`number`

#### Returns

[`StructuredSlot`](StructuredSlot.md) \| `undefined`
