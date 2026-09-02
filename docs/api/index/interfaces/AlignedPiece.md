[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / AlignedPiece

# Interface: AlignedPiece

Defined in: [packages/core/src/ner/align.ts:32](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/align.ts#L32)

## Properties

### end

> `readonly` **end**: `number`

Defined in: [packages/core/src/ner/align.ts:36](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/align.ts#L36)

End offset in the input (exclusive).

***

### located

> `readonly` **located**: `boolean`

Defined in: [packages/core/src/ner/align.ts:38](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/align.ts#L38)

False for [UNK]/unfindable pieces — zero-width placeholders.

***

### start

> `readonly` **start**: `number`

Defined in: [packages/core/src/ner/align.ts:34](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/ner/align.ts#L34)

Start offset in the input (inclusive); equals `end` when unlocated.
