/**
 * defaultCalibration.ts — the shipped calibration model, checked rather than cast.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CAST THIS REPLACES
 *
 * `@privacyshield/data` types the fitted model's `perType` as
 * `Record<string, CalibrationCurveData>`, because it is generated from an eval
 * run and the generator has no access to the `EntityType` union. Core's
 * `CalibrationModel` wants `Partial<Record<EntityType, CalibrationCurve>>`.
 *
 * Every consumer so far bridged that with `as unknown as CalibrationModel`.
 * The cast is not merely ugly: it asserts the keys are valid `EntityType`
 * members without checking, so a model fitted before a type was renamed would
 * carry a key that matches nothing. `calibrate()` would then fall through to
 * the pooled curve for that type, forever, with no error and no warning — the
 * numbers would just be quietly worse than the published ones.
 *
 * Converting with a check turns that into something observable.
 */

import { ALL_ENTITY_TYPES } from '../entityTypes.js';
import type { EntityType } from '../types.js';
import type { CalibrationCurve, CalibrationModel } from './calibrate.js';

/**
 * The generated shape, restated so this module does not depend on data's types.
 *
 * Exported because it is `toCalibrationModel`'s parameter type: a consumer who
 * fits their own model needs to name what the function accepts. It was local
 * when this file was written, and `public-api.test.ts` caught it on its first
 * run - which is the whole reason that test exists.
 */
export interface GeneratedCalibrationModel {
  readonly perType: Readonly<Record<string, CalibrationCurve>>;
  readonly pooled: CalibrationCurve;
  readonly fittedOn: string;
}

export interface CalibrationConversion {
  readonly model: CalibrationModel;
  /**
   * Keys in the generated model that are not `EntityType` members.
   *
   * Non-empty means the committed model and the union have drifted apart. The
   * conversion still succeeds — dropping an unusable curve is better than
   * refusing to calibrate anything — but the caller can now see it, and
   * `calibration-model.test.ts` asserts it is empty.
   */
  readonly unknownTypes: readonly string[];
}

/**
 * Convert a generated calibration model to core's typed one, reporting any key
 * that is not a known entity type instead of assuming there are none.
 */
export function toCalibrationModel(generated: GeneratedCalibrationModel): CalibrationConversion {
  const known = new Set<string>(ALL_ENTITY_TYPES);
  const perType: Partial<Record<EntityType, CalibrationCurve>> = {};
  const unknownTypes: string[] = [];

  for (const [key, curve] of Object.entries(generated.perType)) {
    if (known.has(key)) perType[key as EntityType] = curve;
    else unknownTypes.push(key);
  }

  return {
    model: { perType, pooled: generated.pooled, fittedOn: generated.fittedOn },
    unknownTypes,
  };
}
