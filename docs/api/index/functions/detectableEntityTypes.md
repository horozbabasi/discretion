[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / detectableEntityTypes

# Function: detectableEntityTypes()

> **detectableEntityTypes**(): readonly [`EntityType`](../type-aliases/EntityType.md)[]

Defined in: [packages/core/src/entityTypes.ts:102](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/entityTypes.ts#L102)

The types anything can actually produce: those with at least one registered
Stage 1 detector, plus those Stage 2 emits.

RECOMPUTED ON EVERY CALL, and deliberately not memoised. The first version
cached the answer on the reasoning that the registry only grows. It does
only grow — but `registerDetector` is public API, so a consumer who adds a
detector for their own identifier format and then asks which types are
detectable would have been told the answer from before their own call. A
cache that is only correct until someone uses another part of the API is
worse than no cache.

The work is a scan of the registry per type: 35 types against ~113
detectors, no allocation beyond the result. That is not worth a correctness
hazard.

Reading the registry at call time is also what makes the answer safe at any
point in the import cycle: detectors register as a side effect of importing
the package, and a module-level constant here would have been evaluated
during that same import, possibly yielding a confidently empty list.

## Returns

readonly [`EntityType`](../type-aliases/EntityType.md)[]
