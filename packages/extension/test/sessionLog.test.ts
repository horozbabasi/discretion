/**
 * The in-memory session log.
 *
 * SPEC step 9: "Record to an in-memory session log: timestamp, types, counts,
 * confidence distribution. Never values."
 *
 * The property that matters most is the last clause, and the second is that
 * `clear()` really clears — the popup reporting the previous conversation's
 * counts after a navigation would be a leak of exactly the kind the session
 * boundary exists to prevent.
 */

import { describe, expect, it } from 'vitest';

import { SessionLog } from '../src/detection/sessionLog.js';

const at = 1_700_000_000_000;

describe('the session log', () => {
  it('starts empty and says so with nulls rather than zeroes', () => {
    const summary = new SessionLog().summary();
    expect(summary.runs).toBe(0);
    expect(summary.totalMasked).toBe(0);
    expect(summary.byType).toEqual([]);
    // null, not 0: "no message has been sent" and "a message scored 0" are
    // different facts and the popup shows them differently.
    expect(summary.peakExposure).toBeNull();
    expect(summary.meanExposure).toBeNull();
    expect(summary.lastAt).toBeNull();
  });

  it('counts by type across runs', () => {
    const log = new SessionLog();
    log.record([{ type: 'EMAIL', confidence: 0.9 }], 20, at);
    log.record(
      [
        { type: 'EMAIL', confidence: 0.95 },
        { type: 'IBAN', confidence: 0.99 },
      ],
      50,
      at + 1000,
    );
    const summary = log.summary();
    expect(summary.runs).toBe(2);
    expect(summary.totalMasked).toBe(3);
    expect(summary.byType).toEqual([
      { type: 'EMAIL', count: 2 },
      { type: 'IBAN', count: 1 },
    ]);
    expect(summary.lastAt).toBe(at + 1000);
  });

  it('orders by count then by name, so a redraw does not reshuffle', () => {
    const log = new SessionLog();
    log.record(
      [
        { type: 'PHONE', confidence: 0.8 },
        { type: 'EMAIL', confidence: 0.8 },
      ],
      10,
      at,
    );
    // Equal counts: the tiebreak has to be stable, or the popup reorders
    // itself while someone is reading it.
    expect(log.summary().byType.map((e) => e.type)).toEqual(['EMAIL', 'PHONE']);
  });

  it('takes the peak and the mean of exposure, never the sum', () => {
    const log = new SessionLog();
    log.record([{ type: 'EMAIL', confidence: 0.9 }], 90, at);
    log.record([{ type: 'EMAIL', confidence: 0.9 }], 10, at);
    log.record([{ type: 'EMAIL', confidence: 0.9 }], 20, at);
    const summary = log.summary();
    // A sum would be 120 - a number on a 0-100 scale with no meaning.
    expect(summary.peakExposure).toBe(90);
    expect(summary.meanExposure).toBeCloseTo(40, 5);
  });

  it('lets a harmless message pull the mean down', () => {
    const log = new SessionLog();
    log.record([{ type: 'EMAIL', confidence: 0.9 }], 80, at);
    log.record([], 0, at);
    expect(log.summary().meanExposure).toBeCloseTo(40, 5);
    expect(log.summary().peakExposure).toBe(80);
  });

  it('bins confidence into ten buckets and clamps the ends', () => {
    const log = new SessionLog();
    log.record(
      [
        { type: 'EMAIL', confidence: 0 },
        { type: 'EMAIL', confidence: 0.55 },
        { type: 'EMAIL', confidence: 1 },
        // Out of range either way must not write outside the array.
        { type: 'EMAIL', confidence: 1.5 },
        { type: 'EMAIL', confidence: -0.2 },
      ],
      0,
      at,
    );
    const histogram = log.summary().confidence;
    expect(histogram.length).toBe(10);
    expect(histogram[0]).toBe(2);
    expect(histogram[5]).toBe(1);
    expect(histogram[9]).toBe(2);
  });

  it('clear() leaves nothing behind', () => {
    const log = new SessionLog();
    log.record([{ type: 'PRIVATE_KEY', confidence: 0.99 }], 95, at);
    log.clear();
    const summary = log.summary();
    expect(summary).toEqual({
      runs: 0,
      totalMasked: 0,
      byType: [],
      confidence: Array.from({ length: 10 }, () => 0),
      peakExposure: null,
      meanExposure: null,
      lastAt: null,
    });
  });

  it('hands out a snapshot, not a live view', () => {
    // The popup holds what it was given. If that were the internal array, a
    // later `clear()` would silently rewrite what the popup is displaying -
    // or worse, not rewrite it, and keep the old session visible.
    const log = new SessionLog();
    log.record([{ type: 'EMAIL', confidence: 0.9 }], 30, at);
    const before = log.summary();
    log.clear();
    log.record([{ type: 'IBAN', confidence: 0.9 }], 70, at);
    expect(before.byType).toEqual([{ type: 'EMAIL', count: 1 }]);
    expect(before.peakExposure).toBe(30);
  });
});
