/**
 * app.ts — the playground: input pane (textarea + highlight backdrop),
 * masked output pane, summary rail, mode toggle, loadable examples.
 *
 * HIGHLIGHTING OVER A TEXTAREA: a native textarea keeps real editing UX
 * (undo, IME, paste, selection), so highlights are drawn on a backdrop clone
 * positioned behind it — identical font metrics, transparent textarea text,
 * visible caret. Hover hit-testing uses document.elementsFromPoint, which
 * sees through the textarea to the marks beneath it.
 *
 * FAIL CLOSED, demonstrated: if core throws, the output pane shows a
 * blocking error state rather than falling back to the unmasked text.
 */

import type { SubstitutionMode } from '@privacyshield/core';
import type { AnalysisResult, AnalyzeFn } from './pipeline.js';
import { analyze as coreAnalyze, randomSessionSeed } from './pipeline.js';
import { buildExamples } from './examples.js';
import type { Example } from './examples.js';
import {
  buildInputSegments,
  buildOutputSegments,
  countByType,
  resolveForDisplay,
} from './segments.js';
import { el, setChildren } from './dom.js';
import { familyOf, labelOf } from './entityMeta.js';
import { Tooltip, candidateCard, replacementCard } from './tooltip.js';

const DEFAULT_DEBOUNCE_MS = 180;

export interface AppOptions {
  /** Injectable for tests; defaults to the real core pipeline. */
  readonly analyze?: AnalyzeFn;
  /** Fixed session seed for deterministic tests. */
  readonly seed?: number;
  readonly examples?: readonly Example[];
  readonly debounceMs?: number;
}

export interface App {
  readonly root: HTMLElement;
  /** Run any pending (debounced) analysis immediately. */
  flush(): void;
}

