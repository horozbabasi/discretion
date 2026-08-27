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

/**
 * Coverage gaps found by the M7 adversarial safety review (ARCHITECTURE.md
 * D18). These are not cosmetic: once GENERIC_SECRET requires an assignment
 * signal to be emitted at all, a key/value form this index fails to recognise
 * becomes a real secret that is silently dropped. Each case below was
 * executed and observed returning `undefined` before the fix.
 *
 * The scenarios are chosen for how ordinarily a person hits them — pasting a
 * Python snippet, a curl command, a diff, a Kubernetes manifest — because
 * that is what determines how often the gap would have leaked.
 */
describe('buildStructureIndex — fail-open coverage gaps (M7 review)', () => {
  it('reads single- and backtick-quoted object keys, not only JSON double quotes', () => {
    const python = "headers = {\n    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.7Hq2Lp9',\n}\n";
    expect(keyFor(python, 'Bearer eyJhbGciOiJIUzI1NiJ9.abc.7Hq2Lp9')).toBe('Authorization');
  });

  it('reads a quoted HTTP header passed to curl', () => {
    const curl = 'curl -H "Authorization: Bearer sk_live_51Mv8QpLkTn2aBc" https://api.example.com\n';
    expect(keyFor(curl, 'Bearer sk_live_51Mv8QpLkTn2aBc')).toBe('Authorization');
  });

  it('sees through diff markers on an added line', () => {
    const diff = 'diff --git a/.env b/.env\n@@ -3,4 +3,5 @@\n DEBUG=false\n+STRIPE_KEY=sk_live_51Mv8Qp\n';
    expect(keyFor(diff, 'sk_live_51Mv8Qp')).toBe('STRIPE_KEY');
  });

  it('reads hyphenated TOML/INI keys and non-ASCII keys', () => {
    expect(keyFor('[registry]\napi-secret = Tz3Nq8WvBk5RmYc2Xp\n', 'Tz3Nq8WvBk5RmYc2Xp')).toBe('api-secret');
    // A Turkish key labels a password exactly as an English one does.
    expect(keyFor('şifre = Tz3Nq8WvBk5RmYc2XpHd\n', 'Tz3Nq8WvBk5RmYc2XpHd')).toBe('şifre');
  });

  it('reads an .npmrc scoped auth token', () => {
    const npmrc = 'registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=npm_yT4kQz8RwVb2\n';
    expect(keyFor(npmrc, 'npm_yT4kQz8RwVb2')).toBe('_authToken');
  });

  it('reads a YAML block scalar spanning several lines', () => {
    const manifest = 'stringData:\n  service-account.json: |\n    {"id":"a91f2c"}\n    signing: hSdk39fjKQm2Zx0Pw\n';
    expect(keyFor(manifest, 'hSdk39fjKQm2Zx0Pw')).toBeDefined();
  });

  it('reads a .netrc password, but only in a .netrc-shaped document', () => {
    const netrc = 'machine api.github.com\n  login yagizhan\n  password ghp_R7kQm2Zx9LpWvNc4\n';
    expect(keyFor(netrc, 'ghp_R7kQm2Zx9LpWvNc4')).toBe('password');
    // Prose must not gain a "first word is the key" reading.
    const prose = 'The password policy changed on Friday and everyone must rotate.\n';
    const start = prose.indexOf('policy');
    expect(buildStructureIndex(prose).slotAt(start, start + 6)).toBeUndefined();
  });

  it('reads quoted env assignments, CLI flags, and setter calls', () => {
    expect(keyFor('docker run -e "DB_PASSWORD=Kq9Xm2Rv7LpTn4" img\n', 'Kq9Xm2Rv7LpTn4')).toBe('DB_PASSWORD');
    expect(keyFor('./deploy.sh --api-token=8fK2mQz7VbXt0Rw --dry-run\n', '8fK2mQz7VbXt0Rw')).toBe('api-token');
    // The setter verb is stripped so the key matches a lexicon term.
    expect(keyFor('client.setApiKey("Rz8Km2Qx9LpWvNc4Tb");\n', 'Rz8Km2Qx9LpWvNc4Tb')).toBe('ApiKey');
  });

  it('reads every key of a minified single-line JSON payload', () => {
    // The line-anchored form found only the first key, so an `ssn` label in a
    // one-line API response — the ordinary shape of a log entry — was lost.
    const minified = '{"name":"Ann Meyer","ssn":"123-45-6789","zip":"90210"}';
    expect(keyFor(minified, '123-45-6789')).toBe('ssn');
    expect(keyFor(minified, '90210')).toBe('zip');
  });

  it('reads a CJK form label whose colon is followed directly by the value', () => {
    // Stage 0 folds the full-width colon to ASCII but leaves no space, which
    // the spaced colon form requires. This is a Japanese My Number.
    expect(keyFor('お客様情報\n個人番号:123456789012\n氏名:山田太郎\n', '123456789012')).toBe('個人番号');
  });

  it('does not let an unspaced ASCII colon create a key', () => {
    // The non-ASCII requirement is what keeps a bare time out of scope.
    expect(buildStructureIndex('Meeting at 09:30 tomorrow\n').slots).toEqual([]);
  });

  it('does not let arithmetic parse as an assignment', () => {
    // Widening the assignment form must not make `a+b=c` key on `b`.
    const index = buildStructureIndex('let total = a+b\nif (x-1 == y) { return 5 }\n');
    expect(index.slots.map((s) => s.key)).toEqual(['total']);
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
