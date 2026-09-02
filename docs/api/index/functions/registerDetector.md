[**@discretion/core**](../../README.md)

***

[@discretion/core](../../README.md) / [index](../README.md) / registerDetector

# Function: registerDetector()

> **registerDetector**(`detector`): `void`

Defined in: [packages/core/src/detect/registry.ts:37](https://github.com/horozbabasi/privacyshield/blob/1ed43083dc5f2fa94a4eff8cba71ae6aeb5df89d/packages/core/src/detect/registry.ts#L37)

Register a detector.

Throws on any contract violation. Failing at load time is deliberate: a
detector that silently fails to register is a silent hole in detection
coverage, which SPEC.md's fail-closed posture does not tolerate.

## Parameters

### detector

[`Detector`](../interfaces/Detector.md)

## Returns

`void`
