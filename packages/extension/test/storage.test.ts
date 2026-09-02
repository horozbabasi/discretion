/**
 * Settings and Local Insights.
 *
 * Two properties carry this file:
 *
 *   - SETTINGS DEGRADE TOWARDS PROTECTING. Everything read back from storage
 *     is untrusted, and every way of failing to understand it must end with
 *     the site protected. A settings bug that turns detection off is a leak
 *     with a configuration screen in front of it.
 *   - INSIGHTS STORE COUNTS AND NOTHING ELSE. This is the only part of the
 *     extension that writes a history to disk, so the tests assert what is
 *     ABSENT — no values, no types, no site, no timestamp finer than a month.
 */

import { describe, expect, it } from 'vitest';

import { memoryArea } from '../src/storage/area.js';
import {
  DEFAULT_SETTINGS,
  compilesAsRegex,
  enabledFor,
  loadSettings,
  parseSettings,
  saveSettings,
  setSiteEnabled,
  typeEnabled,
} from '../src/storage/settings.js';
import {
  loadInsights,
  monthKeyOf,
  parseInsights,
  recordMasked,
  resetInsights,
  viewOf,
} from '../src/storage/insights.js';

describe('settings are parsed, never trusted', () => {
  it('returns the protective defaults for anything that is not a record', () => {
    for (const junk of [null, undefined, 42, 'settings', [], true]) {
      expect(parseSettings(junk)).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('discards an unknown profile rather than carrying it through', () => {
    // 'paranoid' is not one of SPEC's three, and 'strict ' is a typo away from
    // one. Both must land on the default, not on undefined.
    expect(parseSettings({ profile: 'paranoid' }).profile).toBe('balanced');
    expect(parseSettings({ profile: 'strict ' }).profile).toBe('balanced');
    expect(parseSettings({ profile: 'strict' }).profile).toBe('strict');
  });

  it('keeps a site protected when disabledSites is malformed', () => {
    // The failure that matters. Every one of these must protect the site.
    for (const malformed of [null, 'chatgpt', 42, { chatgpt: true }, [1, 2, 3]]) {
      const settings = parseSettings({ disabledSites: malformed });
      expect(enabledFor('chatgpt', settings)).toBe(true);
    }
  });

  it('honours a site the user really did switch off', () => {
    const settings = parseSettings({ disabledSites: ['claude'] });
    expect(enabledFor('claude', settings)).toBe(false);
    expect(enabledFor('chatgpt', settings)).toBe(true);
  });

  it('protects when storage itself throws', async () => {
    const broken = {
      get: () => Promise.reject(new Error('storage denied')),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    const settings = await loadSettings(broken);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(enabledFor('chatgpt', settings)).toBe(true);
  });

  it('treats an unknown entity type as enabled', () => {
    // A type added in a later version was not in anyone's disabled list, and
    // must detect by default rather than wait to be switched on.
    expect(typeEnabled('IBAN', DEFAULT_SETTINGS)).toBe(true);
    expect(typeEnabled('IBAN', parseSettings({ disabledTypes: ['IBAN'] }))).toBe(false);
    expect(typeEnabled('EMAIL', parseSettings({ disabledTypes: ['IBAN'] }))).toBe(true);
  });

  it('drops non-strings, blanks, duplicates and oversize entries from lists', () => {
    const parsed = parseSettings({
      allowlist: ['ok', '  ok  ', '', '   ', 42, null, 'x'.repeat(300), 'fine'],
    });
    expect(parsed.allowlist).toEqual(['ok', 'fine']);
  });

  it('caps how many list entries a paste can add', () => {
    const huge = Array.from({ length: 2000 }, (_, i) => `entry-${String(i)}`);
    expect(parseSettings({ denylist: huge }).denylist.length).toBe(500);
  });

  it('drops a custom rule whose pattern does not compile', () => {
    // Stored disabled would mean the Options page lists a rule the engine
    // cannot run. Dropped means what is shown is what would execute.
    const parsed = parseSettings({
      customRules: [
        { id: 'a', label: 'good', pattern: '\\d{3}', enabled: true },
        { id: 'b', label: 'broken', pattern: '(unclosed', enabled: true },
        { id: 'c', label: 'huge', pattern: 'x'.repeat(600), enabled: true },
      ],
    });
    expect(parsed.customRules.map((r) => r.id)).toEqual(['a']);
  });

  it('accepts only a two-letter phone region', () => {
    expect(parseSettings({ phoneRegion: 'tr' }).phoneRegion).toBe('TR');
    expect(parseSettings({ phoneRegion: 'TUR' }).phoneRegion).toBe('US');
    expect(parseSettings({ phoneRegion: 90 }).phoneRegion).toBe('US');
  });

  it('compilesAsRegex agrees with what the engine will accept', () => {
    expect(compilesAsRegex('\\p{L}+')).toBe(true);
    expect(compilesAsRegex('(')).toBe(false);
    expect(compilesAsRegex('')).toBe(false);
  });

  it('writes only what it could read back', async () => {
    const area = memoryArea();
    // A caller handing over a hostile object must not get it onto disk.
    await saveSettings(
      { ...DEFAULT_SETTINGS, profile: 'nonsense' as never, allowlist: [42 as never] },
      area,
    );
    const stored = await loadSettings(area);
    expect(stored.profile).toBe('balanced');
    expect(stored.allowlist).toEqual([]);
  });

  it('toggles one site without disturbing the others', async () => {
    const area = memoryArea();
    await setSiteEnabled('claude', false, area);
    await setSiteEnabled('gemini', false, area);
    await setSiteEnabled('claude', true, area);
    const settings = await loadSettings(area);
    expect(enabledFor('claude', settings)).toBe(true);
    expect(enabledFor('gemini', settings)).toBe(false);
    expect(settings.disabledSites).toEqual(['gemini']);
  });
});

describe('Local Insights record counts and nothing else', () => {
  const jan = new Date(2026, 0, 15);
  const feb = new Date(2026, 1, 3);

  it('keys months by the local calendar', () => {
    expect(monthKeyOf(new Date(2026, 0, 1))).toBe('2026-01');
    expect(monthKeyOf(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('stores the FAMILY, never the type', async () => {
    // "3 identity" and not "3 US_NPI": the narrower label is the one that
    // hints at a profession or a medical situation.
    const area = memoryArea();
    await recordMasked(['US_NPI', 'HEALTH_DATA', 'API_KEY'], area, jan);
    const raw = JSON.stringify(await area.get('insights'));
    expect(raw).not.toContain('US_NPI');
    expect(raw).not.toContain('HEALTH_DATA');
    expect(raw).toContain('document');
    expect(raw).toContain('health');
    expect(raw).toContain('secret');
  });

  it('stores no value, no text and no site', async () => {
    const area = memoryArea();
    await recordMasked(['EMAIL', 'EMAIL', 'CREDIT_CARD'], area, jan);
    const stored = (await area.get('insights'))['insights'];
    // The whole persisted shape: month -> family -> integer. Nothing else can
    // hide in it, and this asserts the shape rather than trusting the writer.
    for (const [monthKey, counts] of Object.entries(stored as object)) {
      expect(monthKey).toMatch(/^\d{4}-\d{2}$/u);
      for (const [family, count] of Object.entries(counts as object)) {
        expect(typeof family).toBe('string');
        expect(Number.isInteger(count)).toBe(true);
      }
    }
  });

  it('accumulates within a month and separates across months', async () => {
    const area = memoryArea();
    await recordMasked(['EMAIL', 'PHONE'], area, jan);
    await recordMasked(['EMAIL'], area, jan);
    await recordMasked(['API_KEY'], area, feb);
    const insights = await loadInsights(area);
    expect(insights['2026-01']).toEqual({ contact: 3 });
    expect(insights['2026-02']).toEqual({ secret: 1 });
  });

  it('separates this month from all time', async () => {
    const area = memoryArea();
    await recordMasked(['EMAIL'], area, jan);
    await recordMasked(['API_KEY', 'API_KEY'], area, feb);
    const view = viewOf(await loadInsights(area), feb);
    expect(view.thisMonth).toEqual({ secret: 2 });
    expect(view.allTime).toEqual({ contact: 1, secret: 2 });
    expect(view.empty).toBe(false);
  });

  it('says plainly that it is empty rather than showing zeroes', async () => {
    const view = viewOf(await loadInsights(memoryArea()));
    expect(view.empty).toBe(true);
    expect(view.allTime).toEqual({});
  });

  it('records nothing when nothing was masked', async () => {
    const area = memoryArea();
    await recordMasked([], area, jan);
    expect(await area.get('insights')).toEqual({});
  });

  it('keeps at most two years of months', async () => {
    const area = memoryArea();
    for (let month = 0; month < 30; month += 1) {
      await recordMasked(['EMAIL'], area, new Date(2024, month, 1));
    }
    const insights = await loadInsights(area);
    expect(Object.keys(insights).length).toBe(24);
    // The oldest went, the newest stayed.
    expect(insights['2024-01']).toBeUndefined();
    expect(insights['2026-06']).toEqual({ contact: 1 });
  });

  it('discards malformed months and counts instead of showing them', () => {
    const parsed = parseInsights({
      '2026-01': { contact: 3 },
      '2026-13': { contact: 9 },
      'january': { contact: 9 },
      '2026-02': { contact: -1, secret: 'many', health: 2.7 },
      '2026-03': 'nonsense',
    });
    expect(parsed).toEqual({ '2026-01': { contact: 3 }, '2026-02': { health: 2 } });
  });

  it('survives an unreadable store by reporting nothing', async () => {
    const broken = {
      get: () => Promise.reject(new Error('denied')),
      set: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };
    expect(await loadInsights(broken)).toEqual({});
  });

  it('does not fail a masking run when the store is full', async () => {
    // This runs after the message has already been protected. Losing a count
    // must not throw into that path.
    const full = {
      get: () => Promise.resolve({}),
      set: () => Promise.reject(new Error('QUOTA_BYTES exceeded')),
      remove: () => Promise.resolve(),
    };
    await expect(recordMasked(['EMAIL'], full, jan)).resolves.toBeDefined();
  });

  it('reset removes the key rather than writing zeroes over it', async () => {
    const area = memoryArea();
    await recordMasked(['EMAIL'], area, jan);
    await resetInsights(area);
    // Not `{ '2026-01': {} }` — an empty record is still a record that the
    // extension was used.
    expect(await area.get('insights')).toEqual({});
    expect(viewOf(await loadInsights(area)).empty).toBe(true);
  });
});
