#!/usr/bin/env bash
# Packages build/ into the .zip the Chrome Web Store dashboard expects.
#
# WHY THIS IS NOT `Compress-Archive`. On Windows, both PowerShell's
# Compress-Archive and .NET's ZipFile.CreateFromDirectory write entry names
# with BACKSLASH separators:
#
#     icons\icon128.png
#     models\jiting\xlm-roberta-base-ner-hrl_onnx\config.json
#
# The ZIP specification (APPNOTE 4.4.17.1) requires forward slashes. Many tools
# tolerate backslashes; a store ingestion pipeline is not a tool to gamble on,
# and a package that unpacks to one flat file named `icons\icon128.png` would
# fail in a way that is tedious to diagnose from a rejection e-mail.
#
# bsdtar (shipped in C:\Windows\System32 since Windows 10, and the default tar
# on macOS) writes conformant names. GNU tar - which is what `tar` resolves to
# inside Git Bash - does NOT write zip at all: `tar -a` infers gzip from the
# extension and silently produces a .tar.gz wearing a .zip name.
#
# Usage:  bash packages/extension/scripts/make-store-zip.sh
set -uo pipefail

EXT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$EXT/build"
# `require` cannot take a /c/... MSYS path, so read it from inside the
# directory. The first version produced "discretion-.zip".
VERSION="$(cd "$EXT" && node -p "require('./package.json').version")"
OUT="$EXT/discretion-$VERSION.zip"

if [ ! -f "$BUILD/manifest.json" ]; then
  printf 'build/ is missing or incomplete. Run: npm run ext:build\n'
  exit 2
fi

# Prefer the system bsdtar explicitly. Resolving plain `tar` would find GNU tar
# on this machine, which cannot do this job.
BSDTAR=""
for candidate in /c/Windows/System32/tar.exe /usr/bin/bsdtar bsdtar; do
  if "$candidate" --version 2>/dev/null | grep -q bsdtar; then BSDTAR="$candidate"; break; fi
done
if [ -z "$BSDTAR" ]; then
  printf 'no bsdtar found; refusing to fall back to a zipper that writes backslashes\n'
  exit 2
fi

rm -f "$OUT"
( cd "$BUILD" && "$BSDTAR" -a -c -f "$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")" ./* ) || {
  printf 'packaging failed\n'; exit 1
}

printf 'wrote %s\n' "$OUT"
printf 'size  %s bytes\n' "$(stat -c %s "$OUT" 2>/dev/null || stat -f %z "$OUT")"

# The manifest MUST be at the archive root, and no entry may contain a
# backslash. Both are checked rather than assumed, because both are silent
# failures at the far end of a submission.
node -e '
const { execSync } = require("child_process");
const out = process.argv[1];
const listing = execSync(`"${process.argv[2]}" -tf "${out}"`, { encoding: "utf8", maxBuffer: 1 << 28 });
const entries = listing.split(/\r?\n/).filter(Boolean).map((e) => e.replace(/^\.\//, ""));
const problems = [];
if (!entries.includes("manifest.json")) problems.push("manifest.json is not at the archive root");
const backslashed = entries.filter((e) => e.includes("\\"));
if (backslashed.length) problems.push(`${backslashed.length} entries use backslashes, e.g. ${backslashed[0]}`);
console.log(`entries: ${entries.length}`);
if (problems.length) { for (const p of problems) console.log(`  FAIL  ${p}`); process.exit(1); }
console.log("  ok    manifest.json at root, all separators are forward slashes");
' "$OUT" "$BSDTAR" || exit 1
