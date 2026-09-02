[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / composeMaps

# Function: composeMaps()

> **composeMaps**(`outer`, `inner`): `Int32Array`

Defined in: [packages/core/src/offsetMap.ts:68](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/offsetMap.ts#L68)

Compose two offset maps.

  outer: maps indices of text B to indices of text A  (length |B| + 1)
  inner: maps indices of text C to indices of text B  (length |C| + 1)
  result: maps indices of text C to indices of text A (length |C| + 1)

Because inner[|C|] = |B| and outer[|B|] = |A|, the sentinel composes for
free, and the composition of monotone maps is monotone — both facts are
covered by tests.

## Parameters

### outer

`Int32Array`

### inner

`Int32Array`

## Returns

`Int32Array`
