[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / ContextSignal

# Interface: ContextSignal

Defined in: [packages/core/src/detect/types.ts:91](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L91)

Evidence from a candidate's surroundings.

Stage 3 does not exist yet (it arrives in M7), so this is always `undefined`
during M2. It is defined now, and threaded through `ValidationContext`, so
that detectors which SPEC.md says "require context boost" —
GENERIC_SECRET, POSTAL_CODE, STREET_ADDRESS — can be written once with
their context branch in place, rather than being rewritten when Stage 3
lands.

SPEC.md on GENERIC_SECRET: "Require a Shannon entropy threshold AND an
assignment-context signal (see Stage 3)". The entropy half is implemented
in M2; `assignment` below is the half that stays dormant.

## Properties

### assignment?

> `readonly` `optional` **assignment?**: `boolean`

Defined in: [packages/core/src/detect/types.ts:96](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L96)

The candidate sits on the value side of an assignment or key-value pair
 (`api_key = …`, a JSON key, a .env line, a CSV column header).

***

### documentType?

> `readonly` `optional` **documentType?**: `string`

Defined in: [packages/core/src/detect/types.ts:103](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L103)

Detected document type, which shifts weights (code raises secret
 sensitivity and lowers person-name sensitivity).

***

### negative?

> `readonly` `optional` **negative?**: `boolean`

Defined in: [packages/core/src/detect/types.ts:100](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L100)

Negative evidence: documentation example, test fixture, lorem ipsum,
 a UUID in a log line. Actively suppresses rather than merely failing to
 boost.

***

### trigger?

> `readonly` `optional` **trigger?**: `string`

Defined in: [packages/core/src/detect/types.ts:93](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/types.ts#L93)

A nearby label matched a trigger lexicon entry ("SSN:", "IBAN", "kimlik").
