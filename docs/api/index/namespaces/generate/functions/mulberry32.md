[**@discretion/core**](../../../../README.md)

***

[@discretion/core](../../../../README.md) / [index](../../../README.md) / [generate](../README.md) / mulberry32

# Function: mulberry32()

> **mulberry32**(`seed`): () => `number`

Defined in: [packages/core/src/generate/prng.ts:9](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/generate/prng.ts#L9)

Deterministic PRNG for the value generators.

mulberry32 — the same generator the fuzz suites use, copied here so the
generators are part of core's public API (the eval corpus builder and
M4's format-preserving surrogates both consume them) without src code
reaching into test code.

## Parameters

### seed

`number`

## Returns

() => `number`
