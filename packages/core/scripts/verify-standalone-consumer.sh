#!/usr/bin/env bash
# SPEC.md M12's acceptance test, run rather than asserted:
#
#   "a developer who has never seen this repo can npm install the package and
#    run detection and masking from the docs alone"
#
# So this script builds the tarballs npm would actually serve, installs them
# into an EMPTY project outside this repository, copies in the documented
# examples, and runs them. Nothing is resolved from the workspace: if an export
# is missing from `files`, if a dependency is only present because the monorepo
# hoisted it, or if an example in the README does not work, this fails.
#
# It also checks the two things that are easy to get wrong and invisible
# locally:
#   - the ONNX runtime must NOT be installed (it is an optional peer, and the
#     whole point is that a caller who does not want Stage 2 does not pay
#     200 MB for it)
#   - the package must not reach the network at runtime
#
# Usage:  bash packages/core/scripts/verify-standalone-consumer.sh [--keep]
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="$(mktemp -d -t ps-consumer-XXXXXX)"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

FAILURES=0
step() { printf '\n=== %s ===\n' "$1"; }
ok()   { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES+1)); }

cleanup() {
  if [ "$KEEP" = "1" ]; then printf '\nwork dir kept: %s\n' "$WORK"
  else rm -rf "$WORK"; fi
}
trap cleanup EXIT

cd "$REPO" || exit 1

step "build, so the tarballs contain current output"
if npm.cmd run build:ts >"$WORK/build.log" 2>&1 || npm run build:ts >"$WORK/build.log" 2>&1; then
  ok "build:ts"
else
  fail "build:ts failed"; tail -15 "$WORK/build.log"; exit 1
fi

step "pack both packages"
mkdir -p "$WORK/tarballs"
for pkg in data core; do
  if (npm.cmd pack --workspace "@privacyshield/$pkg" --pack-destination "$WORK/tarballs" \
      || npm pack --workspace "@privacyshield/$pkg" --pack-destination "$WORK/tarballs") \
      >>"$WORK/pack.log" 2>&1; then
    ok "packed @privacyshield/$pkg"
  else
    fail "could not pack $pkg"; tail -10 "$WORK/pack.log"; exit 1
  fi
done
DATA_TGZ="$(ls "$WORK"/tarballs/privacyshield-data-*.tgz | head -1)"
CORE_TGZ="$(ls "$WORK"/tarballs/privacyshield-core-*.tgz | head -1)"

# THE PRECONDITION. If any of this resolved from the repo the test would prove
# nothing, so the consumer project is created outside it, with its own registry
# cache and no link to the workspace.
step "create an empty project OUTSIDE the repository"
CONSUMER="$WORK/consumer"
mkdir -p "$CONSUMER"
cd "$CONSUMER" || exit 1
cat > package.json <<'JSON'
{
  "name": "privacyshield-consumer-check",
  "private": true,
  "version": "1.0.0",
  "type": "module"
}
JSON
case "$CONSUMER" in
  "$REPO"*) fail "the consumer project is inside the repository" ;;
  *)        ok "consumer at $CONSUMER, outside $REPO" ;;
esac

step "npm install the tarballs, as a stranger would"
if (npm.cmd install --no-audit --no-fund "$DATA_TGZ" "$CORE_TGZ" \
    || npm install --no-audit --no-fund "$DATA_TGZ" "$CORE_TGZ") \
    >"$WORK/install.log" 2>&1; then
  ok "installed from tarballs"
else
  fail "install failed"; tail -25 "$WORK/install.log"; exit 1
fi

# The optional peer dependency, tested by its absence. If the ONNX runtime
# turns up here, `@huggingface/transformers` is not actually optional and every
# consumer pays 200 MB to use a package most of them will run without a model.
step "the ONNX runtime is NOT installed"
for unwanted in onnxruntime-node onnxruntime-web "@huggingface/transformers"; do
  if [ -d "node_modules/$unwanted" ]; then
    fail "$unwanted was installed - the optional peer is not optional"
  else
    ok "$unwanted absent"
  fi
done
INSTALLED_MB=$(du -sm node_modules 2>/dev/null | cut -f1)
ok "node_modules is ${INSTALLED_MB} MB"

