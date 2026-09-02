[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / DetectionStage

# Type Alias: DetectionStage

> **DetectionStage** = `"stage0-normalization"` \| `"stage1-validated-identifier"` \| `"stage2-ner"` \| `"stage2b-gazetteer"` \| `"stage2c-verification"` \| `"stage3-context"` \| `"stage4-fusion"`

Defined in: [packages/core/src/types.ts:93](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/types.ts#L93)

Which pipeline stage produced a candidate, or contributed to an entity.
One member per stage of SPEC.md's core detection pipeline.
