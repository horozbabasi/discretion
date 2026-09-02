[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / VaultEntry

# Interface: VaultEntry

Defined in: [packages/core/src/types.ts:178](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L178)

One masked value held locally so the original can be restored later.

## Properties

### canonical?

> `optional` **canonical?**: `string`

Defined in: [packages/core/src/types.ts:195](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L195)

Canonical form of the original (separators stripped, case-normalized by
the detector) — the consistency key that makes "4111 1111…" and
"4111-1111…" share one entry, and the egress guard's
separator-insensitive search term. Added in M4; optional because token
bracket entries for unknown shapes have no canonical beyond the text.

***

### createdAt

> **createdAt**: `number`

Defined in: [packages/core/src/types.ts:187](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L187)

Epoch milliseconds when the entry was created.

***

### fallback?

> `optional` **fallback?**: `boolean`

Defined in: [packages/core/src/types.ts:201](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L201)

True when no sensible surrogate could be produced and a bracket token
was used instead — SPEC.md requires the fallback be recorded in the
session record. Added in M4.

***

### id

> **id**: `string`

Defined in: [packages/core/src/types.ts:180](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L180)

Stable unique id of this entry.

***

### original

> **original**: `string`

Defined in: [packages/core/src/types.ts:183](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L183)

The original text that was masked (first-seen writing).

***

### replacement

> **replacement**: `string`

Defined in: [packages/core/src/types.ts:185](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L185)

What it was replaced with (a surrogate value or an opaque token).

***

### type

> **type**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/types.ts:181](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L181)
