/**
 * Persisted settings, and the parser that refuses to trust them.
 *
 * SPEC.md, Options: "per-entity toggles, sensitivity profile, surrogate vs
 * token mode, allowlist, denylist, custom regex rules with live tester,
 * default phone region, settings export/import". Popup: "per-site toggle ...
 * sensitivity profile switcher".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY EVERYTHING READ BACK IS PARSED RATHER THAN CAST
 *
 * `chrome.storage.local` returns `any`. What comes back was written by an
 * older version of this extension, or by a settings import the user was handed
 * in a forum post, or by nothing at all. A cast would let
 * `{ profile: "strict " }` or `{ perSite: null }` through into the code
 * that decides whether a send is inspected.
 *
 * So every field is parsed: unknown values are DISCARDED and the default
 * takes their place. The defaults are the protective position — detection on,
 * every site on, balanced profile — so a corrupt store degrades to protecting
 * more, never less. That is the same fail-closed rule the send gate follows,
 * applied to configuration.
 *
 * `enabledFor()` is the one function the content script asks, and it answers
 * TRUE unless storage explicitly and validly says otherwise. A read that
 * throws, a missing key, a malformed record: all of them protect the site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { EntityType, ProfileName, SubstitutionMode } from '@discretion/core';

import type { StorageArea } from './area.js';
import { defaultArea } from './area.js';

const KEY = 'settings';

/**
 * SPEC's three sensitivity profiles, as a stored NAME.
 *
 * Derived from core's `ProfileName` rather than restated, so the switcher
 * cannot drift from the profiles that exist. `custom` is excluded because it
 * is not something the popup offers - it is what per-entity toggles produce.
 */
export type Profile = Exclude<ProfileName, 'custom'>;

const PROFILE_NAMES: readonly Profile[] = ['minimal', 'balanced', 'strict'];
const MODES: readonly SubstitutionMode[] = ['surrogate', 'token'];

/** A user-authored detector. Compiled and length-capped before it is stored. */
export interface CustomRule {
  readonly id: string;
  readonly label: string;
  readonly pattern: string;
  readonly enabled: boolean;
}

/**
 * The longest pattern accepted.
 *
 * Not a defence against catastrophic backtracking — no length limit is — but a
 * bound on how much of one a single rule can express, and a cheap way to
 * reject a paste that was never meant to be a regex. The execution-time budget
 * that actually contains a runaway rule belongs with the detector that runs
 * it, and does not exist yet: custom rules are STORED here and not yet
 * executed anywhere (D54).
 */
const MAX_PATTERN_LENGTH = 512;

/** The longest allow/deny entry accepted, to bound a pasted document. */
const MAX_LIST_ENTRY_LENGTH = 256;
const MAX_LIST_ENTRIES = 500;

export interface Settings {
  readonly profile: Profile;
  readonly mode: SubstitutionMode;
  /** Types the user switched OFF. Absent means on: a new type is on by default. */
  readonly disabledTypes: readonly EntityType[];
  /** Site ids the user switched OFF. Absent means on, which is protective. */
  readonly disabledSites: readonly string[];
  readonly allowlist: readonly string[];
  readonly denylist: readonly string[];
  readonly customRules: readonly CustomRule[];
  /** CLDR region for parsing bare national phone numbers, e.g. 'TR'. */
  readonly phoneRegion: string;
}

/**
 * The protective position, and the value returned whenever storage cannot be
 * believed. Every list is empty, so nothing is excluded from detection.
 */
export const DEFAULT_SETTINGS: Settings = {
  profile: 'balanced',
  mode: 'surrogate',
  disabledTypes: [],
  disabledSites: [],
  allowlist: [],
  denylist: [],
  customRules: [],
  phoneRegion: 'US',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Strings only, trimmed, non-empty, length-capped, de-duplicated, bounded in count. */
function parseStringList(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= MAX_LIST_ENTRIES) break;
  }
  return out;
}

