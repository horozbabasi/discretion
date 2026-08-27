/**
 * Stage 3, STRUCTURAL CUES.
 *
 * SPEC.md: "STRUCTURAL CUES — key names in JSON/YAML, CSV column headers,
 * form labels, markdown table headers, .env variable names. A value under a
 * key named 'api_key' or 'ssn' is near-certain regardless of its shape."
 *
 * That last clause is the whole point of this module: shape-based detection
 * cannot tell a random-looking API key from a random-looking order number,
 * but the KEY the value sits under usually can. So this module answers one
 * question for a candidate span — "what is this value labelled as?" — and
 * leaves the interpretation of that label to the trigger lexicons.
 *
 * Everything here is line-oriented, which is safe because Stage 0 preserves
 * line structure: `normalizeWhitespacePunct` maps exotic spaces 1:1 and
 * explicitly does not collapse runs or trim (see its header). Offsets
 * produced here are therefore offsets into the normalized text, the same
 * space Stage 1 and Stage 2 candidates live in.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** How a key/value association was expressed in the source text. */
export type StructureKind =
  | 'json'
  | 'yaml'
  | 'env'
  | 'code-assignment'
  | 'csv'
  | 'markdown-table'
  | 'form-label';

/** A value position in the document, together with the key that labels it. */
export interface StructuredSlot {
  /** The key/label text exactly as written, minus quotes and surrounding space. */
  readonly key: string;
  readonly kind: StructureKind;
  /** Start offset of the VALUE in the normalized text (inclusive). */
  readonly valueStart: number;
  /** End offset of the VALUE (exclusive). */
  readonly valueEnd: number;
}

