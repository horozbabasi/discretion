[**@privacyshield/core**](../../README.md)

***

[@privacyshield/core](../../README.md) / [index](../README.md) / CONFIDENCE

# Variable: CONFIDENCE

> `const` **CONFIDENCE**: `object`

Defined in: [packages/core/src/detect/types.ts:39](https://github.com/horozbabasi/privacyshield/blob/b5e097aedd021fca70f7b2cc252a9eff1043721e/packages/core/src/detect/types.ts#L39)

Named confidence levels shared by every detector.

These are RAW, detector-local scores, not calibrated probabilities. Stage 4
calibrates them against the eval corpus so that 0.8 empirically means ~80%
precision; until then they are only meaningfully ordered, not absolute.
Detectors use these constants rather than bare numbers so that recalibrating
the scale is one edit here instead of a sweep across 145 files.

## Type Declaration

### HIGH

> `readonly` **HIGH**: `0.85` = `0.85`

A real checksum or structural validator passed. The normal ceiling.

### LOW

> `readonly` **LOW**: `0.3` = `0.3`

A pattern matched but nothing corroborates it. The ceiling for an
 unvalidated match, and for anything awaiting a Stage 3 context signal.

### MAXIMUM

> `readonly` **MAXIMUM**: `0.99` = `0.99`

Reserved for formats that are self-verifying to the point that a false
 positive is implausible — SPEC.md names a valid passport MRZ, "every
 field is checksummed; treat a valid MRZ as maximum confidence".

### MEDIUM

> `readonly` **MEDIUM**: `0.6` = `0.6`

A structural check passed, but the format is weak enough that false
 positives are expected (short identifiers, no checksum).
