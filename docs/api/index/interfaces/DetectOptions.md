[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / DetectOptions

# Interface: DetectOptions

Defined in: [packages/core/src/pipeline.ts:29](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L29)

## Properties

### context?

> `readonly` `optional` **context?**: [`ContextOptions`](ContextOptions.md)

Defined in: [packages/core/src/pipeline.ts:38](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L38)

Stage 3 configuration. Defaults to the bundled trigger lexicons.

***

### ner?

> `readonly` `optional` **ner?**: [`NerRecognizer`](NerRecognizer.md)

Defined in: [packages/core/src/pipeline.ts:36](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L36)

Stage 2 engine. Omit to run without named-entity recognition — the
playground and the Stage-1 eval baseline both do.

***

### stage1?

> `readonly` `optional` **stage1?**: `Omit`\<[`Stage1Options`](Stage1Options.md), `"contextFor"`\>

Defined in: [packages/core/src/pipeline.ts:31](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/pipeline.ts#L31)

Stage 1 configuration. The context hook is supplied automatically.
