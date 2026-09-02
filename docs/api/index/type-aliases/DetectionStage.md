[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / DetectionStage

# Type Alias: DetectionStage

> **DetectionStage** = `"stage0-normalization"` \| `"stage1-validated-identifier"` \| `"stage2-ner"` \| `"stage2b-gazetteer"` \| `"stage2c-verification"` \| `"stage3-context"` \| `"stage4-fusion"`

Defined in: [packages/core/src/types.ts:93](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/types.ts#L93)

Which pipeline stage produced a candidate, or contributed to an entity.
One member per stage of SPEC.md's core detection pipeline.
