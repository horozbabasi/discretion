[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / mapNormalizedSpan

# Function: mapNormalizedSpan()

> **mapNormalizedSpan**(`offsetMap`, `start`, `end`): `object`

Defined in: [packages/core/src/offsetMap.ts:144](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/offsetMap.ts#L144)

Map a normalized span [start, end) to the original span it covers.

For spans whose endpooints sit on cluster boundaries this is exactly
[offsetMap[start], offsetMap[end]). When an endpoint lands INSIDE an
expansion (one original cluster → several normalized units — e.g. matching
only the "f" of the "fi" produced by the ligature U+FB01), the span is
widened to cover the WHOLE original cluster: you cannot substitute half a
ligature. Widening is the only sound choice for masking — the alternative,
an empty or truncated original span, would silently leave sensitive
characters behind.

NOTE: two non-overlapping normalized spans that split the same expansion
both widen to the same original cluster, so mapped spans can overlap in
that one case. Substitution must merge overlapping original spans before
splicing (covered by the substitution-safety property test).

## Parameters

### offsetMap

`Int32Array`

### start

`number`

### end

`number`

## Returns

`object`

### end

> **end**: `number`

### start

> **start**: `number`