/** Slots for one document, with containment lookup. */
export interface StructureIndex {
  readonly slots: readonly StructuredSlot[];
  /** The innermost slot whose value range contains the given span, if any. */
  slotAt(start: number, end: number): StructuredSlot | undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Limits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Longest accepted key. Keys are labels; anything longer is prose that happens
 * to contain a colon, and admitting it would let a whole sentence act as a
 * "key" and match a trigger by accident.
 */
const MAX_KEY_LENGTH = 48;

/** A CSV needs at least this many rows (header + data) to be believable. */
const MIN_CSV_ROWS = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Line iteration
// ─────────────────────────────────────────────────────────────────────────────

interface Line {
  readonly text: string;
  /** Offset of the line's first character in the document. */
  readonly offset: number;
}

/**
 * Drop a diff's leading marker, keeping offsets honest by advancing the
 * line's own offset rather than rewriting the document.
 */
function stripDiffMarker(line: Line): Line {
  if (!DIFF_LINE.test(line.text)) return line;
  return { text: line.text.slice(1), offset: line.offset + 1 };
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  for (;;) {
    const nl = text.indexOf('\n', offset);
    if (nl === -1) {
      lines.push({ text: text.slice(offset), offset });
      return lines;
    }
    lines.push({ text: text.slice(offset, nl), offset });
    offset = nl + 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Key/value line forms
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `"key": value` — JSON, and object literals with quoted keys.
 *
 * All three quote styles are accepted, not just the double quote JSON itself
 * uses: Python dictionaries and JavaScript object literals overwhelmingly use
 * single quotes, and a Python `requests` snippet with an `'Authorization'`
 * header is one of the most common things a developer pastes when asking for
 * help. (M7 safety review — ARCHITECTURE.md D18.)
 */
const JSON_KEY = /^\s*(?:"([^"\\]{1,48})"|'([^'\\]{1,48})'|`([^`\\]{1,48})`)\s*:\s*/;

/**
 * A quoted `Header: value` pair anywhere on a line — `-H "Authorization: …"`.
 *
 * Scanned separately from the line-anchored colon form rather than by
 * unanchoring it, because unanchoring would let arbitrary prose before a
 * colon become a key.
 */
const QUOTED_HEADER = /['"]\s*([A-Za-z][A-Za-z0-9-]{0,47})\s*:\s+(?=\S)/g;

/**
 * `--api-token=…` — a credential passed as a command-line flag.
 *
 * The literal `--` is required, so this cannot match an ordinary expression.
 */
const CLI_FLAG = /(?:^|\s)--([A-Za-z][A-Za-z0-9-]{0,47})=(?!=)("[^"]*"|'[^']*'|\S+)/g;

/**
 * `setApiKey("…")` — a credential handed to an SDK setter.
 *
 * Restricted to a single string-literal argument so that ordinary calls with
 * computed arguments are not read as assignments.
 */
const CALL_ARGUMENT =
  /(?:^|[\s;{(,[.])([A-Za-z_$][A-Za-z0-9_$]{0,47})\s*\(\s*("[^"]{1,512}"|'[^']{1,512}')\s*[,)]/g;

/** Leading verb stripped so `setApiKey` and `withApiKey` both key on `ApiKey`. */
const SETTER_PREFIX = /^(?:set|with|put|add|update)(?=[A-Z_])/;

/** A YAML block scalar introducer: `key: |`, `key: >-`, `key: |2`. */
const BLOCK_SCALAR = /^[|>][+-]?\d*$/;

/** Unified-diff and patch line markers, stripped only in a diff document. */
const DIFF_LINE = /^[+\- ]/;
const DIFF_DOCUMENT = /^(?:@@ -\d+|--- a\/|\+\+\+ b\/|diff --git )/m;

/**
 * `"key": value` anywhere on a line, for minified JSON.
 *
 * The line-anchored form finds only the first key of a single-line payload,
 * and a one-line JSON body is what an API response or a log entry actually
 * looks like — the review executed `{"name":…,"ssn":"123-45-6789",…}` and
 * found the `ssn` label lost entirely.
 */
const JSON_KEY_INLINE = /(["'`])([^"'`\\]{1,48})\1\s*:\s*/g;

/**
 * A form label whose colon is followed immediately by its value.
 *
 * CJK forms write `個人番号：123456789012`; Stage 0 folds the full-width colon
 * to ASCII but leaves no space, which the spaced colon form requires. The key
 * must contain a non-ASCII letter, which is what keeps `09:30` and ordinary
 * ASCII prose out of scope.
 */
const COLON_KEY_UNSPACED = /^[\s>-]*([\p{L}][\p{L}\p{M}\p{N} _.\\/-]{0,47}?)\s*:(?=\S)/u;

/** True when the key carries a non-ASCII letter, which gates the form above. */
const HAS_NON_ASCII = /\P{ASCII}/u;

/** `machine host` / `login user` / `password secret` — .netrc and friends. */
const NETRC_PAIR = /^\s*(machine|login|password|account|default)\s+(\S.*)$/;
const NETRC_DOCUMENT = /^\s*(?:machine\s+\S+|default)\s*$/m;

/**
 * `key: value` — YAML mappings, and form labels in prose ("Tel: +90…").
 * The key accepts any script's letters so that a Hebrew or Japanese form
 * label is recognized as readily as an English one; it forbids the digits-only
 * case so that a bare time ("09:30") is not read as a key/value pair.
 */
const COLON_KEY = /^[\s>-]*([\p{L}][\p{L}\p{M}\p{N} _.\\/-]{0,47})\s*:\s+(?=\S)/u;

/**
 * `KEY=value`, `export KEY=value` — .env files and shell assignments.
 *
 * Three widenings, each from an executed M7 safety-review case:
 *   • hyphens in the CONTINUATION only, never the first character, so TOML
 *     and INI keys like `api-key` are covered without letting an arithmetic
 *     expression parse as an assignment;
 *   • any script's letters, matching the policy the colon form already
 *     states — a Turkish `şifre = …` labels a password just as well as
 *     `password = …` does;
 *   • an optional scope prefix ending in a colon, which is how `.npmrc`
 *     writes `//registry.npmjs.org/:_authToken=…`. The prefix may not contain
 *     `=` or whitespace, so it cannot swallow an ordinary line.
 */
const ENV_KEY =
  /^\s*(?:export\s+)?(?:[^\s=]{1,80}:)?([\p{L}_][\p{L}\p{M}\p{N}_-]{0,47})\s*=\s*/u;

/**
 * `const apiKey = "…"`, `apiKey = '…'`, `self.api_key = …` — assignments in
 * source code, anywhere on the line rather than only at its start.
 *
 * The whole dotted path is captured because the LAST segment is the label
 * that means something: in `user.ssn = …` the key is `ssn`, not `user`.
 */
const CODE_ASSIGNMENT =
  /(?:^|[\s;{(,["'`])(?:const|let|var|val|final|public|private|static|readonly)?\s*([A-Za-z_$][A-Za-z0-9_$]{0,47}(?:\.[A-Za-z_$][A-Za-z0-9_$]{0,47})*)\s*=\s*(?!=)/g;

/** Characters that wrap a value and are not part of it. */
const VALUE_WRAPPERS = new Set(['"', "'", '`']);

/**
 * Narrow a raw value range to the value itself: drop surrounding quotes, a
 * trailing comma or semicolon, and outer whitespace. Masking must never
 * include the punctuation that delimits a value.
 */
function trimValue(text: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  while (s < e && (text[s] === ' ' || text[s] === '\t')) s += 1;
  while (e > s && (text[e - 1] === ' ' || text[e - 1] === '\t' || text[e - 1] === '\r')) e -= 1;
  while (e > s && (text[e - 1] === ',' || text[e - 1] === ';')) {
    e -= 1;
    while (e > s && (text[e - 1] === ' ' || text[e - 1] === '\t')) e -= 1;
  }
  const first = text[s];
  if (first !== undefined && VALUE_WRAPPERS.has(first)) {
    const closing = text.lastIndexOf(first, e - 1);
    if (closing > s) {
      s += 1;
      e = closing;
    }
  }
  return { start: s, end: e };
}

/** Classify a colon-form key: identifier-shaped keys are YAML, prose are labels. */
function colonKind(key: string): StructureKind {
  return /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key) ? 'yaml' : 'form-label';
}

function keyValueSlot(line: Line): StructuredSlot | undefined {
  const json = JSON_KEY.exec(line.text);
  if (json !== null) {
    const key = json[1] ?? json[2] ?? json[3];
    if (key !== undefined) return buildSlot(line, key, json[0].length, 'json');
  }

  const env = ENV_KEY.exec(line.text);
  if (env?.[1] !== undefined) {
    return buildSlot(line, env[1], env[0].length, 'env');
  }

  const colon = COLON_KEY.exec(line.text);
  if (colon?.[1] !== undefined) {
    const key = colon[1].trim();
    if (key.length > 0 && key.length <= MAX_KEY_LENGTH) {
      return buildSlot(line, key, colon[0].length, colonKind(key));
    }
  }

  const unspaced = COLON_KEY_UNSPACED.exec(line.text);
  if (unspaced?.[1] !== undefined) {
    const key = unspaced[1].trim();
    if (key.length > 0 && key.length <= MAX_KEY_LENGTH && HAS_NON_ASCII.test(key)) {
      return buildSlot(line, key, unspaced[0].length, 'form-label');
    }
  }

  return undefined;
}

/** Every `"key": value` pair on a line — the minified-JSON case. */
function jsonInlineSlots(line: Line): StructuredSlot[] {
  const out: StructuredSlot[] = [];
  const pattern = new RegExp(JSON_KEY_INLINE.source, JSON_KEY_INLINE.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line.text)) !== null) {
    const key = match[2];
    if (key === undefined) continue;
    const valueStart = match.index + match[0].length;
    const range = trimValue(line.text, valueStart, jsonValueEnd(line.text, valueStart));
    if (range.end <= range.start) continue;
    out.push({
      key,
      kind: 'json',
      valueStart: line.offset + range.start,
      valueEnd: line.offset + range.end,
    });
  }
  return out;
}

/** End of a JSON value: the closing quote, or the next separator. */
function jsonValueEnd(text: string, from: number): number {
  const opener = text[from];
  if (opener !== undefined && VALUE_WRAPPERS.has(opener)) {
    const closing = text.indexOf(opener, from + 1);
    return closing === -1 ? text.length : closing + 1;
  }
  const separator = text.slice(from).search(/[,}\]]/);
  return separator === -1 ? text.length : from + separator;
}

function buildSlot(line: Line, rawKey: string, valueOffsetInLine: number, kind: StructureKind): StructuredSlot {
  const key = rawKey.trim();
  const range = trimValue(line.text, valueOffsetInLine, line.text.length);
  return {
    key,
    kind,
    valueStart: line.offset + range.start,
    valueEnd: line.offset + range.end,
  };
}

/** Assignments that sit mid-line, which the line-anchored forms above miss. */
function codeAssignmentSlots(line: Line): StructuredSlot[] {
  const out: StructuredSlot[] = [];
  const pattern = new RegExp(CODE_ASSIGNMENT.source, CODE_ASSIGNMENT.flags);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line.text)) !== null) {
    const path = match[1];
    if (path === undefined) continue;
    const key = path.slice(path.lastIndexOf('.') + 1);
    const valueStart = match.index + match[0].length;
    const range = trimValue(line.text, valueStart, line.text.length);
    if (range.end <= range.start) continue;
    out.push({
      key,
      kind: 'code-assignment',
      valueStart: line.offset + range.start,
      valueEnd: line.offset + range.end,
    });
  }
  return out;
}

/**
 * Mid-line forms a developer pastes constantly: quoted HTTP headers, CLI
 * flags, and single-string setter calls. Each is a narrow, explicitly
 * delimited pattern rather than a general relaxation of the key/value forms.
 */
function inlineSlots(line: Line): StructuredSlot[] {
  const out: StructuredSlot[] = [];

  scan(QUOTED_HEADER, (match, key) => {
    const valueStart = match.index + match[0].length;
    // A quoted header value ends at the closing quote, not the line end.
    const quote = line.text[match.index] ?? '"';
    const closing = line.text.indexOf(quote, valueStart);
    const rawEnd = closing === -1 ? line.text.length : closing;
    push(key, valueStart, rawEnd, 'form-label');
  });

  scan(CLI_FLAG, (match, key) => {
    const valueStart = match.index + match[0].indexOf('=') + 1;
    push(key, valueStart, match.index + match[0].length, 'code-assignment');
  });

  scan(CALL_ARGUMENT, (match, key) => {
    const argAt = match[0].lastIndexOf(match[2] ?? '');
    const valueStart = match.index + argAt;
    push(key.replace(SETTER_PREFIX, ''), valueStart, valueStart + (match[2]?.length ?? 0), 'code-assignment');
  });

  return out;

  function scan(pattern: RegExp, emit: (match: RegExpExecArray, key: string) => void): void {
    const local = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = local.exec(line.text)) !== null) {
      const key = match[1];
      if (key !== undefined) emit(match, key);
    }
  }

  function push(key: string, from: number, to: number, kind: StructureKind): void {
    const range = trimValue(line.text, from, to);
    if (range.end <= range.start) return;
    out.push({ key, kind, valueStart: line.offset + range.start, valueEnd: line.offset + range.end });
  }
}

/**
 * YAML block scalars: `key: |` followed by an indented block.
 *
 * Kubernetes Secrets and CI configuration embed whole credential files this
 * way, and a line-bounded value reader sees only the `|` introducer.
 */
function blockScalarSlots(lines: readonly Line[]): StructuredSlot[] {
  const out: StructuredSlot[] = [];
  for (const [index, line] of lines.entries()) {
    const colon = COLON_KEY.exec(line.text);
    if (colon?.[1] === undefined) continue;
    const remainder = line.text.slice(colon[0].length).trim();
    if (!BLOCK_SCALAR.test(remainder)) continue;

    const indent = line.text.length - line.text.trimStart().length;
    let last: Line | undefined;
    for (let i = index + 1; i < lines.length; i += 1) {
      const next = lines[i];
      if (next === undefined) break;
      const blank = next.text.trim().length === 0;
      const deeper = next.text.length - next.text.trimStart().length > indent;
      if (!blank && !deeper) break;
      if (!blank) last = next;
    }
    if (last === undefined) continue;

    const first = lines[index + 1];
    if (first === undefined) continue;
    out.push({
      key: colon[1].trim(),
      kind: 'yaml',
      valueStart: first.offset,
      valueEnd: last.offset + last.text.length,
    });
  }
  return out;
}

/**
 * Whitespace-delimited credential files (.netrc, .authinfo).
 *
 * Gated on the document actually looking like one: a general "first word is
 * the key" rule would make every prose sentence's first word a key.
 */
function netrcSlots(text: string, lines: readonly Line[]): StructuredSlot[] {
  if (!NETRC_DOCUMENT.test(text)) return [];
  const out: StructuredSlot[] = [];
  for (const line of lines) {
    const match = NETRC_PAIR.exec(line.text);
    if (match?.[1] === undefined || match[2] === undefined) continue;
    const valueStart = line.text.length - match[2].length;
    const range = trimValue(line.text, valueStart, line.text.length);
    if (range.end <= range.start) continue;
    out.push({
      key: match[1],
      kind: 'env',
      valueStart: line.offset + range.start,
      valueEnd: line.offset + range.end,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delimited tables (CSV, markdown)
// ─────────────────────────────────────────────────────────────────────────────

interface Cell {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Split a delimited line into cells with offsets, honouring double quotes so
 * that a comma inside a quoted CSV field does not create a phantom column and
 * shift every header association after it.
 */
function splitCells(line: Line, delimiter: string): Cell[] {
  const cells: Cell[] = [];
  let cellStart = 0;
  let quoted = false;
  for (let i = 0; i < line.text.length; i += 1) {
    const ch = line.text[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === delimiter && !quoted) {
      cells.push(makeCell(line, cellStart, i));
      cellStart = i + 1;
    }
  }
  cells.push(makeCell(line, cellStart, line.text.length));
  return cells;
}

function makeCell(line: Line, start: number, end: number): Cell {
  const range = trimValue(line.text, start, end);
  return {
    text: line.text.slice(range.start, range.end),
    start: line.offset + range.start,
    end: line.offset + range.end,
  };
}

/** A markdown separator row: `| --- | :---: |`. */
function isTableSeparator(text: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(text);
}

function markdownTableSlots(lines: readonly Line[]): StructuredSlot[] {
  const out: StructuredSlot[] = [];
  for (let i = 0; i + 1 < lines.length; i += 1) {
    const header = lines[i];
    const separator = lines[i + 1];
    if (header === undefined || separator === undefined) continue;
    if (!header.text.includes('|') || !isTableSeparator(separator.text)) continue;

    const headers = splitCells(header, '|').map((c) => c.text);
    let row = i + 2;
    for (; row < lines.length; row += 1) {
      const line = lines[row];
      if (line === undefined || !line.text.includes('|')) break;
      appendCellSlots(splitCells(line, '|'), headers, 'markdown-table', out);
    }
    i = row - 1;
  }
  return out;
}

/**
 * CSV column headers. Only applied when the document as a whole looks like a
 * comma-delimited table, because a single prose line containing commas is not
 * a CSV and must not lend its first words to every following line as "headers".
 */
function csvSlots(lines: readonly Line[]): StructuredSlot[] {
  const dataLines = lines.filter((l) => l.text.trim().length > 0);
  if (dataLines.length < MIN_CSV_ROWS) return [];

  const header = dataLines[0];
  if (header === undefined) return [];
  const headerCells = splitCells(header, ',');
  if (headerCells.length < 2) return [];
  // Headers are labels, not data: they should not look like values.
  if (headerCells.some((c) => c.text.length === 0 || c.text.length > MAX_KEY_LENGTH)) return [];

  const expected = headerCells.length;
  const consistent = dataLines
    .slice(1)
    .every((l) => splitCells(l, ',').length === expected);
  if (!consistent) return [];

  const headers = headerCells.map((c) => c.text);
  const out: StructuredSlot[] = [];
  for (const line of dataLines.slice(1)) {
    appendCellSlots(splitCells(line, ','), headers, 'csv', out);
  }
  return out;
}

function appendCellSlots(
  cells: readonly Cell[],
  headers: readonly string[],
  kind: StructureKind,
  out: StructuredSlot[],
): void {
  for (const [index, cell] of cells.entries()) {
    const key = headers[index];
    if (key === undefined || key.length === 0) continue;
    if (cell.end <= cell.start) continue;
    out.push({ key, kind, valueStart: cell.start, valueEnd: cell.end });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Index construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the structural index for a document.
 *
 * Slots may overlap — a CSV cell and a colon-form label can both cover a span.
 * `slotAt` resolves that by returning the SMALLEST containing slot, which is
 * the most specific label for the value.
 */
export function buildStructureIndex(text: string): StructureIndex {
  const rawLines = splitLines(text);
  // In a diff, every line carries a +/-/space marker that would otherwise
  // hide the key. Stripping is gated on the document actually being a diff,
  // so an ordinary line beginning with '-' is untouched. A newly added
  // `+API_KEY=…` line is exactly the shape of a leaked credential in a paste.
  const isDiff = DIFF_DOCUMENT.test(text);
  const lines = isDiff ? rawLines.map(stripDiffMarker) : rawLines;

  const slots: StructuredSlot[] = [];
  for (const line of lines) {
    const kv = keyValueSlot(line);
    if (kv !== undefined && kv.valueEnd > kv.valueStart) slots.push(kv);
    slots.push(...codeAssignmentSlots(line));
    slots.push(...inlineSlots(line));
    slots.push(...jsonInlineSlots(line));
  }
  slots.push(...blockScalarSlots(lines));
  slots.push(...netrcSlots(text, lines));
  slots.push(...markdownTableSlots(lines));
  slots.push(...csvSlots(lines));

  slots.sort((a, b) => a.valueStart - b.valueStart || a.valueEnd - b.valueEnd);

  return {
    slots,
    slotAt(start: number, end: number): StructuredSlot | undefined {
      let best: StructuredSlot | undefined;
      for (const slot of slots) {
        if (slot.valueStart > start) break;
        if (slot.valueEnd < end) continue;
        if (best === undefined || slot.valueEnd - slot.valueStart < best.valueEnd - best.valueStart) {
          best = slot;
        }
      }
      return best;
    },
  };
}
