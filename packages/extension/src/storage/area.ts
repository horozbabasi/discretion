/**
 * The one place the extension touches `chrome.storage`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT MAY BE WRITTEN HERE, AND WHAT MAY NEVER BE
 *
 * SPEC.md's third non-negotiable: "Originals live in memory only, per-tab
 * session, cleared on nav-away/close. Never storage.local / localStorage /
 * IndexedDB."
 *
 * That rule is about DETECTED VALUES — text lifted out of a message the user
 * was writing. Two things SPEC itself requires do live here, and neither is
 * that:
 *
 *   - SETTINGS, which the Options page exists to persist, and which are
 *     useless if they do not survive a restart.
 *   - LOCAL INSIGHTS, which SPEC defines as "counts only ... satisfying the
 *     no-plaintext-persistence rule by construction".
 *
 * One caveat is recorded rather than hidden: the allowlist and denylist are
 * user-typed strings, and a user may well type their own email address into
 * "never mask these". That is persisted plaintext they chose to persist, on
 * their own device, in their own profile — which is a different thing from the
 * extension quietly retaining what it detected. The Options page says so where
 * they type it, and D54 records it.
 *
 * Nothing else goes to disk. In particular, never the vault, never a
 * composer's contents, never a per-site activity trail (PERMISSIONS.md refuses
 * that as browsing-history exposure).
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * The slice of `chrome.storage.StorageArea` anything here needs.
 *
 * An interface rather than a direct call so the stores are testable without a
 * browser, and so the whole storage surface of the extension is four method
 * signatures a reviewer can read at once.
 */
export interface StorageArea {
  get(keys: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/**
 * `chrome.storage.local`, or a memory stub outside an extension context.
 *
 * The stub is not a convenience for tests — tests pass their own area. It is
 * what keeps the popup and options pages from throwing when opened as plain
 * files during development, where the alternative is an unhandled rejection
 * and a blank page.
 */
export function defaultArea(): StorageArea {
  try {
    const area = chrome.storage.local;
    // Reading the property is not enough; MV3 exposes `chrome` in contexts
    // where `storage` is absent because the permission was not granted.
    if (typeof area.get === 'function') return area as unknown as StorageArea;
  } catch {
    // Not an extension context.
  }
  return memoryArea();
}

/** An in-memory StorageArea. Used by tests, and as the no-browser fallback. */
export function memoryArea(seed: Record<string, unknown> = {}): StorageArea {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    get(keys) {
      const wanted =
        keys === null ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of wanted) {
        if (store.has(key)) out[key] = store.get(key);
      }
      return Promise.resolve(out);
    },
    set(items) {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
      return Promise.resolve();
    },
    remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
      return Promise.resolve();
    },
  };
}
