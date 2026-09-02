#!/usr/bin/env bash
# Verifies that a FRESH CLONE can build a loadable extension.
#
# WHY THIS EXISTS. The NER model is ~280 MB and is not in the repository, so
# for most of this project's life a fresh clone could not build the extension
# at all - `build.mjs` failed listing what was missing, correctly, with no
# documented way to satisfy it. M9 flagged that as a hard blocker for M11's
# "production build verified loading unpacked in Chrome". `ext:fetch-model`
# was written to close it. This is the check that it actually did.
#
# It deliberately does NOT reuse this working tree's node_modules or
# .hf-cache. The whole question is what someone gets with neither.
#
# Usage:  bash packages/extension/scripts/verify-fresh-clone.sh [--keep]
set -uo pipefail

REPO_URL="${REPO_URL:-https://github.com/horozbabasi/discretion}"
WORK="$(mktemp -d -t ps-fresh-XXXXXX)"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

step() { printf '\n=== %s ===\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILURES=$((FAILURES+1)); }
ok()   { printf '  ok    %s\n' "$1"; }
FAILURES=0

# IS THE REPOSITORY PUBLIC? Asked separately, and first, because the answer
# changes what the rest of this script proves.
#
# `git clone` uses the local credential helper. On the maintainer's machine
# that silently authenticates, so a PRIVATE repository clones fine and the run
# reports success - which is what happened through M11. The claim "a fresh
# clone builds and loads it" was therefore true of the OWNER and not of anyone
# else, and nothing here said so.
step "is the repository reachable WITHOUT credentials?"
if GIT_TERMINAL_PROMPT=0 git -c credential.helper= ls-remote "$REPO_URL" HEAD >/dev/null 2>&1; then
  ok "public: an anonymous clone can reach it"
  PUBLIC=1
else
  PUBLIC=0
  printf '  NOTE  NOT PUBLIC - an anonymous clone is refused.
'
  printf '        The build check below still runs, using your credentials, and
'
  printf '        still proves the BUILD works from a clean tree. It does NOT
'
  printf '        prove a stranger can obtain the source, and every
'
  printf '        github.com link in README/STORE-LISTING/PRIVACY 404s for them.
'
fi

step "clone into $WORK"
if ! git clone --depth 1 "$REPO_URL" "$WORK/discretion" 2>&1 | tail -2; then
  fail "clone failed"; exit 1
fi
cd "$WORK/discretion" || exit 1
ok "cloned $(git log --oneline -1)$([ "$PUBLIC" = "0" ] && printf ' (AUTHENTICATED, not anonymous)')"

# THE PRECONDITION THIS TEST IS ABOUT. If the model were somehow already
# present the run would prove nothing, so it is asserted rather than assumed.
step "the clone has no model and no dependencies"
if [ -d .hf-cache ]; then fail ".hf-cache exists in a fresh clone"; else ok "no .hf-cache"; fi
if [ -d node_modules ]; then fail "node_modules exists in a fresh clone"; else ok "no node_modules"; fi

step "npm ci"
if npm.cmd ci >"$WORK/npm-ci.log" 2>&1; then
  ok "dependencies installed"
else
  fail "npm ci failed (see $WORK/npm-ci.log)"; tail -15 "$WORK/npm-ci.log"; exit 1
fi

# THE BUILD MUST FAIL FIRST, and fail usefully. A build that quietly produced a
# package with no model would ship an extension whose Stage 2 fails closed on
# every message - the worst outcome, because it looks installed.
step "build WITHOUT the model must fail, and say what is missing"
if npm.cmd run ext:build >"$WORK/build-nomodel.log" 2>&1; then
  if grep -qi "WARNING.*not bundled\|ext:fetch-model" "$WORK/build-nomodel.log"; then
    ok "build warned about the missing model and named the fix"
    grep -i "ext:fetch-model" "$WORK/build-nomodel.log" | head -2 | sed 's/^/        /'
  else
    fail "build succeeded WITHOUT the model and without warning about it"
  fi
else
  ok "build refused outright without the model"
fi

step "npm run ext:fetch-model"
if npm.cmd run ext:fetch-model >"$WORK/fetch.log" 2>&1; then
  ok "model fetched and digests verified"
  grep -iE "verified|sha256|ok" "$WORK/fetch.log" | tail -3 | sed 's/^/        /'
else
  fail "ext:fetch-model failed (see $WORK/fetch.log)"; tail -20 "$WORK/fetch.log"; exit 1
fi

step "npm run build"
if npm.cmd run build >"$WORK/build.log" 2>&1; then
  ok "build succeeded"
  grep -E "TOTAL|_locales:" "$WORK/build.log" | sed 's/^/        /'
else
  fail "build failed (see $WORK/build.log)"; tail -20 "$WORK/build.log"; exit 1
fi

step "the built package is complete"
for f in manifest.json content.js service-worker.js offscreen.js popup.html options.html \
         pages.css _locales/en/messages.json \
         "models/jiting/xlm-roberta-base-ner-hrl_onnx/onnx/model_quantized.onnx"; do
  if [ -s "packages/extension/build/$f" ]; then ok "$f"; else fail "missing or empty: $f"; fi
done

step "it loads in a real browser"
if PYTHONIOENCODING=utf-8 python packages/extension/scripts/verify-loads.py 2>&1 | tail -8; then
  ok "verify-loads.py passed against the fresh build"
else
  fail "the fresh build does not load"
fi

printf '\n%s\n' "============================================================"
if [ "$FAILURES" -gt 0 ]; then
  printf 'FRESH CLONE FAILED (%d problems). Work dir kept: %s\n' "$FAILURES" "$WORK"
  exit 1
fi
printf 'FRESH CLONE OK: clone -> npm ci -> fetch-model -> build -> loads.\n'
if [ "$KEEP" = "1" ]; then printf 'Work dir kept: %s\n' "$WORK"; else rm -rf "$WORK"; fi
