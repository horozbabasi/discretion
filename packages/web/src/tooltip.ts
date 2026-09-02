/**
 * tooltip.ts — hover cards for detected candidates (input pane) and masked
 * replacements (output pane). Content is built programmatically from typed
 * fields; the positioning is a single fixed-position card that follows the
 * hovered mark.
 */

import type { MaskedEntity, Stage1Candidate } from '@discretion/core';
import { el } from './dom.js';
import { confidenceTier, familyOf, labelOf } from './entityMeta.js';

/** Card contents for a detected candidate in the input pane. */
export function candidateCard(c: Stage1Candidate): HTMLElement {
  const tier = confidenceTier(c.rawConfidence);
  const rows = [
    el('div', { class: `tip-head family-${familyOf(c.type)}` }, labelOf(c.type)),
    el(
      'div',
      { class: 'tip-row' },
      el('span', { class: 'tip-key' }, 'confidence'),
      el('span', { class: `tip-tier tier-${tier}` }, tier),
      el('span', { class: 'tip-dim' }, ` raw ${c.rawConfidence.toFixed(2)} — uncalibrated until M8`),
    ),
    el(
      'div',
      { class: 'tip-row' },
      el('span', { class: 'tip-key' }, 'detector'),
      el('span', {}, c.detectorId),
    ),
  ];
  if (c.validatorPassed !== undefined) {
    rows.push(
      el(
        'div',
        { class: 'tip-row' },
        el('span', { class: 'tip-key' }, 'validated by'),
        el('span', {}, c.validatorPassed),
      ),
    );
  }
  if (!c.sensitive) {
    rows.push(el('div', { class: 'tip-note' }, 'Known test value — detected, never masked.'));
  }
  return el('div', { class: 'tip-body' }, ...rows);
}

/** Card contents for a replacement in the output pane. */
export function replacementCard(e: MaskedEntity): HTMLElement {
  const how = e.fallback
    ? 'bracket token (no surrogate available for this value — fallback, recorded in the vault)'
    : e.replacement.startsWith('[')
      ? 'bracket token'
      : 'format-preserving surrogate';
  return el(
    'div',
    { class: 'tip-body' },
    el('div', { class: `tip-head family-${familyOf(e.type)}` }, labelOf(e.type)),
    el('div', { class: 'tip-row' }, el('span', { class: 'tip-key' }, 'replaced with'), el('span', {}, how)),
    el('div', { class: 'tip-note' }, 'The original never leaves the page; restoration inverts this from the session vault.'),
  );
}

/** A singleton floating card. Mouse-following; hidden when nothing hovers. */
export class Tooltip {
  private readonly node: HTMLElement;

  constructor(parent: HTMLElement) {
    this.node = el('div', { class: 'tooltip', role: 'tooltip', hidden: '' });
    parent.append(this.node);
  }

  show(content: HTMLElement, clientX: number, clientY: number): void {
    this.node.replaceChildren(content);
    this.node.hidden = false;
    const margin = 14;
    const rect = this.node.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - margin;
    const maxY = window.innerHeight - rect.height - margin;
    const x = Math.max(margin, Math.min(clientX + margin, maxX));
    const flipUp = clientY + margin + rect.height > window.innerHeight;
    const y = flipUp ? Math.max(margin, clientY - rect.height - margin) : Math.min(clientY + margin, maxY);
    this.node.style.transform = `translate(${x}px, ${y}px)`;
  }

  hide(): void {
    this.node.hidden = true;
  }
}
