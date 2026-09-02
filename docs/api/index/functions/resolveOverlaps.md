[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / resolveOverlaps

# Function: resolveOverlaps()

> **resolveOverlaps**(`items`): [`ResolutionResult`](../interfaces/ResolutionResult.md)

Defined in: [packages/core/src/fuse/resolve.ts:146](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/fuse/resolve.ts#L146)

Resolve a candidate set into a non-overlapping one.

Greedy by the ordering above. Because the widest span is always taken
first, any candidate it contains is dropped only after its characters are
already covered — which is what makes the coverage property hold rather
than merely being hoped for.

Non-sensitive candidates (known test values) never displace a sensitive
one: they are detected so the eval can assert they were seen, and letting
one win an overlap would unmask the value it covers.

## Parameters

### items

readonly [`ScoredForResolution`](../interfaces/ScoredForResolution.md)[]

## Returns

[`ResolutionResult`](../interfaces/ResolutionResult.md)
