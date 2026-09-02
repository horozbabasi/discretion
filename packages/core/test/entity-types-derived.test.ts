/**
 * entity-types-derived.test.ts — proving `detectableEntityTypes()` is derived.
 *
 * A list that happens to hold the right 34 values today is indistinguishable
 * from a hardcoded list that happens to hold the right 34 values today. The
 * difference only shows when the registry changes, so that is what this file
 * does: it registers a detector for the one type nothing can currently
 * produce, and asserts the answer changes on its own.
 *
 * IN ITS OWN FILE ON PURPOSE. Registering a detector mutates a module-level
 * registry, and vitest gives each test file its own module instance. Doing
 * this inside `protect.test.ts` would leave a fake `DATE_OF_BIRTH` detector in
 * place for that file's other assertions — including the one that pins the
 * count at 34.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_ENTITY_TYPES,
  CONFIDENCE,
  GLOBAL_REGION,
  detectableEntityTypes,
  detectorsForEntityType,
  registerDetector,
  valid,
} from '../src/index.js';

describe('detectableEntityTypes() reflects the registry', () => {
  it('excludes DATE_OF_BIRTH, and the registry agrees why', () => {
    // The reason, not just the outcome: it is absent BECAUSE nothing produces
    // it, which is the fact the derivation depends on.
    expect(detectorsForEntityType('DATE_OF_BIRTH')).toHaveLength(0);
    expect(detectableEntityTypes()).not.toContain('DATE_OF_BIRTH');
  });

  it('includes a type as soon as a detector for it is registered', () => {
    registerDetector({
      id: 'test-only-dob',
      entityType: 'DATE_OF_BIRTH',
      regions: [GLOBAL_REGION],
      pattern: /\b\d{4}-\d{2}-\d{2}\b/gu,
      baseConfidence: CONFIDENCE.LOW,
      description: 'Test-only detector, registered to prove the list is derived.',
      validate: () => valid({ confidence: CONFIDENCE.LOW }),
    });

    // If this list were the hand-written constant it replaced, this would
    // still say 34 and still omit DATE_OF_BIRTH.
    expect(detectorsForEntityType('DATE_OF_BIRTH')).toHaveLength(1);
    expect(detectableEntityTypes()).toContain('DATE_OF_BIRTH');
    expect(detectableEntityTypes()).toHaveLength(ALL_ENTITY_TYPES.length);
  });
});
