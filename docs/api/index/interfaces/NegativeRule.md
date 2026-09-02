[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / NegativeRule

# Interface: NegativeRule

Defined in: [packages/core/src/context/types.ts:135](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L135)

A negative-context rule.

SPEC.md: "NEGATIVE CONTEXT — signals that a candidate is NOT sensitive:
inside a code comment describing a format, in a documentation example
block, a known dummy value, lorem ipsum, a test fixture, a UUID in a log
line, a git SHA. These must actively suppress."

Each rule must state the real positive it risks suppressing, because in a
privacy tool a wrong suppression is a leak, and an un-reviewed suppression
rule is how leaks get shipped.

## Properties

### action

> `readonly` **action**: `number` \| `"suppress"`

Defined in: [packages/core/src/context/types.ts:144](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L144)

`'suppress'` drops the candidate; a negative number reduces confidence.
Prefer a penalty over suppression unless the evidence is conclusive.

***

### appliesTo

> `readonly` **appliesTo**: readonly [`EntityType`](../type-aliases/EntityType.md)[] \| `"all"`

Defined in: [packages/core/src/context/types.ts:139](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L139)

Entity types this rule may act on, or `'all'`.

***

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/context/types.ts:137](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L137)

Stable id, surfaced as `negative:<id>` in contributions.

***

### principle

> `readonly` **principle**: `string`

Defined in: [packages/core/src/context/types.ts:146](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L146)

The general principle, quoted into ARCHITECTURE.md and reviewable.

***

### risk

> `readonly` **risk**: `string`

Defined in: [packages/core/src/context/types.ts:148](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L148)

What real positive this could wrongly suppress. Required, not optional.

## Methods

### test()

> **test**(`ctx`): `boolean`

Defined in: [packages/core/src/context/types.ts:149](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/types.ts#L149)

#### Parameters

##### ctx

[`RuleContext`](RuleContext.md)

#### Returns

`boolean`
