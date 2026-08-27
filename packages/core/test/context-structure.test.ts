/**
 * Stage 3 structural cues.
 *
 * SPEC.md: "STRUCTURAL CUES — key names in JSON/YAML, CSV column headers,
 * form labels, markdown table headers, .env variable names. A value under a
 * key named 'api_key' or 'ssn' is near-certain regardless of its shape."
 *
 * The offsets asserted here are the contract that matters: a slot must cover
 * the VALUE and nothing else, because Stage 3 uses the association to raise
 * confidence on exactly that span.
 */
import { describe, expect, it } from 'vitest';
import { buildStructureIndex } from '../src/context/structure.js';

/** The key labelling the first occurrence of `value`, or undefined. */
function keyFor(text: string, value: string): string | undefined {
  const start = text.indexOf(value);
  expect(start, `fixture must contain ${value}`).toBeGreaterThanOrEqual(0);
  return buildStructureIndex(text).slotAt(start, start + value.length)?.key;
}

describe('buildStructureIndex — key/value forms', () => {
  it('reads JSON keys and excludes the quotes from the value span', () => {
    const text = '{\n  "api_key": "sk-abc123",\n  "note": "hello"\n}';
    const index = buildStructureIndex(text);
    const start = text.indexOf('sk-abc123');
    const slot = index.slotAt(start, start + 'sk-abc123'.length);

    expect(slot?.key).toBe('api_key');
    expect(slot?.kind).toBe('json');
    expect(text.slice(slot!.valueStart, slot!.valueEnd)).toBe('sk-abc123');
  });

  it('reads YAML mapping keys', () => {
    expect(keyFor('service:\n  db_password: hunter2xyz\n', 'hunter2xyz')).toBe('db_password');
  });

  it('reads .env assignments, with and without export', () => {
    expect(keyFor('STRIPE_SECRET=sk_live_9\n', 'sk_live_9')).toBe('STRIPE_SECRET');
    expect(keyFor('export AWS_SECRET=AKIAX\n', 'AKIAX')).toBe('AWS_SECRET');
  });

  it('reads code assignments anywhere on the line', () => {
    expect(keyFor('const apiKey = "LbPACTvq";\n', 'LbPACTvq')).toBe('apiKey');
    expect(keyFor('  self.access_token = "tok_42"\n', 'tok_42')).toBe('access_token');
  });

  it('reads prose form labels in any script', () => {
    expect(keyFor('Tel: +90 555 123 45 67\n', '+90 555 123 45 67')).toBe('Tel');
    expect(keyFor('TC Kimlik No: 10000000146\n', '10000000146')).toBe('TC Kimlik No');
    // Hebrew label, RTL source, same contract.
    expect(keyFor('טלפון: 054-1234567\n', '054-1234567')).toBe('טלפון');
  });

  it('does not treat a bare time as a key/value pair', () => {
    // COLON_KEY requires a letter first, so "09:30" cannot label "30".
    const index = buildStructureIndex('Meeting at 09:30 tomorrow\n');
    expect(index.slots.every((s) => s.key !== '09')).toBe(true);
  });

  it('ignores a colon buried in a long prose sentence', () => {
    const text = 'The following is a very long sentence that eventually contains a colon: 12345\n';
    const start = text.indexOf('12345');
    // The "key" would exceed the length limit, so no slot is produced.
    expect(buildStructureIndex(text).slotAt(start, start + 5)).toBeUndefined();
  });
});

describe('buildStructureIndex — tables', () => {
  it('maps CSV cells to their column headers', () => {
    const text = 'id,ssn,status\n1,123-45-6789,ok\n2,987-65-4321,ok\n';
    expect(keyFor(text, '123-45-6789')).toBe('ssn');
    expect(keyFor(text, '987-65-4321')).toBe('ssn');
  });

  it('honours quotes so an embedded comma does not shift columns', () => {
    const text = 'id,name,ssn\n1,"Doe, Jane",123-45-6789\n';
    expect(keyFor(text, '123-45-6789')).toBe('ssn');
  });

  it('refuses to read a prose line containing commas as a CSV header', () => {
    const text = 'Hello, this is prose\nand 123-45-6789 appears here\n';
    const start = text.indexOf('123-45-6789');
    expect(buildStructureIndex(text).slotAt(start, start + 11)).toBeUndefined();
  });

  it('maps markdown table cells to their column headers', () => {
    const text = '| field | value |\n| --- | --- |\n| token | ghp_secret1 |\n';
    const index = buildStructureIndex(text);
    const start = text.indexOf('ghp_secret1');
    expect(index.slotAt(start, start + 'ghp_secret1'.length)?.key).toBe('value');
  });
});

describe('buildStructureIndex — resolution', () => {
  it('returns the smallest containing slot when several apply', () => {
    // The CSV row gives a cell slot; the colon form would give a wider one.
    const text = 'key,secret\nrow: a,sk-abc123\n';
    const start = text.indexOf('sk-abc123');
    const slot = buildStructureIndex(text).slotAt(start, start + 'sk-abc123'.length);
    expect(slot?.key).toBe('secret');
  });

  it('returns undefined for a span in unstructured prose', () => {
    const text = 'The reference 4111111111111111 was recorded yesterday.\n';
    const start = text.indexOf('4111111111111111');
    expect(buildStructureIndex(text).slotAt(start, start + 16)).toBeUndefined();
  });

  it('never returns a slot that fails to contain the span', () => {
    const text = 'a: 1\nb: 22\nc: 333\n';
    const index = buildStructureIndex(text);
    for (const slot of index.slots) {
      const found = index.slotAt(slot.valueStart, slot.valueEnd);
      expect(found).toBeDefined();
      expect(found!.valueStart).toBeLessThanOrEqual(slot.valueStart);
      expect(found!.valueEnd).toBeGreaterThanOrEqual(slot.valueEnd);
    }
  });
});
