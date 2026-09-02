[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / ContextAnalysis

# Interface: ContextAnalysis

Defined in: [packages/core/src/context/score.ts:125](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/score.ts#L125)

## Properties

### profile

> `readonly` **profile**: [`DocumentProfile`](DocumentProfile.md)

Defined in: [packages/core/src/context/score.ts:126](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/score.ts#L126)

***

### structure

> `readonly` **structure**: [`StructureIndex`](StructureIndex.md)

Defined in: [packages/core/src/context/score.ts:127](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/score.ts#L127)

***

### triggers

> `readonly` **triggers**: [`TriggerIndex`](TriggerIndex.md)

Defined in: [packages/core/src/context/score.ts:128](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/score.ts#L128)

## Methods

### score()

> **score**(`candidates`): [`ContextScoredCandidate`](ContextScoredCandidate.md)[]

Defined in: [packages/core/src/context/score.ts:132](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/score.ts#L132)

Adjust and filter a candidate set.

#### Parameters

##### candidates

readonly [`PipelineCandidate`](../type-aliases/PipelineCandidate.md)[]

#### Returns

[`ContextScoredCandidate`](ContextScoredCandidate.md)[]

***

### signalAt()

> **signalAt**(`start`, `end`, `type?`): [`ContextSignal`](ContextSignal.md) \| `undefined`

Defined in: [packages/core/src/context/score.ts:130](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/context/score.ts#L130)

Evidence for the Stage 1 runner's `contextFor` hook.

#### Parameters

##### start

`number`

##### end

`number`

##### type?

[`EntityType`](../type-aliases/EntityType.md)

#### Returns

[`ContextSignal`](ContextSignal.md) \| `undefined`
