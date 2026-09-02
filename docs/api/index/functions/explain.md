[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / explain

# Function: explain()

> **explain**(`input`): [`EntityExplanation`](../interfaces/EntityExplanation.md)

Defined in: [packages/core/src/fuse/explain.ts:46](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/fuse/explain.ts#L46)

Build the explanation for one entity.

`triggers` carries the Stage 3 signal names rather than only lexicon
matches, because "why was this reported" is answered as much by
`structure:key-names-API_KEY` as by a trigger word — and a reviewer chasing
a false positive needs the negative signals too, which is why suppression
and penalty signals appear with their sign rather than being filtered out.

## Parameters

### input

[`FusionInput`](../interfaces/FusionInput.md)

## Returns

[`EntityExplanation`](../interfaces/EntityExplanation.md)
