[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / NormalizationResult

# Interface: NormalizationResult

Defined in: [packages/core/src/types.ts:327](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L327)

The result of Stage 0 normalization.

THE OFFSET MAP CONTRACT
───────────────────────
Detection runs on `normalizedText`; substitution edits the ORIGINAL text.
`offsetMap` connects the two:

  offsetMap[i]  = index in the original string where the cluster that
                  produced normalized index i begins.
  offsetMap[normalizedText.length] = originalText.length   (sentinel)

A normalized span [s, e) therefore maps to the original span
[offsetMap[s], offsetMap[e]).  Invariants (tested exhaustively):
  • offsetMap is monotonically non-decreasing
  • offsetMap[0] === 0 whenever normalizedText is non-empty
  • offsetMap[normalizedLength] === originalLength
  • every value is a valid index into the original string (0..length incl.)
  • identity inputs produce offsetMap[i] === i for every i

Deleted characters (invisibles) do not appear in offsetMap; each deleted
run is attributed to the cluster that FOLLOWS it (or to the sentinel when
the run is at the very end), which is what makes offsetMap[0] === 0 hold.

`reverseMap` goes the other way:
  reverseMap[j] = normalized index of the start of the cluster whose
                  original extent contains original index j; for a deleted
                  character this is the normalized position where it was
                  removed.
  reverseMap[originalText.length] = normalizedText.length   (sentinel)

## Properties

### normalizedLength

> **normalizedLength**: `number`

Defined in: [packages/core/src/types.ts:338](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L338)

***

### normalizedText

> **normalizedText**: `string`

Defined in: [packages/core/src/types.ts:328](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L328)

***

### offsetMap

> **offsetMap**: `Int32Array`

Defined in: [packages/core/src/types.ts:330](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L330)

normalized index → original index; length is normalizedText.length + 1.

***

### originalLength

> **originalLength**: `number`

Defined in: [packages/core/src/types.ts:337](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L337)

***

### reverseMap

> **reverseMap**: `Int32Array`

Defined in: [packages/core/src/types.ts:332](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L332)

original index → normalized index; length is originalText.length + 1.

***

### scripts

> **scripts**: [`ScriptInfo`](ScriptInfo.md)

Defined in: [packages/core/src/types.ts:334](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L334)

Script breakdown of the NORMALIZED text.

***

### transformations

> **transformations**: readonly [`TransformationRecord`](TransformationRecord.md)[]

Defined in: [packages/core/src/types.ts:336](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L336)

Every transform that fired, with ranges in original-text coordinates.
