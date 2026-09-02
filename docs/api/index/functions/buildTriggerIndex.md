[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / buildTriggerIndex

# Function: buildTriggerIndex()

> **buildTriggerIndex**(`lexicons`): [`TriggerIndex`](../interfaces/TriggerIndex.md)

Defined in: [packages/core/src/context/triggers.ts:118](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/context/triggers.ts#L118)

Compile per-language lexicons into one index.

All languages are matched at once rather than gated on a detected document
language. That is deliberate: real messages mix languages (an English
sentence quoting a German form label), language detection on a short chat
message is unreliable, and a missed trigger costs recall on a privacy tool.
The cost is that a term which is a common word in another language can
mis-fire, which is why `near` reports what matched — Stage 3 weighs it,
and the explanation records it.

## Parameters

### lexicons

readonly [`LanguageTriggers`](../interfaces/LanguageTriggers.md)[]

## Returns

[`TriggerIndex`](../interfaces/TriggerIndex.md)
