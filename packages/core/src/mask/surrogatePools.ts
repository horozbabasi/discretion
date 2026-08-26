/**
 * Starter surrogate pools for the NER entity types (PERSON, ORG, LOCATION)
 * and dates.
 *
 * These types are produced by Stage 2 (M6), which does not exist yet, so
 * nothing in the M4 pipeline reaches them — but SPEC.md's substitution table
 * requires them, and building the pools now lets the surrogate registry be
 * complete and lets M6 plug in without touching this file's consumers.
 *
 * PERSON pools are grouped by SCRIPT and broad naming convention so that
 * "Yuki Tanaka" is replaced by another East-Asian-convention name rather than
 * "Bob Smith" (SPEC.md's explicit example). These are deliberately small,
 * hand-picked, unmistakably-fictional pools; M7's gazetteers replace them
 * with broad real-name coverage. Recorded in ARCHITECTURE.md D12.
 */

import type { ScriptName } from '../types.js';

export interface PersonPool {
  readonly script: ScriptName;
  readonly given: readonly string[];
  readonly surnames: readonly string[];
  /** Order: given-first (Western) or family-first (East Asian). */
  readonly order: 'given-first' | 'family-first';
  /** Separator between the two parts. */
  readonly sep: string;
}

export const PERSON_POOLS: readonly PersonPool[] = [
  {
    script: 'latin', order: 'given-first', sep: ' ',
    given: ['Alex', 'Maria', 'Sofia', 'Lucas', 'Elena', 'Marco', 'Nadia', 'Oscar', 'Petra', 'Ravi'],
    surnames: ['Fontaine', 'Delacroix', 'Marchetti', 'Ellison', 'Vandel', 'Rourke', 'Sandoval', 'Keller'],
  },
  {
    script: 'cyrillic', order: 'given-first', sep: ' ',
    given: ['Ирина', 'Дмитрий', 'Ольга', 'Сергей', 'Наталья', 'Павел'],
    surnames: ['Соколова', 'Морозов', 'Волкова', 'Лебедев', 'Козлова', 'Новиков'],
  },
  {
    script: 'greek', order: 'given-first', sep: ' ',
    given: ['Γιώργος', 'Ελένη', 'Νίκος', 'Μαρία', 'Κώστας'],
    surnames: ['Παπαδόπουλος', 'Νικολάου', 'Γεωργίου', 'Δημητρίου'],
  },
  {
    script: 'arabic', order: 'given-first', sep: ' ',
    given: ['ليلى', 'أحمد', 'فاطمة', 'يوسف', 'زينب'],
    surnames: ['الحسن', 'المنصور', 'الصالح', 'الرشيد'],
  },
  {
    script: 'hebrew', order: 'given-first', sep: ' ',
    given: ['נועה', 'איתי', 'תמר', 'יונתן'],
    surnames: ['לוי', 'כהן', 'פרץ', 'ביטון'],
  },
  {
    script: 'devanagari', order: 'given-first', sep: ' ',
    given: ['आरव', 'दिया', 'विवान', 'सान्या'],
    surnames: ['शर्मा', 'वर्मा', 'गुप्ता', 'सिंह'],
  },
  {
    script: 'han', order: 'family-first', sep: '',
    given: ['伟', '芳', '娜', '强', '敏', '静'],
    surnames: ['王', '李', '张', '刘', '陈'],
  },
  {
    script: 'kana', order: 'family-first', sep: '',
    given: ['ゆき', 'はると', 'さくら', 'れん'],
    surnames: ['田中', '佐藤', '鈴木', '高橋'],
  },
  {
    script: 'hangul', order: 'family-first', sep: '',
    given: ['민준', '서연', '지호', '하은'],
    surnames: ['김', '이', '박', '최'],
  },
  {
    script: 'thai', order: 'given-first', sep: ' ',
    given: ['สมชาย', 'สุดา', 'ประเสริฐ'],
    surnames: ['แซ่ตั้ง', 'ศรีสุข', 'บุญมี'],
  },
];

/** Fallback pool when a detected script has no dedicated one. */
export const DEFAULT_PERSON_POOL = PERSON_POOLS[0]!;

/** Plausible fictional organization names. */
export const ORG_POOL: readonly string[] = [
  'Northwind Systems', 'Brightpath Analytics', 'Cedar Grove Holdings', 'Meridian Labs',
  'Quillfeather & Co.', 'Ashford Logistics', 'Blue Harbor Partners', 'Vireo Technologies',
  'Sunspire Media', 'Gravel & Stone LLC',
];

/** Plausible fictional place names (cities). */
export const LOCATION_POOL: readonly string[] = [
  'Fairmont', 'Elderbrook', 'Port Haven', 'Westmere', 'Ashville Bay',
  'Cranleigh', 'Thornbury', 'Riverton', 'Oakmoor', 'Silverdale',
];
