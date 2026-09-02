[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / Detector

# Interface: Detector

Defined in: [packages/core/src/detect/types.ts:201](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L201)

## Properties

### baseConfidence

> `readonly` **baseConfidence**: `number`

Defined in: [packages/core/src/detect/types.ts:231](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L231)

Confidence when the validator passes and no per-match confidence is
returned. The runner clamps this to `CONFIDENCE.LOW` when
`requiresContext` is set and no context signal is present.

***

### description

> `readonly` **description**: `string`

Defined in: [packages/core/src/detect/types.ts:256](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L256)

Human-readable description, shown in the options UI's per-entity toggles
and in eval reports.

***

### entityType

> `readonly` **entityType**: [`EntityType`](../type-aliases/EntityType.md)

Defined in: [packages/core/src/detect/types.ts:211](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L211)

The entity type emitted. For national schemes this is the FAMILY
 (`NATIONAL_ID`), with the concrete scheme carried in metadata.

***

### id

> `readonly` **id**: `string`

Defined in: [packages/core/src/detect/types.ts:207](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L207)

Stable, unique, kebab-case identifier — `"national-id-tr-tckn"`,
`"credit-card"`, `"iban"`. Appears in `Candidate.detectorId`, in eval
error analysis, and in regression-gate config, so it must not churn.

***

### pattern

> `readonly` **pattern**: `RegExp`

Defined in: [packages/core/src/detect/types.ts:224](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L224)

The candidate generator. Must carry the `g` flag; the runner never
mutates it, cloning per scan so a shared `lastIndex` cannot leak state
between calls — a notorious source of intermittent misses with `/g`
regexes held at module scope.

Patterns should over-generate. Precision is the validator's job.

***

### regions

> `readonly` **regions**: readonly `string`[]

Defined in: [packages/core/src/detect/types.ts:214](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L214)

Jurisdictions this detector applies to, or `[GLOBAL_REGION]`.

***

### requiresContext?

> `readonly` `optional` **requiresContext?**: `boolean`

Defined in: [packages/core/src/detect/types.ts:250](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L250)

This detector cannot reach its base confidence without Stage 3 evidence.

SPEC.md marks GENERIC_SECRET, POSTAL_CODE and STREET_ADDRESS this way.
Until Stage 3 exists the runner caps them at `CONFIDENCE.LOW`, which is
what keeps GENERIC_SECRET from "firing on entropy alone".

## Methods

### validate()

> **validate**(`ctx`): [`ValidationResult`](../type-aliases/ValidationResult.md)

Defined in: [packages/core/src/detect/types.ts:241](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L241)

Decide whether a match is genuinely an instance of `entityType`.

Detectors with a real checksum return failure for a wrong checksum, and
the candidate is dropped — a mistyped SSN is not a low-confidence SSN, it
is not an SSN. Detectors for formats with no checksum (drivers' licences,
postal codes) return success at a low confidence instead.

#### Parameters

##### ctx

[`ValidationContext`](ValidationContext.md)

#### Returns

[`ValidationResult`](../type-aliases/ValidationResult.md)
