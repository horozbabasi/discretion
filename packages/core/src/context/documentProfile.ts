/**
 * Stage 3, DOCUMENT TYPE.
 *
 * SPEC.md: "DOCUMENT TYPE — detect whether input is prose, source code (and
 * which language), JSON, YAML, CSV, a log dump, a markdown table, or an email
 * thread. Each mode shifts weights. Code mode raises secret sensitivity and
 * lowers person-name sensitivity, since identifiers in code are usually not
 * people."
 *
 * Format detection is evidence-scored rather than first-match: several forms
 * genuinely overlap (a YAML file is a superset of many key/value shapes, a CV
 * in prose is full of "Label: value" lines that look like YAML), so each
 * candidate format accumulates evidence and the strongest wins. The evidence
 * strings are kept and reported, which is what makes a misclassification
 * diagnosable instead of mysterious.
 *
 * The DOMAIN axis is deliberately separate from format — see the note on
 * `DocumentDomain`. A medical record can arrive as prose, CSV, or JSON.
 */

import { buildStructureIndex, type StructureIndex } from './structure.js';
import { foldForMatch } from './triggers.js';
import type { DocumentDomain, DocumentFormat, DocumentProfile } from './types.js';

/** Domain terminology, keyed by domain then language. Supplied by the data package. */
export type DomainLexicon = Readonly<Partial<Record<Exclude<DocumentDomain, 'general'>, readonly string[]>>>;

/** Minimum distinct domain-term hits before a domain is claimed over 'general'. */
const MIN_DOMAIN_HITS = 2;

/** Fraction of non-empty lines a form must claim to be considered dominant. */
const DOMINANT_LINE_RATIO = 0.34;

