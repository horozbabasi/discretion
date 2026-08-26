/**
 * GENERIC_SECRET — high-entropy strings.
 *
 * SPEC.md is emphatic and specific: "Require a Shannon entropy threshold AND
 * an assignment-context signal (see Stage 3) so that 'your-api-key-here',
 * 'xxxxxxxxxxxx', UUIDs, git SHAs, and base64 image data do not trigger."
 *
 * Stage 3 does not exist in M2. So this detector is built in its FINAL shape
 * but declares `requiresContext: true`, which the runner honours by capping
 * it at CONFIDENCE.LOW until a context signal is supplied. It therefore
 * never "fires on entropy alone" — the structural guarantee SPEC.md wants.
 * The entropy computation and the known-non-secret suppressions are fully
 * implemented and tested now; only the confidence ceiling is deferred.
 *
 * The threshold below is provisional. SPEC.md requires it be "tuned
 * empirically against the eval corpus" with the precision/recall curve
 * documented — that is M3 work. Until then it is deliberately conservative
 * (high), because at LOW confidence a miss is cheap and a false positive is
 * the thing SPEC.md warns hardest against.
 */

import { registerDetector } from '../../registry.js';
import { CONFIDENCE, GLOBAL_REGION, invalid, valid } from '../../types.js';
import type { ValidationContext, ValidationResult } from '../../types.js';
import { shannonEntropy, distinctChars, isKnownNonSecret } from '../../entropy.js';

/**
 * Provisional per-character entropy floor, in bits. A random base62 string
 * approaches log2(62) ≈ 5.95; english prose sits near 3–4. 3.5 admits
 * plausible keys while excluding words. Retuned against the corpus in M3.
 */
const ENTROPY_FLOOR = 3.5;

/** A secret needs both length and character diversity, not just one. */
const MIN_LENGTH = 20;
const MIN_DISTINCT = 12;

function validateGenericSecret(ctx: ValidationContext): ValidationResult {
  const value = ctx.match[0];

  if (value.length < MIN_LENGTH) return invalid('too short');
  if (isKnownNonSecret(value)) return invalid('known non-secret shape');
  if (distinctChars(value) < MIN_DISTINCT) return invalid('too few distinct characters');

  const entropy = shannonEntropy(value);
  if (entropy < ENTROPY_FLOOR) return invalid('entropy below threshold');

  // A run of a single character class that is all letters is far more likely
  // an identifier or a word-ish token than a key; require mixed classes.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(value)).length;
  if (classes < 2) return invalid('single character class');

  // Return the natural confidence (baseConfidence, MEDIUM) and let the runner
  // apply the requiresContext cap: no Stage 3 signal → capped at LOW, a signal
  // present → allowed up to base. Hardcoding LOW here would defeat the cap by
  // pinning it even when context arrives, which the test below pins.
  return valid({
    // No canonicalization: a secret is matched verbatim.
    metadata: {
      entropyBitsPerChar: Number(entropy.toFixed(3)),
      distinct: distinctChars(value),
      // Flags for Stage 3 fusion to combine with an assignment signal.
      awaitingContext: true,
    },
    validator: 'shannon-entropy',
  });
}

registerDetector({
  id: 'generic-secret',
  entityType: 'GENERIC_SECRET',
  regions: [GLOBAL_REGION],
  // Long token-shaped runs: letters, digits, and the punctuation common in
  // keys. Deliberately broad; the validator and the context requirement do
  // the discriminating.
  pattern: /\b[A-Za-z0-9+/_=-]{20,120}\b/g,
  baseConfidence: CONFIDENCE.MEDIUM,
  requiresContext: true,
  description: 'High-entropy secrets: entropy gate now, Stage 3 assignment context required for confidence.',
  validate: validateGenericSecret,
});
