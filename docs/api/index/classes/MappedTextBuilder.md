[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / MappedTextBuilder

# Class: MappedTextBuilder

Defined in: [packages/core/src/offsetMap.ts:207](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/offsetMap.ts#L207)

Streaming builder used by every transform to produce output text and its
offset map in one left-to-right pass. It enforces the deletion-attribution
convention documented in the file header, so transforms cannot get it wrong
individually.

Usage contract: calls must cover the input strictly left to right —
copyVerbatim / replaceRange / deleteRange with monotonically increasing,
non-overlapping [start, end) ranges, then finish(inputLength) exactly once.

## Constructors

### Constructor

> **new MappedTextBuilder**(): `MappedTextBuilder`

#### Returns

`MappedTextBuilder`

## Methods

### copyVerbatim()

> **copyVerbatim**(`input`, `start`, `end`): `void`

Defined in: [packages/core/src/offsetMap.ts:230](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/offsetMap.ts#L230)

Copy input.slice(start, end) through unchanged. Mapping is fine-grained
(each output unit → its own input position), except that the first unit
claims any pending deleted region before it.

#### Parameters

##### input

`string`

##### start

`number`

##### end

`number`

#### Returns

`void`

***

### deleteRange()

> **deleteRange**(`start`, `end`): `void`

Defined in: [packages/core/src/offsetMap.ts:257](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/offsetMap.ts#L257)

Delete input.slice(start, end): emits nothing. The region stays
unclaimed and will be attributed to the next output (or the sentinel).

#### Parameters

##### start

`number`

##### end

`number`

#### Returns

`void`

***

### finish()

> **finish**(`inputLength`): `object`

Defined in: [packages/core/src/offsetMap.ts:262](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/offsetMap.ts#L262)

Finish the map with its sentinel entry and assemble the output text.

#### Parameters

##### inputLength

`number`

#### Returns

`object`

##### map

> **map**: `Int32Array`

##### text

> **text**: `string`

***

### replaceRange()

> **replaceRange**(`replacement`, `start`, `end`): `void`

Defined in: [packages/core/src/offsetMap.ts:245](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/offsetMap.ts#L245)

Replace input.slice(start, end) with `replacement`. Every output unit
maps to the start of the input cluster (including any pending deleted
region before it) — a span covering part of the replacement covers the
whole original cluster.

#### Parameters

##### replacement

`string`

##### start

`number`

##### end

`number`

#### Returns

`void`
