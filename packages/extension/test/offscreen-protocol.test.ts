/**
 * The rule that keeps composer text out of every context but two.
 *
 * `chrome.runtime.sendMessage` from a content script fires `onMessage` in every
 * frame of the extension, so the plaintext on the NER channel would reach an
 * open popup and the options page. A named port narrows that, and one rule
 * makes it exact: EXACTLY ONE CONTEXT MAY ACCEPT `NER_CHANNEL`.
 *
 * Chrome specifies that when several listeners respond, the first wins and the
 * rest are discarded silently, with no defined ordering across contexts. Under
 * fail-closed, losing that race is a blocked send with no diagnosis — so the
 * race must not exist rather than be handled.
 *
 * These are STRUCTURAL tests over the source. That is unusual and it is the
 * only thing that works here: the property is "no other module does X", and no
 * runtime test can observe a listener that a module did not register. A
 * reviewer reading offscreen.ts sees the rule; this is what notices when a
 * future module quietly breaks it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { NER_CHANNEL } from '../src/offscreen/protocol.js';
import type { NerRequest, NerResponse } from '../src/offscreen/protocol.js';

const SRC = join(process.cwd(), 'packages', 'extension', 'src');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: path.slice(SRC.length + 1).replace(/\\/gu, '/'),
  text: readFileSync(path, 'utf8'),
}));

describe('exactly one context accepts the NER channel', () => {
  it('only the offscreen document registers onConnect at all', () => {
    const listeners = FILES.filter((f) => f.text.includes('onConnect.addListener')).map(
      (f) => f.path,
    );
    expect(listeners).toEqual(['offscreen/offscreen.ts']);
  });

  it('only the offscreen document and its client name the channel', () => {
    // The client opens it; the offscreen document accepts it; protocol.ts
    // declares it. Anything else naming it is a fourth party on a channel
    // carrying unredacted composer text.
    const named = FILES.filter((f) => f.text.includes('NER_CHANNEL')).map((f) => f.path).sort();
    expect(named).toEqual([
      'detection/portRecognizer.ts',
      'offscreen/offscreen.ts',
      'offscreen/protocol.ts',
    ]);
  });

  it('the offscreen document refuses every other channel name', () => {
    const offscreen = FILES.find((f) => f.path === 'offscreen/offscreen.ts');
    expect(offscreen).toBeDefined();
    // The guard is an early return on the name, before any handler is bound.
    expect(offscreen?.text).toMatch(/if \(port\.name !== NER_CHANNEL\) return;/u);
  });

  it('the service worker never touches the channel or the text on it', () => {
    // It provisions the offscreen document and nothing else. Stated in
    // PERMISSIONS.md as a property of the design, so it is checked here rather
    // than trusted.
    const worker = FILES.find((f) => f.path === 'service-worker.ts');
    expect(worker).toBeDefined();
    expect(worker?.text).not.toContain('NER_CHANNEL');
    expect(worker?.text).not.toContain('onConnect');
  });
});

describe('the protocol is JSON-representable', () => {
  // Chrome serializes extension messaging with JSON unless
  // `message_serialization: "structured_clone"` is declared (Chrome 148+), and
  // this manifest does not declare it. A Map, a Set or a typed array in a
  // payload would arrive as `{}` — silently, and only in the browser.
  it('survives a JSON round trip with every field intact', () => {
    const request: NerRequest = { id: 7, op: 'recognize', text: 'Maria signed it.' };
    expect(JSON.parse(JSON.stringify(request))).toEqual(request);

    const response: NerResponse = {
      id: 7,
      ok: true,
      op: 'recognize',
      spans: [
        {
          type: 'PERSON',
          start: 0,
          end: 5,
          text: 'Maria',
          score: 0.97,
          gazetteer: { type: 'PERSON', whole: true, matchedWords: 1, totalWords: 1 },
        },
      ],
    };
    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });

  it('names the channel distinctively enough not to collide', () => {
    expect(NER_CHANNEL).toContain('discretion');
  });
});

describe('errors crossing the boundary carry no payload', () => {
  it('the offscreen document sends only an error name and message', () => {
    // A recognition error can carry the chunk it failed on, and a chunk is
    // composer text. These strings reach logs and the degraded panel.
    const offscreen = FILES.find((f) => f.path === 'offscreen/offscreen.ts');
    expect(offscreen?.text).toMatch(
      /function describe\(error: unknown\): string \{\s*if \(error instanceof Error\) return `\$\{error\.name\}: \$\{error\.message\}`;/u,
    );
    // And nothing anywhere serializes the whole error object.
    for (const file of FILES) {
      expect(file.text).not.toMatch(/JSON\.stringify\(\s*error\s*\)/u);
    }
  });
});
