/**
 * Local Insights: a values-free history of what has been masked.
 *
 * SPEC.md: "A local, values-free history: counts of masked entities by
 * category over time (e.g. 'this month: 12 secrets, 8 financial'). Never
 * values, never text — counts only, satisfying the no-plaintext-persistence
 * rule by construction. User-resettable." Its stated purpose is to make
 * ongoing protection visible instead of silent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT RECORDED
 *
 * This is the only part of the extension that writes a history to disk, so
 * what it leaves out matters as much as what it keeps:
 *
 *   - NO VALUES and no text. Counts are integers; nothing else is stored.
 *   - NO TYPE, only FAMILY. "3 identity" rather than "3 US_NPI" — SPEC asks
 *     for categories, and the narrower label is the one that hints at a
 *     profession or a medical situation. The coarser record answers the
 *     question the feature exists to answer and says less.
 *   - NO SITE. A per-site count is a browsing trail, which PERMISSIONS.md
 *     refuses on exactly these grounds. Where you were is not part of what
 *     you protected.
 *   - NO FINER TIME THAN A MONTH. A timestamped event log would reconstruct
 *     working hours and activity patterns from counts alone. A month is the coarsest
 *     bucket that still satisfies "over time".
 *
 * Retention is capped so the file cannot grow without bound, and `reset()`
 * removes the key outright rather than writing zeroes over it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EntityFamily, EntityType } from '@discretion/core';
import { familyOf } from '@discretion/core';

import type { StorageArea } from './area.js';
import { defaultArea } from './area.js';

const KEY = 'insights';

/**
 * Months kept. Two years is long enough for "over time" to mean something and
 * short enough that the record does not follow someone indefinitely.
 */
const RETAINED_MONTHS = 24;

/** Guards against a corrupt or hostile store inflating a display. */
const MAX_COUNT = 1e9;

/** Counts for one month, by family. Families with no count are absent. */
export type MonthCounts = Partial<Record<EntityFamily, number>>;

/** The stored shape: month key (`YYYY-MM`) to counts. */
export type Insights = Record<string, MonthCounts>;

export interface InsightsView {
  readonly thisMonth: MonthCounts;
  readonly allTime: MonthCounts;
  readonly monthKey: string;
  /** True when nothing has ever been masked, so the UI can say so plainly. */
  readonly empty: boolean;
}

/** `YYYY-MM` in local time — the user's own calendar, not UTC's. */
export function monthKeyOf(at: Date): string {
  const year = at.getFullYear();
  const month = `${String(at.getMonth() + 1)}`.padStart(2, '0');
  return `${String(year)}-${month}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A count is a finite non-negative integer within the cap, or it is not a count. */
function parseCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  if (rounded <= 0 || rounded > MAX_COUNT) return null;
  return rounded;
}

/**
 * Parses the stored history, discarding anything unrecognisable.
 *
 * Same reasoning as `parseSettings`: this comes back from storage as `any`,
 * and a malformed entry must produce a smaller history rather than a broken
 * popup. A bad month key or a negative count is dropped silently — there is no
 * user action that would follow from reporting it.
 */
export function parseInsights(raw: unknown): Insights {
  if (!isRecord(raw)) return {};
  const out: Insights = {};
  for (const [monthKey, counts] of Object.entries(raw)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(monthKey)) continue;
    if (!isRecord(counts)) continue;
    const month: MonthCounts = {};
    for (const [family, value] of Object.entries(counts)) {
      const count = parseCount(value);
      if (count === null) continue;
      month[family as EntityFamily] = count;
    }
    if (Object.keys(month).length > 0) out[monthKey] = month;
  }
  return out;
}

/** Drops months beyond the retention window, oldest first. */
function prune(insights: Insights): Insights {
  const keys = Object.keys(insights).sort();
  if (keys.length <= RETAINED_MONTHS) return insights;
  const kept = keys.slice(keys.length - RETAINED_MONTHS);
  const out: Insights = {};
  for (const key of kept) {
    const month = insights[key];
    if (month !== undefined) out[key] = month;
  }
  return out;
}

function addInto(target: MonthCounts, family: EntityFamily, count: number): void {
  target[family] = Math.min((target[family] ?? 0) + count, MAX_COUNT);
}

export async function loadInsights(area: StorageArea = defaultArea()): Promise<Insights> {
  try {
    const stored = await area.get(KEY);
    return parseInsights(stored[KEY]);
  } catch {
    // An unreadable history is an empty one. Nothing downstream depends on it.
    return {};
  }
}

/**
 * Adds one masking run to the history.
 *
 * Takes the TYPES that were masked and reduces them to family counts here, so
 * no caller has to remember that the narrower label must not be stored.
 * Records nothing when nothing was masked, which keeps a month absent rather
 * than present-and-zero.
 */
export async function recordMasked(
  types: readonly EntityType[],
  area: StorageArea = defaultArea(),
  now: Date = new Date(),
): Promise<Insights> {
  if (types.length === 0) return loadInsights(area);
  const insights = await loadInsights(area);
  const monthKey = monthKeyOf(now);
  const month: MonthCounts = { ...insights[monthKey] };
  for (const type of types) addInto(month, familyOf(type), 1);
  const next = prune({ ...insights, [monthKey]: month });
  try {
    await area.set({ [KEY]: next });
  } catch {
    // Storage full or denied. Losing a count is not worth failing a send over;
    // this runs after the message has already been protected.
  }
  return next;
}

/** The two totals the popup shows, and whether there is anything to show. */
export function viewOf(insights: Insights, now: Date = new Date()): InsightsView {
  const monthKey = monthKeyOf(now);
  const allTime: MonthCounts = {};
  for (const counts of Object.values(insights)) {
    for (const [family, count] of Object.entries(counts)) {
      addInto(allTime, family as EntityFamily, count ?? 0);
    }
  }
  return {
    thisMonth: { ...insights[monthKey] },
    allTime,
    monthKey,
    empty: Object.keys(allTime).length === 0,
  };
}

/**
 * Removes the history.
 *
 * `remove` rather than writing `{}`: the point of a user-facing reset is that
 * the record is gone, and an empty object left behind is still a record that
 * the extension was used.
 */
export async function resetInsights(area: StorageArea = defaultArea()): Promise<void> {
  try {
    await area.remove(KEY);
  } catch {
    // Nothing useful to do, and nothing depends on the outcome.
  }
}
