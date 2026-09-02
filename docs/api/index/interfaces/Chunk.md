[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / Chunk

# Interface: Chunk

Defined in: [packages/core/src/ner/chunk.ts:19](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunk.ts#L19)

chunk.ts — window long inputs so the model sees ALL of the text.

Transformer runtimes silently truncate past their token limit (verified
against the actual runtime: a 3000-character input stopped producing
predictions at token 512 with no error). Undetected text would be
undetected sensitive data, so the engine windows the input in CHARACTER
units — safe because the worst tokenizer ratio is one token per
character (CJK) — with an overlap wide enough that any entity split by
one window boundary lies fully inside a neighbouring window.

De-duplication rule for the overlap: a window "owns" the entities whose
span midpoint falls in its core (the window minus half an overlap at
each interior edge). Every midpoint lands in exactly one core, so each
entity is emitted exactly once, and — because overlap/2 exceeds any
plausible entity length — the owning window saw the whole entity.

## Properties

### coreEnd

> `readonly` **coreEnd**: `number`

Defined in: [packages/core/src/ner/chunk.ts:25](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunk.ts#L25)

***

### coreStart

> `readonly` **coreStart**: `number`

Defined in: [packages/core/src/ner/chunk.ts:24](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunk.ts#L24)

Core region (absolute offsets): this window owns midpoints in it.

***

### offset

> `readonly` **offset**: `number`

Defined in: [packages/core/src/ner/chunk.ts:21](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunk.ts#L21)

Offset of this window's first character in the full text.

***

### text

> `readonly` **text**: `string`

Defined in: [packages/core/src/ner/chunk.ts:22](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/ner/chunk.ts#L22)
