[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / buildReverseMap

# Function: buildReverseMap()

> **buildReverseMap**(`offsetMap`, `originalLength`): `Int32Array`

Defined in: [packages/core/src/offsetMap.ts:100](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/offsetMap.ts#L100)

Build the reverse map (original index → normalized index) from a forward
map.

  reverseMap[j]              = normalized index of the start of the cluster
                               whose original extent contains j; for a
                               deleted character this is the normalized
                               position where it was removed
  reverseMap[originalLength] = normalizedLength                (sentinel)

"Extent" is the half-open range [offsetMap[i], nextDistinctValue), i.e. it
includes any deleted characters attributed to the cluster. The walk below
precomputes each cluster's extent end (`ends`), then assigns every original
index the FIRST normalized index whose extent reaches past it — which lands
on the first unit of the covering cluster, also for expansions where several
normalized units share one original cluster.

## Parameters

### offsetMap

`Int32Array`

### originalLength

`number`

## Returns

`Int32Array`