step "run the documented examples"
cp "$REPO"/packages/core/examples/*.mjs "$CONSUMER"/ 2>/dev/null
EXAMPLES=0
for example in "$CONSUMER"/*.mjs; do
  name="$(basename "$example")"
  EXAMPLES=$((EXAMPLES+1))
  if node "$example" >"$WORK/$name.out" 2>&1; then
    ok "$name"
    sed 's/^/          /' "$WORK/$name.out"
  else
    fail "$name exited non-zero"
    sed 's/^/          /' "$WORK/$name.out" | tail -12
  fi
done
if [ "$EXAMPLES" -eq 0 ]; then
  fail "no examples were run - nothing was actually verified"
else
  ok "$EXAMPLES example(s) executed against the installed package"
fi

# SPEC.md's first non-negotiable. Asserted by BREAKING the network rather than
# by reading the source: any DNS lookup or socket connect throws.
step "no network access at runtime"
cat > no-network.mjs <<'JS'
import dns from 'node:dns';
import net from 'node:net';
import assert from 'node:assert/strict';

const boom = () => { throw new Error('NETWORK_ACCESS_ATTEMPTED'); };
dns.lookup = boom;
dns.promises.lookup = boom;
net.Socket.prototype.connect = boom;
net.connect = boom;
globalThis.fetch = boom;

const { protect, restore } = await import('@privacyshield/core');
const text = 'Card 5555341244441115 and IBAN DE44500105175407324931 and sk_live_7f3Kq2mNpX8vC1bWzR4tY6.';
const result = await protect(text, { seed: 3 });
assert.ok(result.entities.length >= 3, `expected 3+ entities, got ${result.entities.length}`);
assert.equal(restore(result.maskedText, result.vault).restoredText, text);
console.log(`detected ${result.entities.length} entities with the network disabled`);
JS
if node no-network.mjs >"$WORK/nonet.out" 2>&1; then
  ok "$(cat "$WORK/nonet.out")"
else
  fail "the package tried to reach the network, or failed without it"
  sed 's/^/          /' "$WORK/nonet.out" | tail -12
fi

# Guards against the check above passing for the wrong reason: if the traps do
# not fire, "no network was used" is not something this script established.
step "the network trap itself works"
cat > trap-check.mjs <<'JS'
import dns from 'node:dns';
const boom = () => { throw new Error('NETWORK_ACCESS_ATTEMPTED'); };
dns.lookup = boom;
try {
  dns.lookup('example.com', () => {});
  console.log('TRAP_DID_NOT_FIRE');
  process.exit(1);
} catch (error) {
  console.log(error.message === 'NETWORK_ACCESS_ATTEMPTED' ? 'TRAP_FIRES' : 'WRONG_ERROR');
}
JS
if node trap-check.mjs 2>&1 | grep -q TRAP_FIRES; then
  ok "the trap fires, so the previous result means something"
else
  fail "the network trap does not work - the no-network result proves nothing"
fi

step "TypeScript consumers get types"
cat > types-check.ts <<'TS'
import { protect, type ProtectResult, type ProtectedEntity } from '@privacyshield/core';
export async function run(text: string): Promise<readonly ProtectedEntity[]> {
  const result: ProtectResult = await protect(text, { profile: 'strict', seed: 1 });
  return result.entities;
}
TS
if (npm.cmd install --no-audit --no-fund --no-save typescript >/dev/null 2>&1 \
    || npm install --no-audit --no-fund --no-save typescript >/dev/null 2>&1) &&
   npx.cmd tsc --noEmit --strict --module nodenext --moduleResolution nodenext \
     --target es2022 types-check.ts >"$WORK/tsc.out" 2>&1; then
  ok "a strict TypeScript consumer compiles against the published types"
else
  fail "the published types do not typecheck for a consumer"
  sed 's/^/          /' "$WORK/tsc.out" | tail -12
fi

printf '\n%s\n' "============================================================"
if [ "$FAILURES" -gt 0 ]; then
  printf 'STANDALONE CONSUMER FAILED (%d problems).\n' "$FAILURES"
  KEEP=1
  exit 1
fi
printf 'STANDALONE CONSUMER OK: pack -> install -> docs examples run -> no network -> types compile.\n'
