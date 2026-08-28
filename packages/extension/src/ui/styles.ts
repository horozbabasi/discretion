/**
 * The panel's stylesheet, scoped entirely inside the shadow root.
 *
 * SPEC line 293: "All injected UI inside a shadow DOM so host CSS cannot break
 * it and it cannot break the host."
 *
 * Shadow encapsulation gives the second half for free — nothing here can leak
 * out. The first half needs care that the shadow boundary does NOT give:
 * INHERITED properties still cross it. `font-family`, `color`, `line-height`,
 * `letter-spacing`, `visibility` and `direction` all inherit from the host
 * element, so a site with `body { font-family: ComicSans; letter-spacing: 3px }`
 * restyles the panel through the boundary unless every inherited property is
 * reset at `:host`.
 *
 * `all: initial` on `:host` is the blunt instrument for that, and it is used
 * deliberately in preference to naming each property: a list of resets is a
 * list someone must keep complete, and the failure mode is silent and only
 * visible on the one site that sets the property nobody thought of.
 */
export const PANEL_STYLES = `
:host {
  /* Every inherited property, reset in one stroke. See the header. */
  all: initial;
  position: fixed;
  z-index: 2147483000;
  display: block;
  /* The host box is a positioning shell only; it must never intercept
     clicks meant for the page underneath it. The panel re-enables them. */
  pointer-events: none;
}

:host([data-hidden='true']) { display: none; }

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
  max-height: 45vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Light is the default; dark overrides. Both are explicit so neither
   depends on what the host happens to define. */
:host {
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
.item[data-reverted='true'] .type,
.item[data-reverted='true'] .surrogate { opacity: 0.55; text-decoration: line-through; }

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

/* Visible focus, per SPEC. :focus-visible alone would leave programmatic
   focus unindicated, and the panel focuses itself when it opens. */
button:focus-visible,
.panel:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--ps-focus);
  outline-offset: 2px;
}

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