interface FormatScore {
  format: DocumentFormat;
  score: number;
  evidence: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Line-level probes
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
/** ISO-8601, syslog, and bracketed-timestamp line starts. */
const LOG_TIMESTAMP =
  /^\s*[[(]?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}|[A-Z][a-z]{2} {1,2}\d{1,2} \d{2}:\d{2}:\d{2})/;
const LOG_LEVEL = /\b(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL|CRITICAL)\b/;
/** Keywords that are strong evidence of source code across common languages. */
const CODE_KEYWORD =
  /(^|\s)(const|let|var|function|return|import|from|export|class|def|public|private|static|void|struct|impl|fn|package|require|async|await|if|else|for|while|try|catch|throw|new)\b/;
const CODE_PUNCTUATION = /(=>|::|->|\)\s*\{|\{\s*$|;\s*$|\)\s*;)/;
const COMMENT_LINE = /^\s*(\/\/|#|\/\*|\*|--)/;
/** RFC-822-style headers that mark an email thread. */
const EMAIL_HEADER = /^\s*(From|To|Cc|Bcc|Subject|Date|Sent|Reply-To)\s*:\s+\S/i;
const EMAIL_QUOTE = /^\s*>+\s?\S/;

function nonEmptyLines(text: string): string[] {
  return text.split('\n').filter((l) => l.trim().length > 0);
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

// ─────────────────────────────────────────────────────────────────────────────
// Format scoring
// ─────────────────────────────────────────────────────────────────────────────

function scoreJson(text: string, lines: readonly string[], scores: FormatScore[]): void {
  const trimmed = text.trim();
  const braced = /^[[{]/.test(trimmed) && /[\]}]$/.test(trimmed);
  const keyLines = lines.filter((l) => /^\s*"[^"]+"\s*:/.test(l)).length;
  const keyRatio = ratio(keyLines, lines.length);
  if (!braced && keyRatio < DOMINANT_LINE_RATIO) return;

  const evidence: string[] = [];
  let score = 0;
  if (braced) {
    score += 2;
    evidence.push('wrapped in braces/brackets');
  }
  if (keyRatio >= DOMINANT_LINE_RATIO) {
    score += 2 + keyRatio;
    evidence.push(`${Math.round(keyRatio * 100)}% quoted-key lines`);
  }
  scores.push({ format: 'json', score, evidence });
}

function scoreYaml(lines: readonly string[], index: StructureIndex, scores: FormatScore[]): void {
  const yamlSlots = index.slots.filter((s) => s.kind === 'yaml').length;
  const yamlRatio = ratio(yamlSlots, lines.length);
  const documentMarker = lines.some((l) => /^---\s*$/.test(l));
  const indented = lines.filter((l) => /^\s+\S/.test(l)).length;
  if (yamlRatio < DOMINANT_LINE_RATIO && !documentMarker) return;

  const evidence: string[] = [];
  let score = 0;
  if (yamlRatio >= DOMINANT_LINE_RATIO) {
    score += 1.5 + yamlRatio;
    evidence.push(`${Math.round(yamlRatio * 100)}% identifier-key lines`);
  }
  if (documentMarker) {
    score += 1;
    evidence.push('--- document marker');
  }
  if (indented > 0) {
    score += 0.5;
    evidence.push('indented block structure');
  }
  scores.push({ format: 'yaml', score, evidence });
}

function scoreCsv(lines: readonly string[], scores: FormatScore[]): void {
  if (lines.length < 2) return;
  const counts = lines.map((l) => (l.match(/,/g) ?? []).length);
  const first = counts[0];
  if (first === undefined || first < 1) return;
  const consistent = counts.filter((c) => c === first).length;
  const consistentRatio = ratio(consistent, counts.length);
  if (consistentRatio < 0.8) return;

  scores.push({
    format: 'csv',
    score: 2 + first * 0.1 + consistentRatio,
    evidence: [`${consistent}/${counts.length} lines with ${first} commas`],
  });
}

function scoreMarkdownTable(lines: readonly string[], scores: FormatScore[]): void {
  const separators = lines.filter((l) => TABLE_SEPARATOR.test(l) && l.includes('-')).length;
  if (separators === 0) return;
  const piped = lines.filter((l) => l.includes('|')).length;
  scores.push({
    format: 'markdown-table',
    score: 2.5 + ratio(piped, lines.length),
    evidence: [`${separators} table separator row(s)`, `${piped} pipe-delimited lines`],
  });
}

function scoreLog(lines: readonly string[], scores: FormatScore[]): void {
  const stamped = lines.filter((l) => LOG_TIMESTAMP.test(l)).length;
  const levelled = lines.filter((l) => LOG_LEVEL.test(l)).length;
  const stampRatio = ratio(stamped, lines.length);
  if (stampRatio < DOMINANT_LINE_RATIO && ratio(levelled, lines.length) < DOMINANT_LINE_RATIO) return;

  const evidence: string[] = [];
  let score = 1;
  if (stampRatio > 0) {
    score += 1.5 + stampRatio;
    evidence.push(`${Math.round(stampRatio * 100)}% timestamped lines`);
  }
  if (levelled > 0) {
    score += ratio(levelled, lines.length);
    evidence.push(`${levelled} lines with a log level`);
  }
  scores.push({ format: 'log', score, evidence });
}

function scoreCode(lines: readonly string[], scores: FormatScore[]): void {
  const keyworded = lines.filter((l) => CODE_KEYWORD.test(l)).length;
  const punctuated = lines.filter((l) => CODE_PUNCTUATION.test(l)).length;
  const commented = lines.filter((l) => COMMENT_LINE.test(l)).length;
  const signal = ratio(keyworded + punctuated, lines.length);
  if (signal < 0.25) return;

  const evidence: string[] = [`${keyworded} keyword lines`, `${punctuated} code-punctuation lines`];
  if (commented > 0) evidence.push(`${commented} comment lines`);
  scores.push({ format: 'code', score: 1 + signal * 2, evidence });
}

function scoreEmail(lines: readonly string[], scores: FormatScore[]): void {
  const headers = lines.filter((l) => EMAIL_HEADER.test(l)).length;
  const quoted = lines.filter((l) => EMAIL_QUOTE.test(l)).length;
  if (headers < 2 && quoted === 0) return;

  const evidence: string[] = [];
  let score = 0;
  if (headers >= 2) {
    score += 2 + headers * 0.2;
    evidence.push(`${headers} message headers`);
  }
  if (quoted > 0) {
    score += 0.5;
    evidence.push(`${quoted} quoted-reply lines`);
  }
  scores.push({ format: 'email', score, evidence });
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain scoring
// ─────────────────────────────────────────────────────────────────────────────

function detectDomain(
  folded: string,
  lexicon: DomainLexicon,
): { domain: DocumentDomain; evidence: string[] } {
  let best: { domain: DocumentDomain; evidence: string[] } = { domain: 'general', evidence: [] };
  let bestCount = 0;

  for (const [domain, terms] of Object.entries(lexicon)) {
    const hits: string[] = [];
    for (const term of terms ?? []) {
      const folded_term = foldForMatch(term);
      if (folded_term.length > 0 && folded.includes(folded_term)) hits.push(folded_term);
    }
    if (hits.length > bestCount) {
      bestCount = hits.length;
      best = { domain: domain as DocumentDomain, evidence: hits.slice(0, 8) };
    }
  }

  return bestCount >= MIN_DOMAIN_HITS ? best : { domain: 'general', evidence: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a document's format and subject domain.
 *
 * `structureIndex` is accepted rather than rebuilt so callers that already
 * have one (the analyzer does) pay for it once.
 */
export function profileDocument(
  text: string,
  options: { readonly structureIndex?: StructureIndex; readonly domainLexicon?: DomainLexicon } = {},
): DocumentProfile {
  const lines = nonEmptyLines(text);
  const index = options.structureIndex ?? buildStructureIndex(text);

  const scores: FormatScore[] = [];
  scoreMarkdownTable(lines, scores);
  scoreJson(text, lines, scores);
  scoreCsv(lines, scores);
  scoreYaml(lines, index, scores);
  scoreLog(lines, scores);
  scoreCode(lines, scores);
  scoreEmail(lines, scores);

  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];

  const { domain, evidence: domainEvidence } = detectDomain(
    foldForMatch(text),
    options.domainLexicon ?? {},
  );

  if (winner === undefined) {
    return {
      format: lines.length > 0 ? 'prose' : 'unknown',
      domain,
      formatEvidence: lines.length > 0 ? ['no structural form matched'] : ['empty document'],
      domainEvidence,
    };
  }

  return { format: winner.format, domain, formatEvidence: winner.evidence, domainEvidence };
}
