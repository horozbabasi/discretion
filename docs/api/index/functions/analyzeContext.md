[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / analyzeContext

# Function: analyzeContext()

> **analyzeContext**(`text`, `options?`): [`ContextAnalysis`](../interfaces/ContextAnalysis.md)

Defined in: [packages/core/src/context/score.ts:203](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/score.ts#L203)

Analyse a document once, then score any number of candidate sets against it.

The document-level work (structure index, format and domain profile,
trigger compilation) is the expensive part and is shared, which is what lets
Stage 1's inline `contextFor` hook and the Stage 3 post-pass draw on exactly
the same evidence rather than two divergent implementations.

## Parameters

### text

`string`

### options?

[`ContextOptions`](../interfaces/ContextOptions.md) = `{}`

## Returns

[`ContextAnalysis`](../interfaces/ContextAnalysis.md)
