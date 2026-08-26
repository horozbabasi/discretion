/**
 * The Stage 1 detector registry.
 *
 * SPEC.md: "Adding a new national identifier must require touching exactly
 * one new file." This module is what makes that literally true. A detector
 * file declares its `Detector` and calls `registerDetector(...)`; the only
 * other edit anywhere is the one-line side-effect import in
 * `detectors/index.ts` that causes the file to be loaded at all.
 *
 * WHY SELF-REGISTRATION RATHER THAN A CENTRAL ARRAY. A central array is a
 * merge-conflict magnet once there are 145 detectors, and it silently permits
 * two detectors to share an id. Registration validates each detector as it
 * arrives and fails loudly on a duplicate id or a malformed pattern, at
 * module-load time, so the problem surfaces in the failing test that imported
 * it rather than as a mysteriously missing detection later.
 */

import type { Detector, RegionCode } from './types.js';
import { GLOBAL_REGION } from './types.js';

/** Every registered detector, keyed by id so duplicates are impossible. */
const registry = new Map<string, Detector>();

/** Detector ids must be lowercase kebab-case: stable, greppable, url-safe. */
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Region codes are ISO 3166-1 alpha-2, or the GLOBAL sentinel. */
const REGION_PATTERN = /^[A-Z]{2}$/;

/**
 * Register a detector.
 *
 * Throws on any contract violation. Failing at load time is deliberate: a
 * detector that silently fails to register is a silent hole in detection
 * coverage, which SPEC.md's fail-closed posture does not tolerate.
 */
export function registerDetector(detector: Detector): void {
  assertValidDetector(detector);
  if (registry.has(detector.id)) {
    throw new Error(
      `Duplicate detector id "${detector.id}". Ids must be unique across the whole registry.`,
    );
  }
  registry.set(detector.id, detector);
}

/** Every registered detector, in registration order. */
export function allDetectors(): readonly Detector[] {
  return [...registry.values()];
}

/** Look one up by id, or `undefined`. */
export function getDetector(id: string): Detector | undefined {
  return registry.get(id);
}

/**
 * Detectors applicable to a region.
 *
 * Always includes `GLOBAL` detectors. Passing `undefined` returns everything,
 * which is the default scanning posture: a user pasting a foreign colleague's
 * national ID should still have it detected.
 */
export function detectorsForRegion(region?: RegionCode): readonly Detector[] {
  if (region === undefined) return allDetectors();
  return allDetectors().filter(
    (d) => d.regions.includes(GLOBAL_REGION) || d.regions.includes(region),
  );
}

/** Detectors emitting a given entity type. */
export function detectorsForEntityType(entityType: Detector['entityType']): readonly Detector[] {
  return allDetectors().filter((d) => d.entityType === entityType);
}

/** How many detectors are registered. Used by the coverage test. */
export function detectorCount(): number {
  return registry.size;
}

/**
 * Remove every registration.
 *
 * Exists ONLY for tests that need an isolated registry. Production code never
 * calls this — the registry is populated once, at module load, and is
 * effectively immutable thereafter.
 */
export function resetRegistryForTesting(): void {
  registry.clear();
}

/**
 * Validate a detector's declared contract.
 *
 * Every check here corresponds to a mistake that would otherwise produce a
 * subtly wrong detection rather than an obvious crash.
 */
function assertValidDetector(d: Detector): void {
  if (!ID_PATTERN.test(d.id)) {
    throw new Error(`Detector id "${d.id}" must be lowercase kebab-case.`);
  }

  if (d.regions.length === 0) {
    throw new Error(`Detector "${d.id}" declares no regions; use [GLOBAL_REGION] if universal.`);
  }
  for (const region of d.regions) {
    if (region !== GLOBAL_REGION && !REGION_PATTERN.test(region)) {
      throw new Error(
        `Detector "${d.id}" declares region "${region}"; expected an ISO 3166-1 alpha-2 code or "${GLOBAL_REGION}".`,
      );
    }
  }

  // A non-global pattern silently resumes from a stale lastIndex on its second
  // use, which shows up as "the detector works in isolation but misses matches
  // in a full scan" — precisely the bug class worth making impossible.
  if (!d.pattern.global) {
    throw new Error(`Detector "${d.id}" pattern must carry the /g flag.`);
  }

  if (!(d.baseConfidence > 0 && d.baseConfidence <= 1)) {
    throw new Error(
      `Detector "${d.id}" baseConfidence must be in (0, 1]; got ${String(d.baseConfidence)}.`,
    );
  }

  if (typeof d.validate !== 'function') {
    throw new Error(`Detector "${d.id}" must supply a validate() function.`);
  }

  if (d.description.trim().length === 0) {
    throw new Error(`Detector "${d.id}" must supply a non-empty description.`);
  }
}
