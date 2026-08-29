/**
 * The panel's stylesheet, scoped inside the shadow root.
 *
 * SPEC line 293: "All injected UI inside a shadow DOM so host CSS cannot break
 * it and it cannot break the host."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY EVERY STRUCTURAL DECLARATION IS `!important`, WHICH IS NOT STYLE
 *
 * The first version of this file wrote `all: initial` on `:host` and claimed
 * it reset every inherited property "in one stroke". That claim was wrong, and
 * the reason is the cascade rather than the property.
 *
 * In the CSS cascade, the ENCAPSULATION CONTEXT step is evaluated BEFORE
 * specificity, and for NORMAL declarations the OUTER tree wins over the inner
 * tree. So any page rule matching the host element — including a bare `*` at
 * specificity zero — defeats everything declared here. `!important` reverses
 * that step: for important declarations the INNER tree wins, and there is
 * nothing the page can write that outranks it.
 *
 * This is not hypothetical. Dark-mode extensions and user stylesheets inject
 * `* { … !important }` as a matter of course. Without this, such a page:
 *   - restyles the panel through inherited properties (the failure this file
 *     exists to prevent), and
 *   - can override `position: fixed`, which drops the host into flow as the
 *     last child of <body>, adding its height to the document and lengthening
 *     page scroll — the panel breaking the HOST, which is the other half of
 *     SPEC line 293, and
 *   - can override the hidden state's `display: none`, leaving an empty
 *     bordered band pinned over the composer that swallows clicks.
 *
 * all is also not quite "all": it resets every property EXCEPT `direction`
 * and `unicode-bidi`, both of which inherit and both of which cross the
 * boundary. An RTL host would otherwise mirror the panel. They are pinned
 * explicitly.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const PANEL_STYLES = `
/* The reset, alone, so the structural rule below can override the longhands
   all expands to. Order matters here. */
:host { all: initial !important; }

:host {
  /* all does not touch these two, and both inherit across the boundary. */
  direction: ltr !important;
  unicode-bidi: isolate !important;

  position: fixed !important;
  z-index: 2147483000 !important;
  display: block !important;
  /* The host box is a positioning shell; it must never intercept clicks meant
     for the page underneath. The panel re-enables them for itself. */
  pointer-events: none !important;

  /* Custom properties are untouched by all, so the palette survives. */
  --ps-bg: #ffffff;
  --ps-fg: #1b1f24;
  --ps-muted: #5b6672;
  --ps-border: #d4dae1;
  --ps-shadow: rgba(16, 24, 40, 0.18);
  --ps-accent: #1c4f7c;
  --ps-warn-bg: #fdf3e7;
  --ps-warn-fg: #7a4a12;
  --ps-warn-border: #e6c79a;
  --ps-focus: #1c4f7c;
  --ps-max-h: 45vh;
}

:host([data-theme='dark']) {
  --ps-bg: #1e2227;
  --ps-fg: #e7ebef;
  --ps-muted: #9aa5b1;
  --ps-border: #39414a;
  --ps-shadow: rgba(0, 0, 0, 0.5);
  --ps-accent: #8ab4e8;
  --ps-warn-bg: #3a2f1e;
  --ps-warn-fg: #f0d3a4;
  --ps-warn-border: #6b5426;
  --ps-focus: #8ab4e8;
}

:host([data-hidden='true']) { display: none !important; }

*, *::before, *::after { box-sizing: border-box; }

.panel {
  pointer-events: auto;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: var(--ps-fg);
  background: var(--ps-bg);
  border: 1px solid var(--ps-border);
  border-radius: 10px;
  box-shadow: 0 6px 24px var(--ps-shadow);
  max-height: var(--ps-max-h);
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* The degraded alert offers no control and cannot be dismissed, so it must not
   sit between the user and the page it is reporting on. Readable, and
   transparent to the pointer. */
:host([data-state='degraded']) .panel { pointer-events: none; }

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--ps-border);
}

.title { font-weight: 600; }
.sub { color: var(--ps-muted); font-size: 12px; }

.items { list-style: none; margin: 0; padding: 4px 0; }

.item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  align-items: center;
  padding: 8px 12px;
}
.item + .item { border-top: 1px solid var(--ps-border); }

/* Reverted items are de-emphasised with a SOLID muted colour rather than
   opacity: opacity composites against the background and drops 13px text below
   WCAG AA in the light theme, so the item a user chose to keep unmasked would
   be the hardest one to read. */
.item[data-reverted='true'] .type,
.item[data-reverted='true'] .surrogate {
  color: var(--ps-muted);
  text-decoration: line-through;
}

.type { font-weight: 600; }
.explanation { grid-column: 1 / -1; color: var(--ps-muted); font-size: 12px; }
.surrogate {
  grid-column: 1 / -1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: var(--ps-accent);
  overflow-wrap: anywhere;
}
.confidence { color: var(--ps-muted); font-variant-numeric: tabular-nums; font-size: 12px; }

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 10px 12px;
  border-top: 1px solid var(--ps-border);
  position: sticky;
  bottom: 0;
  background: var(--ps-bg);
}

button {
  font: inherit;
  color: inherit;
  padding: 6px 14px;
  border-radius: 7px;
  border: 1px solid var(--ps-border);
  background: transparent;
  cursor: pointer;
}
button.primary { background: var(--ps-accent); border-color: var(--ps-accent); color: var(--ps-bg); font-weight: 600; }
button.link { border-color: transparent; padding: 2px 6px; color: var(--ps-accent); text-decoration: underline; }

/* Visible focus. .panel:focus is PLAIN :focus deliberately: the panel is
   focused programmatically when it opens, and :focus-visible is not guaranteed
   to match a programmatic focus — the indicator would be missing at exactly
   the moment focus moves somewhere the user did not put it. Buttons keep
   :focus-visible so a mouse click does not leave a ring behind. */
.panel:focus { outline: 2px solid var(--ps-focus); outline-offset: 2px; }
button:focus-visible,
[tabindex]:focus-visible { outline: 2px solid var(--ps-focus); outline-offset: 2px; }

.degraded {
  padding: 10px 12px;
  background: var(--ps-warn-bg);
  color: var(--ps-warn-fg);
  border-left: 3px solid var(--ps-warn-border);
}
.degraded .why { color: inherit; opacity: 0.85; font-size: 12px; margin-top: 4px; }

@media (prefers-reduced-motion: no-preference) {
  .panel { transition: opacity 120ms ease-out; }
}
`;
