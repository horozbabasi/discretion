[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / Stage1Options

# Interface: Stage1Options

Defined in: [packages/core/src/detect/runner.ts:54](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/runner.ts#L54)

## Properties

### budgetMs?

> `readonly` `optional` **budgetMs?**: `number`

Defined in: [packages/core/src/detect/runner.ts:67](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/runner.ts#L67)

Wall-clock budget in milliseconds. Exceeding it throws.

***

### contextFor?

> `readonly` `optional` **contextFor?**: (`start`, `end`) => [`ContextSignal`](ContextSignal.md) \| `undefined`

Defined in: [packages/core/src/detect/runner.ts:69](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/runner.ts#L69)

Stage 3 evidence, per candidate span. Absent until M7.

#### Parameters

##### start

`number`

##### end

`number`

#### Returns

[`ContextSignal`](ContextSignal.md) \| `undefined`

***

### defaultRegion?

> `readonly` `optional` **defaultRegion?**: `string`

Defined in: [packages/core/src/detect/runner.ts:63](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/runner.ts#L63)

The user's default region, passed to validators for ambiguous formats
 such as phone numbers.

***

### detectors?

> `readonly` `optional` **detectors?**: readonly [`Detector`](Detector.md)[]

Defined in: [packages/core/src/detect/runner.ts:65](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/runner.ts#L65)

Explicit detector set, overriding the registry. For focused tests.

***

### region?

> `readonly` `optional` **region?**: `string`

Defined in: [packages/core/src/detect/runner.ts:60](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/runner.ts#L60)

Restrict to detectors applicable to this region, plus all GLOBAL ones.
Omit to run every detector, which is the right default — a user pasting a
foreign colleague's identifier still deserves protection.
