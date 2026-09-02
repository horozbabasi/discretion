[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / TriggerIndex

# Interface: TriggerIndex

Defined in: [packages/core/src/context/triggers.ts:52](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L52)

## Properties

### termCount

> `readonly` **termCount**: `number`

Defined in: [packages/core/src/context/triggers.ts:54](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L54)

Number of distinct terms indexed, for reporting.

## Methods

### near()

> **near**(`text`, `start`, `end`, `window?`): readonly [`TriggerMatch`](TriggerMatch.md)[]

Defined in: [packages/core/src/context/triggers.ts:60](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/triggers.ts#L60)

Triggers found within `window` characters of the span, nearest first.
Searching both sides matters: most languages label before the value
("SSN: …") but several place it after ("… کد ملی").

#### Parameters

##### text

`string`

##### start

`number`

##### end

`number`

##### window?

`number`

#### Returns

readonly [`TriggerMatch`](TriggerMatch.md)[]
