// @vitest-environment jsdom
/**
 * The adapters and the manifest must agree about which sites exist.
 *
 * This is a drift test, and it caught a real inconsistency the first time it
 * ran: the ChatGPT adapter claimed chat.openai.com, which the manifest does not
 * grant. Nothing would have failed loudly — the content script simply never
 * runs on an origin without host permission — so `matches()` would have been
 * asserting a capability the extension does not have, forever, silently.
 *
 * It also guards the other direction, which is the one that matters for the
 * privacy claim: a host permission with no adapter behind it would mean the
 * extension asks to read a site it cannot protect. PERMISSIONS.md rests the
 * whole three-site trust argument on that list being exactly what is needed.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { InputWitness, pickAdapter } from '../src/adapters/index.js';

const manifest = JSON.parse(
  readFileSync(join(process.cwd(), 'packages', 'extension', 'src', 'manifest.json'), 'utf8'),
) as { host_permissions: string[]; content_scripts: { matches: string[] }[] };

/** "https://claude.ai/*" -> "https://claude.ai/" */
function originOf(pattern: string): string {
  return pattern.replace(/\*$/u, '');
}

describe('adapters and manifest agree', () => {
  it('every host permission has an adapter that claims it', () => {
    for (const pattern of manifest.host_permissions) {
      const witness = new InputWitness(document);
      const adapter = pickAdapter(originOf(pattern), document, witness);
      expect(adapter, `no adapter claims ${pattern}`).not.toBeNull();
    }
  });

  it('content script matches are exactly the host permissions', () => {
    const scriptMatches = manifest.content_scripts.flatMap((cs) => cs.matches);
    expect([...scriptMatches].sort()).toEqual([...manifest.host_permissions].sort());
  });

  it('no adapter claims an origin the manifest does not grant', () => {
    const granted = new Set(manifest.host_permissions.map(originOf).map((u) => new URL(u).hostname));
    // Hosts an adapter might plausibly be tempted to claim.
    const ungranted = [
      'https://chat.openai.com/',
      'https://openai.com/',
      'https://bard.google.com/',
      'https://google.com/',
      'https://anthropic.com/',
      'https://claude.ai.evil.example/',
    ];
    for (const url of ungranted) {
      expect(granted.has(new URL(url).hostname), `${url} should not be granted`).toBe(false);
      const witness = new InputWitness(document);
      expect(pickAdapter(url, document, witness), `an adapter claims ${url}`).toBeNull();
    }
  });
});
