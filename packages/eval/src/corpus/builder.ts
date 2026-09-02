/**
 * The corpus builder: seeded, deterministic labeled documents.
 *
 * Spans are recorded AT APPEND TIME in original-text coordinates, so they
 * are exact by construction — no post-hoc searching that could mislabel a
 * value that happens to appear twice. A small fraction of inline entities
 * get a zero-width space injected INSIDE the value (never at the edges):
 * Stage 0 strips it, the detector validates the clean form, and the
 * reported original span must still cover the obfuscated run — the corpus
 * exercises the offset map end to end.
 */

import { generate } from '@discretion/core';
import type { DocType, GroundTruthEntity, LabeledDocument } from './types.js';
import { DOC_TYPES } from './types.js';
import type { EntityKind } from './entityBank.js';
import { ENTITY_BANK, kindsForLanguage } from './entityBank.js';
import type { LanguageBank } from './languages.js';
import { LANGUAGES } from './languages.js';
import type { NerBank } from './nerBank.js';
import { nerBankFor } from './nerBank.js';

const ZWSP = '​';

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function int(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Weighted pick over the entity bank. Language-affine kinds get a ×3 boost:
 * they are only ever candidates inside their own language's documents
 * (a small slice of the corpus), while global kinds compete everywhere —
 * without the boost the rare national schemes starve.
 */
function pickKind(rng: () => number, kinds: readonly EntityKind[]): EntityKind {
  const weightOf = (k: EntityKind): number => (k.weight ?? 1) * (k.languages !== undefined ? 3 : 1);
  const total = kinds.reduce((s, k) => s + weightOf(k), 0);
  let roll = rng() * total;
  for (const k of kinds) {
    roll -= weightOf(k);
    if (roll <= 0) return k;
  }
  return kinds[kinds.length - 1]!;
}

/**
 * Languages whose readers routinely write numbers in their own script's
 * digits, mapped to the first code point of that digit block.
 *
 * These exist in the corpus because Stage 0 digit folding (M8) exists: before
 * it, an identifier written in native digits was invisible to every Stage 1
 * detector, and the corpus could not see the class at all, so the failure was
 * unmeasurable rather than merely unfixed. Hebrew is absent deliberately —
 * Hebrew uses ASCII digits in ordinary writing.
 */
const NATIVE_DIGIT_ZERO: Readonly<Record<string, number>> = {
  ar: 0x0660, // Arabic-Indic
  fa: 0x06f0, // Extended Arabic-Indic (Persian)
  ur: 0x06f0, // Extended Arabic-Indic (Urdu)
  hi: 0x0966, // Devanagari
  bn: 0x09e6, // Bengali
  th: 0x0e50, // Thai
};

/**
 * Fraction of planted values rewritten into native digits, for those
 * languages. Not 100%: real documents mix both, and a corpus that used native
 * digits exclusively would stop measuring the ASCII path in those languages.
 */
const NATIVE_DIGIT_RATE = 0.4;

/**
 * Rewrite ASCII digits into a script's own digits, one code unit for one.
 *
 * Every block here is in the BMP, so this preserves length and therefore every
 * ground-truth offset already computed for the value.
 */
function toNativeDigits(value: string, zero: number): string {
  return value.replace(/[0-9]/g, (d) => String.fromCodePoint(zero + Number(d)));
}

/** Accumulates text and records ground-truth spans as values are appended. */
class DocBuilder {
  /**
   * Digit-block zero when this document's language writes native digits.
   * Held on the builder rather than threaded through twenty appendEntity
   * call sites, all of which would otherwise have to remember to pass it.
   */
  constructor(private readonly nativeZero?: number) {}

  private readonly parts: string[] = [];
  private length = 0;
  private readonly entities: GroundTruthEntity[] = [];

  append(text: string): void {
    this.parts.push(text);
    this.length += text.length;
  }

  /** Append a generated entity value, recording its exact span. */
  appendEntity(kind: EntityKind, rng: () => number, obfuscate: boolean): void {
    let value = kind.generate(Math.floor(rng() * 2 ** 31));
    let obfuscated = false;

    // Interior-only zero-width injection; edges would shift what D7's
    // absorption rule attributes to the neighbouring clusters.
    if (obfuscate && kind.placement === 'inline' && kind.valuePattern === undefined && value.length >= 6) {
      const at = int(rng, 2, value.length - 2);
      value = value.slice(0, at) + ZWSP + value.slice(at);
      obfuscated = true;
    }

    let gtStart = this.length;
    let gtEnd = this.length + value.length;
    if (kind.valuePattern !== undefined) {
      const m = kind.valuePattern.exec(value);
      if (m !== null) {
        gtStart = this.length + m.index;
        gtEnd = gtStart + m[0].length;
      }
    }

    // Rewrite to native digits AFTER the span has been located: the value
    // pattern is written against ASCII digits, and the rewrite is one code
    // unit for one, so the offsets computed above stay correct.
    if (this.nativeZero !== undefined && rng() < NATIVE_DIGIT_RATE) {
      value = toNativeDigits(value, this.nativeZero);
    }

    this.entities.push({
      type: kind.type,
      scheme: kind.kind,
      text: value.slice(gtStart - this.length, gtEnd - this.length),
      start: gtStart,
      end: gtEnd,
      obfuscated,
    });
    this.append(value);
  }

  /** Append a literal value (an NER name/org/place), recording its span. */
  appendSpan(type: GroundTruthEntity['type'], scheme: string, value: string): void {
    this.entities.push({
      type,
      scheme,
      text: value,
      start: this.length,
      end: this.length + value.length,
      obfuscated: false,
    });
    this.append(value);
  }

  build(id: string, language: string, docType: DocType, hardNegative = false): LabeledDocument {
    return {
      id,
      language,
      docType,
      text: this.parts.join(''),
      entities: this.entities,
      hardNegative,
    };
  }
}

/** Append one carrier sentence with its entity planted in the {E} slot. */
function carrierLine(b: DocBuilder, lang: LanguageBank, kind: EntityKind, rng: () => number, obf: boolean): void {
  const carrier = pick(rng, lang.carriers);
  const slot = carrier.indexOf('{E}');
  b.append(carrier.slice(0, slot));
  b.appendEntity(kind, rng, obf);
  b.append(carrier.slice(slot + 3));
}

interface BuildContext {
  readonly rng: () => number;
  readonly lang: LanguageBank;
  readonly kinds: readonly EntityKind[];
  readonly obfuscationRate: number;
  /**
   * NER planting (people/orgs/locations) draws from its OWN rng stream so
   * that, for a given seed, the Stage 1 value draws are byte-identical to
   * the pre-M6 corpus — the M3 regression gates keep measuring the same
   * identifiers, just in documents that now also contain named entities.
   */
  readonly ner?: { readonly bank: NerBank; readonly rng: () => number };
}

type NerSlot = 'P' | 'O' | 'L';

const NER_TYPE: Readonly<Record<NerSlot, { type: 'PERSON' | 'ORG' | 'LOCATION'; scheme: string }>> = {
  P: { type: 'PERSON', scheme: 'ner-person' },
  O: { type: 'ORG', scheme: 'ner-org' },
  L: { type: 'LOCATION', scheme: 'ner-location' },
};

/** Append one NER carrier sentence with its entity planted in the slot. */
function nerLine(b: DocBuilder, ctx: BuildContext, slot: NerSlot): void {
  if (ctx.ner === undefined) return;
  const { bank, rng } = ctx.ner;
  const carriers = slot === 'P' ? bank.personCarriers : slot === 'O' ? bank.orgCarriers : bank.locationCarriers;
  const values = slot === 'P' ? bank.people : slot === 'O' ? bank.orgs : bank.locations;
  const carrier = pick(rng, carriers);
  const at = carrier.indexOf(`{${slot}}`);
  b.append(carrier.slice(0, at));
  b.appendSpan(NER_TYPE[slot].type, NER_TYPE[slot].scheme, pick(rng, values));
  b.append(carrier.slice(at + 3));
}

/** A random NER slot, weighted toward PERSON (the hardest, commonest type). */
function pickNerSlot(rng: () => number): NerSlot {
  const roll = rng();
  return roll < 0.5 ? 'P' : roll < 0.75 ? 'O' : 'L';
}

const inlineOnly = (kinds: readonly EntityKind[]): readonly EntityKind[] =>
  kinds.filter((k) => k.placement === 'inline');

function obf(ctx: BuildContext): boolean {
  return ctx.rng() < ctx.obfuscationRate;
}

// ── document-type builders ──────────────────────────────────────────────────

function buildProse(b: DocBuilder, ctx: BuildContext): void {
  const n = int(ctx.rng, 2, 4);
  for (let i = 0; i < n; i++) {
    if (ctx.rng() < 0.35) {
      b.append(pick(ctx.rng, ctx.lang.fillers));
    } else {
      carrierLine(b, ctx.lang, pickKind(ctx.rng, inlineOnly(ctx.kinds)), ctx.rng, obf(ctx));
    }
    b.append(' ');
  }
  if (ctx.ner !== undefined) {
    const m = int(ctx.ner.rng, 1, 2);
    for (let i = 0; i < m; i++) {
      nerLine(b, ctx, pickNerSlot(ctx.ner.rng));
      b.append(' ');
    }
  }
}

function buildEmail(b: DocBuilder, ctx: BuildContext): void {
  b.append(`${ctx.lang.greeting}\n\n`);
  const n = int(ctx.rng, 1, 3);
  for (let i = 0; i < n; i++) {
    carrierLine(b, ctx.lang, pickKind(ctx.rng, inlineOnly(ctx.kinds)), ctx.rng, obf(ctx));
    b.append('\n');
  }
  if (ctx.ner !== undefined && ctx.ner.rng() < 0.5) {
    nerLine(b, ctx, pickNerSlot(ctx.ner.rng));
    b.append('\n');
  }
  b.append(`${pick(ctx.rng, ctx.lang.fillers)}\n\n${ctx.lang.signoff}\n`);
  // Signature block: the sender's name, a phone, and an email — the way
  // real signatures leak.
  if (ctx.ner !== undefined) {
    b.appendSpan('PERSON', 'ner-person', pick(ctx.ner.rng, ctx.ner.bank.people));
    b.append('\n');
  }
  const phone = ctx.kinds.find((k) => k.kind === 'phone');
  const email = ctx.kinds.find((k) => k.kind === 'email');
  if (phone !== undefined) {
    b.append('Tel: ');
    b.appendEntity(phone, ctx.rng, false);
    b.append('\n');
  }
  if (email !== undefined) {
    b.appendEntity(email, ctx.rng, false);
    b.append('\n');
  }
}

function buildCode(b: DocBuilder, ctx: BuildContext): void {
  const kinds = inlineOnly(ctx.kinds);
  const js = ctx.rng() < 0.5;
  b.append(js ? '// service configuration\n' : '# service configuration\n');
  const key = pickKind(ctx.rng, kinds);
  b.append(js ? 'const apiKey = "' : 'API_KEY = "');
  b.appendEntity(key, ctx.rng, false);
  b.append(js ? '";\n' : '"\n');
  b.append(js ? `// ${pick(ctx.rng, ctx.lang.fillers)}\n` : `# ${pick(ctx.rng, ctx.lang.fillers)}\n`);
  const second = pickKind(ctx.rng, kinds);
  b.append(js ? 'const endpoint = "' : 'ENDPOINT = "');
  b.appendEntity(second, ctx.rng, false);
  b.append(js ? '";\nexport default { apiKey, endpoint };\n' : '"\n');
  // A PEM block sometimes lives in code files.
  const pem = ctx.kinds.find((k) => k.kind === 'pem');
  if (pem !== undefined && ctx.rng() < 0.3) {
    b.append(js ? 'const privateKey = `\n' : 'PRIVATE_KEY = """\n');
    b.appendEntity(pem, ctx.rng, false);
    b.append(js ? '\n`;\n' : '\n"""\n');
  }
}

function buildJson(b: DocBuilder, ctx: BuildContext): void {
  const kinds = inlineOnly(ctx.kinds);
  b.append('{\n  "account": {\n    "contact": "');
  b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
  b.append('",\n    "reference": "');
  b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
  b.append(`",\n    "note": "${pick(ctx.rng, ctx.lang.fillers).replace(/"/g, "'")}"\n  },\n  "active": true\n}\n`);
}

function buildYaml(b: DocBuilder, ctx: BuildContext): void {
  const kinds = inlineOnly(ctx.kinds);
  b.append('service:\n  owner_contact: ');
  b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
  b.append('\n  billing_id: ');
  b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
  b.append(`\n  note: ${pick(ctx.rng, ctx.lang.fillers)}\n  replicas: 3\n`);
}

function buildCsv(b: DocBuilder, ctx: BuildContext): void {
  const kinds = inlineOnly(ctx.kinds);
  b.append('row,contact,identifier,status\n');
  const rows = int(ctx.rng, 2, 3);
  for (let i = 1; i <= rows; i++) {
    b.append(`${i},`);
    b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
    b.append(',');
    b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
    b.append(',ok\n');
  }
}

function buildLog(b: DocBuilder, ctx: BuildContext): void {
  const kinds = inlineOnly(ctx.kinds);
  const n = int(ctx.rng, 3, 5);
  for (let i = 0; i < n; i++) {
    const hh = String(int(ctx.rng, 10, 23));
    const mm = String(int(ctx.rng, 10, 59));
    b.append(`2026-08-2${int(ctx.rng, 0, 6)}T${hh}:${mm}:0${int(ctx.rng, 0, 9)}Z INFO `);
    if (ctx.rng() < 0.6) {
      b.append('request from ');
      b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
      b.append(' accepted\n');
    } else {
      b.append('healthcheck ok latency=12ms\n');
    }
  }
}

function buildMedical(b: DocBuilder, ctx: BuildContext): void {
  const lab = ctx.kinds.find((k) => k.kind === 'lab-result');
  const sctid = ctx.kinds.find((k) => k.kind === 'sctid');
  carrierLine(b, ctx.lang, pickKind(ctx.rng, inlineOnly(ctx.kinds)), ctx.rng, false);
  b.append('\n');
  if (lab !== undefined) {
    b.append('HbA1c ');
    b.appendEntity(lab, ctx.rng, false);
    b.append('\n');
  }
  if (sctid !== undefined && ctx.rng() < 0.5) {
    b.append('SNOMED ');
    b.appendEntity(sctid, ctx.rng, false);
    b.append('\n');
  }
  if (ctx.ner !== undefined) {
    nerLine(b, ctx, 'P');
    b.append('\n');
  }
  b.append(`${pick(ctx.rng, ctx.lang.fillers)}\n`);
}

function buildContract(b: DocBuilder, ctx: BuildContext): void {
  const kinds = inlineOnly(ctx.kinds);
  b.append(`1. ${pick(ctx.rng, ctx.lang.fillers)}\n2. `);
  carrierLine(b, ctx.lang, pickKind(ctx.rng, kinds), ctx.rng, obf(ctx));
  b.append('\n3. ');
  carrierLine(b, ctx.lang, pickKind(ctx.rng, kinds), ctx.rng, false);
  b.append('\n');
  if (ctx.ner !== undefined) {
    b.append('4. ');
    nerLine(b, ctx, 'O');
    b.append('\n5. ');
    nerLine(b, ctx, 'P');
    b.append('\n');
  }
}

function buildCv(b: DocBuilder, ctx: BuildContext): void {
  const email = ctx.kinds.find((k) => k.kind === 'email');
  const phone = ctx.kinds.find((k) => k.kind === 'phone');
  const street = ctx.kinds.find((k) => k.kind === 'street');
  b.append('Curriculum Vitae\n');
  if (ctx.ner !== undefined) {
    b.appendSpan('PERSON', 'ner-person', pick(ctx.ner.rng, ctx.ner.bank.people));
    b.append('\n');
    if (ctx.ner.rng() < 0.6) {
      nerLine(b, ctx, 'L');
      b.append('\n');
    }
  }
  if (email !== undefined) {
    b.append('Email: ');
    b.appendEntity(email, ctx.rng, false);
    b.append('\n');
  }
  if (phone !== undefined) {
    b.append('Tel: ');
    b.appendEntity(phone, ctx.rng, false);
    b.append('\n');
  }
  if (street !== undefined && ctx.rng() < 0.6) {
    b.appendEntity(street, ctx.rng, false);
    b.append('\n');
  }
  b.append(`\n${pick(ctx.rng, ctx.lang.fillers)}\n`);
}

function buildMarkdownTable(b: DocBuilder, ctx: BuildContext): void {
  const kinds = inlineOnly(ctx.kinds);
  b.append('| field | value |\n| --- | --- |\n| contact | ');
  b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
  b.append(' |\n| reference | ');
  b.appendEntity(pickKind(ctx.rng, kinds), ctx.rng, false);
  b.append(' |\n');
  // MRZ blocks appear in scanned-document transcriptions like tables.
  const mrz = ctx.kinds.find((k) => k.kind === 'mrz-td3');
  if (mrz !== undefined && ctx.rng() < 0.25) {
    b.append('\n```\n');
    b.appendEntity(mrz, ctx.rng, false);
    b.append('\n```\n');
  }
}

const BUILDERS: Readonly<Record<DocType, (b: DocBuilder, ctx: BuildContext) => void>> = {
  prose: buildProse,
  email: buildEmail,
  code: buildCode,
  json: buildJson,
  yaml: buildYaml,
  csv: buildCsv,
  log: buildLog,
  medical: buildMedical,
  contract: buildContract,
  cv: buildCv,
  'markdown-table': buildMarkdownTable,
};

export interface CorpusOptions {
  readonly documents: number;
  readonly seed: number;
  /** Probability of interior zero-width obfuscation per eligible entity. */
  readonly obfuscationRate?: number;
  /** Coverage floor: every entity kind appears at least this often. */
  readonly minPerKind?: number;
}

/**
 * Deterministic labeled corpus: same options → identical documents.
 *
 * After the random documents, a COVERAGE PASS tops up every entity kind to
 * at least `minPerKind` occurrences with dedicated prose documents in an
 * affine language — per-type metrics are meaningless for a type the random
 * draw happened to skip. The pass is part of the same seeded stream, so
 * determinism holds.
 */
export function generateCorpus(options: CorpusOptions): LabeledDocument[] {
  const rng = generate.mulberry32(options.seed);
  // Forked stream for NER planting (see BuildContext.ner): keeps the Stage 1
  // value draws for a given seed identical to the pre-M6 corpus.
  const nerRng = generate.mulberry32(options.seed ^ 0x4e4552);
  const obfuscationRate = options.obfuscationRate ?? 0.08;
  const docs: LabeledDocument[] = [];
  const kindCounts = new Map<string, number>();

  const record = (doc: LabeledDocument): void => {
    for (const e of doc.entities) kindCounts.set(e.scheme, (kindCounts.get(e.scheme) ?? 0) + 1);
    docs.push(doc);
  };

  for (let i = 0; i < options.documents; i++) {
    const lang = pick(rng, LANGUAGES);
    const docType = pick(rng, DOC_TYPES);
    const b = new DocBuilder(NATIVE_DIGIT_ZERO[lang.code]);
    const bank = nerBankFor(lang.code);
    BUILDERS[docType](b, {
      rng,
      lang,
      kinds: kindsForLanguage(lang.code),
      obfuscationRate,
      ...(bank !== undefined ? { ner: { bank, rng: nerRng } } : {}),
    });
    record(b.build(`doc-${options.seed}-${i}`, lang.code, docType));
  }

  const minPerKind = options.minPerKind ?? 3;
  let extra = 0;
  for (const kind of ENTITY_BANK) {
    while ((kindCounts.get(kind.kind) ?? 0) < minPerKind) {
      const langCode = kind.languages?.[0] ?? 'en';
      const lang = LANGUAGES.find((l) => l.code === langCode)!;
      const b = new DocBuilder(NATIVE_DIGIT_ZERO[lang.code]);
      if (kind.placement === 'block') {
        b.append(`${pick(rng, lang.fillers)}\n`);
        b.appendEntity(kind, rng, false);
        b.append('\n');
      } else {
        carrierLine(b, lang, kind, rng, rng() < obfuscationRate);
        b.append(` ${pick(rng, lang.fillers)}`);
      }
      record(b.build(`doc-${options.seed}-cov-${extra++}`, lang.code, 'prose'));
    }
  }

  return docs;
}
