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

/** `"key": value` — JSON, and JS object literals with quoted keys. */
const JSON_KEY = /^\s*"([^"\\]{1,48})"\s*:\s*/;

/**
 * `key: value` — YAML mappings, and form labels in prose ("Tel: +90…").
 * The key accepts any script's letters so that a Hebrew or Japanese form
 * label is recognized as readily as an English one; it forbids the digits-only
 * case so that a bare time ("09:30") is not read as a key/value pair.
 */
const COLON_KEY = /^[\s>-]*([\p{L}][\p{L}\p{M}\p{N} _.\\/-]{0,47})\s*:\s+(?=\S)/u;

/** `KEY=value`, `export KEY=value` — .env files and shell assignments. */
const ENV_KEY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]{0,47})\s*=\s*/;

/**
 * `const apiKey = "…"`, `apiKey = '…'`, `self.api_key = …` — assignments in
 * source code, anywhere on the line rather than only at its start.
 *
 * The whole dotted path is captured because the LAST segment is the label
 * that means something: in `user.ssn = …` the key is `ssn`, not `user`.
 */
const CODE_ASSIGNMENT =
  /(?:^|[\s;{(,[])(?:const|let|var|val|final|public|private|static|readonly)?\s*([A-Za-z_$][A-Za-z0-9_$]{0,47}(?:\.[A-Za-z_$][A-Za-z0-9_$]{0,47})*)\s*=\s*(?!=)/g;

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
  if (json?.[1] !== undefined) {
    return buildSlot(line, json[1], json[0].length, 'json');
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

  return undefined;
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
  const lines = splitLines(text);
  const slots: StructuredSlot[] = [];

  for (const line of lines) {
    const kv = keyValueSlot(line);
    if (kv !== undefined && kv.valueEnd > kv.valueStart) slots.push(kv);
    slots.push(...codeAssignmentSlots(line));
  }
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
