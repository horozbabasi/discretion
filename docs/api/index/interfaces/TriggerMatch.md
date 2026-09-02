[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / TriggerMatch

# Interface: TriggerMatch

Defined in: [packages/core/src/context/triggers.ts:41](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L41)

A trigger found near a candidate.

## Properties

### distance

> `readonly` **distance**: `number`

Defined in: [packages/core/src/context/triggers.ts:47](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L47)

Characters between the trigger and the candidate. 0 when adjacent.

***

### languages

> `readonly` **languages**: readonly `string`[]

Defined in: [packages/core/src/context/triggers.ts:49](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L49)

Language codes that contributed this term.

***

### term

> `readonly` **term**: `string`

Defined in: [packages/core/src/context/triggers.ts:43](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L43)

The lexicon term that matched, in its lexicon (folded) form.

***

### types

> `readonly` **types**: readonly [`EntityType`](../type-aliases/EntityType.md)[]

Defined in: [packages/core/src/context/triggers.ts:45](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L45)

Entity types this term vouches for.