export function createApp(mount: HTMLElement, options: AppOptions = {}): App {
  const analyze = options.analyze ?? coreAnalyze;
  const seed = options.seed ?? randomSessionSeed();
  const examples = options.examples ?? buildExamples();
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  let mode: SubstitutionMode = 'surrogate';
  let composing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let displayed: ReturnType<typeof resolveForDisplay> = [];
  let outputEntities: AnalysisResult['maskResult']['entities'] = [];

  // ---- skeleton -----------------------------------------------------------

  // dir=auto on BOTH layers: each resolves base direction from the same text,
  // so RTL input aligns identically in the glyph layer and the edit layer.
  const backdrop = el('div', {
    class: 'pane-text editor-backdrop',
    'aria-hidden': 'true',
    dir: 'auto',
  });
  const textarea = el('textarea', {
    class: 'pane-text editor-input',
    'aria-label': 'Text to analyze',
    placeholder:
      'Paste or type anything — an email draft, a log excerpt, a contract clause.\nDetection runs as you type, entirely in this tab.',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    dir: 'auto',
  });

  const outputPane = el('div', {
    class: 'pane-text output-pane',
    role: 'region',
    'aria-label': 'Masked output',
    dir: 'auto',
  });

  const summaryBody = el('div', { class: 'summary-body' });
  const elapsedNote = el('span', { class: 'elapsed' });

  const surrogateBtn = el(
    'button',
    { class: 'mode-btn', type: 'button', 'aria-pressed': 'true' },
    'Surrogates',
  );
  const tokenBtn = el(
    'button',
    { class: 'mode-btn', type: 'button', 'aria-pressed': 'false' },
    'Tokens',
  );

  const exampleSelect = el('select', { class: 'example-select', 'aria-label': 'Load an example' });
  exampleSelect.append(el('option', { value: '' }, 'Load an example…'));
  examples.forEach((ex, i) => exampleSelect.append(el('option', { value: String(i) }, ex.title)));

  const root = el(
    'div',
    { class: 'app' },
    el(
      'header',
      { class: 'masthead' },
      el(
        'div',
        { class: 'masthead-title' },
        el('h1', {}, 'PrivacyShield'),
        el('p', { class: 'tagline' }, 'Paste text. See what it gives away. Send the masked version.'),
      ),
      el(
        'p',
        { class: 'masthead-note' },
        'Runs entirely in this tab — zero network, nothing stored. ',
        el('span', { class: 'masthead-scope' }, 'Stage 0–1 detection + substitution (M5 build).'),
      ),
    ),
    el(
      'div',
      { class: 'toolbar' },
      el('label', { class: 'toolbar-item' }, exampleSelect),
      el(
        'div',
        { class: 'toolbar-item mode-toggle', role: 'group', 'aria-label': 'Masking mode' },
        el('span', { class: 'mode-label' }, 'Masking'),
        surrogateBtn,
        tokenBtn,
      ),
      elapsedNote,
    ),
    el(
      'main',
      { class: 'panes' },
      el(
        'section',
        { class: 'pane pane-input' },
        el('h2', {}, 'Your text ', el('span', { class: 'pane-sub' }, 'detected entities highlighted')),
        el('div', { class: 'editor' }, backdrop, textarea),
      ),
      el(
        'section',
        { class: 'pane pane-output' },
        el('h2', {}, 'What would leave ', el('span', { class: 'pane-sub' }, 'masked')),
        outputPane,
      ),
      el(
        'aside',
        { class: 'summary', role: 'region', 'aria-label': 'Detection summary' },
        el('h2', {}, 'Found'),
        summaryBody,
        el(
          'p',
          { class: 'summary-footnote' },
          'Stage 1 only: validated identifiers, raw confidence. Names, addresses and context awareness arrive with M6–M7; calibration and sensitivity profiles with M8.',
        ),
      ),
    ),
    el(
      'footer',
      { class: 'colophon' },
      'PrivacyShield playground · detection and masking measured, not asserted — see the eval baseline in the repository.',
    ),
  );

  const tooltip = new Tooltip(root);
  mount.replaceChildren(root);

  // ---- rendering ----------------------------------------------------------

  /** Keep the glyph layer aligned with the textarea's scroll position. */
  function syncScroll(): void {
    backdrop.scrollTop = textarea.scrollTop;
    backdrop.scrollLeft = textarea.scrollLeft;
  }

  /**
   * Mirror the textarea's text into the backdrop SYNCHRONOUSLY, without
   * marks. The visible glyphs are the backdrop's (the textarea text is
   * transparent), so this must run on every input event — if only the
   * debounced analysis re-rendered the backdrop, the visible text would
   * freeze while the user types. Highlights return with the next analysis;
   * stale marks over shifted offsets would be wrong anyway.
   */
  function mirrorPlainText(): void {
    setChildren(backdrop, [textarea.value + '\u200B']);
    syncScroll();
  }

  function renderEmpty(): void {
    displayed = [];
    outputEntities = [];
    setChildren(backdrop, []);
    setChildren(outputPane, [
      el('p', { class: 'output-hint' }, 'The masked version of your text appears here.'),
    ]);
    setChildren(summaryBody, [el('p', { class: 'summary-empty' }, 'Nothing analyzed yet.')]);
    elapsedNote.textContent = '';
  }

  function renderError(err: unknown): void {
    displayed = [];
    outputEntities = [];
    // The user's text stays visible (unhighlighted); only the OUTPUT is
    // blocked — fail-closed guards what leaves, not what the user sees.
    mirrorPlainText();
    const message = err instanceof Error ? err.message : String(err);
    setChildren(outputPane, [
      el(
        'div',
        { class: 'fail-closed', role: 'alert' },
        el('strong', {}, 'Detection failed — this send would be blocked.'),
        el('p', {}, 'PrivacyShield fails closed: when detection cannot complete, nothing is allowed out.'),
        el('p', { class: 'fail-detail' }, message),
      ),
    ]);
    setChildren(summaryBody, [el('p', { class: 'summary-empty' }, 'Unavailable — detection failed.')]);
    elapsedNote.textContent = '';
  }

  function renderResult(result: AnalysisResult): void {
    displayed = resolveForDisplay(result.candidates);
    outputEntities = result.maskResult.entities;

    // Input backdrop: the exact textarea text, candidate spans marked.
    const inputNodes = buildInputSegments(result.original, displayed).map((seg) => {
      if (seg.candidate === undefined) return document.createTextNode(seg.text);
      const index = displayed.indexOf(seg.candidate);
      const cls = seg.candidate.sensitive
        ? `hl family-${familyOf(seg.candidate.type)}`
        : 'hl hl-test';
      return el('mark', { class: cls, 'data-i': String(index) }, seg.text);
    });
    // Sentinel (ZWSP) so a trailing newline still occupies a rendered line.
    setChildren(backdrop, [...inputNodes, '\u200B']);
    syncScroll();

    // Output pane: replacements marked; hover explains the substitution.
    const outputNodes = buildOutputSegments(result.original, outputEntities).map((seg) => {
      if (seg.entity === undefined) return document.createTextNode(seg.text);
      const index = outputEntities.indexOf(seg.entity);
      const flavor = seg.entity.fallback ? ' hl-fallback' : '';
      return el(
        'mark',
        { class: `hl family-${familyOf(seg.entity.type)}${flavor}`, 'data-o': String(index) },
        seg.text,
      );
    });
    if (outputNodes.length === 0) {
      setChildren(outputPane, [
        el('p', { class: 'output-hint' }, 'The masked version of your text appears here.'),
      ]);
    } else {
      setChildren(outputPane, outputNodes);
    }

    renderSummary(result);
  }

  function renderSummary(result: AnalysisResult): void {
    const counts = countByType(displayed);
    const maskedTotal = outputEntities.length;
    const detectedTotal = displayed.length;

    const rows = counts.map((row) =>
      el(
        'div',
        { class: 'summary-row' },
        el('span', { class: `chip family-${familyOf(row.type)}` }),
        el('span', { class: 'summary-type' }, labelOf(row.type)),
        el(
          'span',
          { class: 'summary-count' },
          String(row.masked),
          row.testValues > 0
            ? el('span', { class: 'summary-test' }, ` +${row.testValues} test`)
            : '',
        ),
      ),
    );

    setChildren(summaryBody, [
      el(
        'p',
        { class: 'summary-headline' },
        el('span', { class: 'summary-big' }, String(maskedTotal)),
        maskedTotal === 1 ? ' value masked' : ' values masked',
        detectedTotal > maskedTotal
          ? el('span', { class: 'summary-dim' }, ` · ${detectedTotal - maskedTotal} test value${detectedTotal - maskedTotal === 1 ? '' : 's'} left in place`)
          : '',
      ),
      ...(rows.length > 0
        ? rows
        : [el('p', { class: 'summary-empty' }, 'Nothing sensitive found in this text.')]),
    ]);
    elapsedNote.textContent = `${result.elapsedMs < 1 ? result.elapsedMs.toFixed(2) : result.elapsedMs.toFixed(1)} ms`;
  }

  // ---- analysis loop ------------------------------------------------------

  function run(): void {
    const text = textarea.value;
    if (text.length === 0) {
      renderEmpty();
      return;
    }
    try {
      renderResult(analyze(text, mode, seed));
    } catch (err) {
      renderError(err);
    }
  }

  function schedule(): void {
    if (composing) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      run();
    }, debounceMs);
  }

  function flush(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    run();
  }

  // ---- events -------------------------------------------------------------

  // The mirror runs on EVERY input — including during IME composition, so
  // in-progress compositions stay visible; only detection waits for the
  // composition to settle.
  textarea.addEventListener('input', () => {
    mirrorPlainText();
    schedule();
  });
  textarea.addEventListener('compositionstart', () => {
    composing = true;
  });
  textarea.addEventListener('compositionend', () => {
    composing = false;
    schedule();
  });
  textarea.addEventListener('scroll', syncScroll);

  function setMode(next: SubstitutionMode): void {
    if (mode === next) return;
    mode = next;
    surrogateBtn.setAttribute('aria-pressed', String(next === 'surrogate'));
    tokenBtn.setAttribute('aria-pressed', String(next === 'token'));
    flush();
  }
  surrogateBtn.addEventListener('click', () => setMode('surrogate'));
  tokenBtn.addEventListener('click', () => setMode('token'));

  exampleSelect.addEventListener('change', () => {
    // Re-selecting the placeholder must be a no-op: its value is '' and
    // Number('') is 0, which would otherwise load example 0 over the
    // user's text.
    if (exampleSelect.value === '') return;
    const example = examples[Number(exampleSelect.value)];
    if (example === undefined) return;
    textarea.value = example.text;
    flush();
  });

  // Input-pane hover: hit-test through the textarea to the backdrop marks.
  textarea.addEventListener('mousemove', (event) => {
    const stack = document.elementsFromPoint(event.clientX, event.clientY);
    const mark = stack.find((n): n is HTMLElement => n instanceof HTMLElement && n.matches('mark[data-i]'));
    const candidate = mark === undefined ? undefined : displayed[Number(mark.dataset['i'])];
    if (candidate === undefined) {
      tooltip.hide();
      return;
    }
    tooltip.show(candidateCard(candidate), event.clientX, event.clientY);
  });
  textarea.addEventListener('mouseleave', () => tooltip.hide());

  // Output-pane hover: plain event delegation.
  outputPane.addEventListener('mousemove', (event) => {
    const target = event.target;
    const mark = target instanceof HTMLElement ? target.closest('mark[data-o]') : null;
    const entity = mark instanceof HTMLElement ? outputEntities[Number(mark.dataset['o'])] : undefined;
    if (entity === undefined) {
      tooltip.hide();
      return;
    }
    tooltip.show(replacementCard(entity), event.clientX, event.clientY);
  });
  outputPane.addEventListener('mouseleave', () => tooltip.hide());

  renderEmpty();
  return { root, flush };
}