/** Whether a pattern is a regex this engine will accept. */
export function compilesAsRegex(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return false;
  try {
    new RegExp(pattern, 'u');
    return true;
  } catch {
    return false;
  }
}

function parseCustomRules(value: unknown): CustomRule[] {
  if (!Array.isArray(value)) return [];
  const out: CustomRule[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { id, label, pattern, enabled } = entry;
    if (typeof id !== 'string' || id.length === 0 || seen.has(id)) continue;
    if (typeof label !== 'string' || typeof pattern !== 'string') continue;
    // A pattern that does not compile is dropped, not stored disabled: keeping
    // it would mean the Options page shows a rule the engine cannot run.
    if (!compilesAsRegex(pattern)) continue;
    seen.add(id);
    out.push({ id, label: label.slice(0, MAX_LIST_ENTRY_LENGTH), pattern, enabled: enabled === true });
    if (out.length >= MAX_LIST_ENTRIES) break;
  }
  return out;
}

/** A CLDR region is two ASCII letters. Anything else is not one. */
function parseRegion(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z]{2}$/u.test(value)
    ? value.toUpperCase()
    : DEFAULT_SETTINGS.phoneRegion;
}

/**
 * Turns whatever was in storage into Settings, discarding what it cannot
 * recognise. Never throws: there is no input for which the right answer is a
 * broken content script.
 */
export function parseSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return DEFAULT_SETTINGS;
  const profile = raw['profile'];
  const mode = raw['mode'];
  return {
    profile: PROFILE_NAMES.includes(profile as Profile) ? (profile as Profile) : DEFAULT_SETTINGS.profile,
    mode: MODES.includes(mode as SubstitutionMode)
      ? (mode as SubstitutionMode)
      : DEFAULT_SETTINGS.mode,
    // Not checked against the EntityType union: a type retired between
    // versions would otherwise resurrect itself as enabled. An unknown id in
    // this list simply matches nothing.
    disabledTypes: parseStringList(raw['disabledTypes'], 64) as EntityType[],
    disabledSites: parseStringList(raw['disabledSites'], 64),
    allowlist: parseStringList(raw['allowlist'], MAX_LIST_ENTRY_LENGTH),
    denylist: parseStringList(raw['denylist'], MAX_LIST_ENTRY_LENGTH),
    customRules: parseCustomRules(raw['customRules']),
    phoneRegion: parseRegion(raw['phoneRegion']),
  };
}

export async function loadSettings(area: StorageArea = defaultArea()): Promise<Settings> {
  try {
    const stored = await area.get(KEY);
    return parseSettings(stored[KEY]);
  } catch {
    // Storage unavailable or denied. Protecting everything is the right answer.
    return DEFAULT_SETTINGS;
  }
}

/** Writes the parsed form, so nothing reaches disk that could not be read back. */
export async function saveSettings(
  settings: Settings,
  area: StorageArea = defaultArea(),
): Promise<Settings> {
  const clean = parseSettings(settings);
  await area.set({ [KEY]: clean });
  return clean;
}

/**
 * Whether the extension should protect this site.
 *
 * The only question the content script asks, and it defaults to YES. Turning a
 * site off is a decision the user has to have actually made and stored; every
 * other outcome — no settings, unreadable settings, a `disabledSites` that is
 * not an array — protects the page.
 */
export function enabledFor(siteId: string, settings: Settings): boolean {
  return !settings.disabledSites.includes(siteId);
}

/** Whether a type should be detected. Same default-on reasoning. */
export function typeEnabled(type: EntityType, settings: Settings): boolean {
  return !settings.disabledTypes.includes(type);
}

/** Returns the settings after the change, already written. */
export async function setSiteEnabled(
  siteId: string,
  enabled: boolean,
  area: StorageArea = defaultArea(),
): Promise<Settings> {
  const current = await loadSettings(area);
  const without = current.disabledSites.filter((id) => id !== siteId);
  return saveSettings(
    { ...current, disabledSites: enabled ? without : [...without, siteId] },
    area,
  );
}
