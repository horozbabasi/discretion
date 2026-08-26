/**
 * Shannon entropy, for the GENERIC_SECRET detector.
 *
 * SPEC.md requires GENERIC_SECRET to combine "a Shannon entropy threshold
 * AND an assignment-context signal (see Stage 3)". This module is the
 * entropy half; the context half is the Stage 3 hook that keeps the detector
 * capped at low confidence until M7. Kept separate and pure so the threshold
 * can be tuned against the eval corpus in M3 with the entropy computation
 * itself under test.
 */

/**
 * Shannon entropy of a string, in bits per character (0 for empty/one-char).
 *
 * H = −Σ p(c)·log₂ p(c) over the observed character distribution. A value's
 * TOTAL entropy is `shannonEntropy(s) * s.length`; the per-character form is
 * the more stable threshold because it does not grow with length.
 */
export function shannonEntropy(s: string): number {
  if (s.length < 2) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const count of counts.values()) {
    const p = count / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Distinct-character count — a cheap complement to entropy. */
export function distinctChars(s: string): number {
  return new Set(s).size;
}

/**
 * Shapes that clear an entropy bar but are provably NOT secrets. These are
 * suppressed regardless of context, because SPEC.md names them explicitly as
 * things that "do not trigger": UUIDs, git SHAs, base64 image data, and
 * obvious placeholders.
 */
export function isKnownNonSecret(value: string): boolean {
  // UUID (any version).
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)) {
    return true;
  }
  // Git object name: exactly 40 or 64 lowercase hex (SHA-1 / SHA-256).
  if (/^[0-9a-f]{40}$/.test(value) || /^[0-9a-f]{64}$/.test(value)) return true;
  // Placeholder text.
  if (/^(?:x+|X+|\*+|\.+|-+|0+)$/.test(value)) return true;
  if (/your[_-]?(?:api[_-]?)?key/i.test(value)) return true;
  if (/[_-]?here$/i.test(value) || /^(?:changeme|placeholder|redacted|example|sample|dummy|todo)$/i.test(value)) {
    return true;
  }
  // A data: URI or a long run of pure base64 that is almost certainly a blob
  // (image, file) rather than a credential — decided by the caller via
  // length, but the data: scheme is unambiguous.
  if (/^data:/i.test(value)) return true;
  return false;
}
