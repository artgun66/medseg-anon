#!/usr/bin/env bash
# Phase 3 — assemble desktop/staged/ with everything the packaged app loads at runtime.
# electron-builder copies staged/ verbatim into the app's Resources dir. The layout here
# must match desktop/src/paths.js (packaged branch).
#
# Run once per target platform on a machine of that platform (Python freezes and the
# llama-server binary are per-OS). Heavy: pulls a standalone CPython, torch, and a ~4 GB
# model. Intended for CI; runnable locally on macOS for a self-test.
#
#   ./scripts/stage-resources.sh            # full stage
#   SKIP_MODELS=1 ./scripts/stage-resources.sh   # skip the multi-GB model download
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP="$(cd "$HERE/.." && pwd)"
ROOT="$(cd "$DESKTOP/.." && pwd)"
STAGED="$DESKTOP/staged"

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  OSDIR=darwin-arm64 ;;
  Darwin-x86_64) OSDIR=darwin-x64 ;;
  Linux-x86_64)  OSDIR=linux-x64 ;;
  MINGW*|MSYS*|CYGWIN*) OSDIR=win-x64 ;;
  *) echo "unsupported platform $(uname -s)-$(uname -m); set OSDIR manually" >&2; OSDIR=${OSDIR:-win-x64} ;;
esac

echo "==> staging into $STAGED (os=$OSDIR)"
rm -rf "$STAGED"
mkdir -p "$STAGED"/{backend,biomedparse_service,frontend,bin/$OSDIR,models}

# 1. Backend source (no venv / caches / local data).
echo "==> backend source"
rm -rf "$STAGED/backend"
cp -R "$ROOT/backend" "$STAGED/backend"
rm -rf "$STAGED/backend/.venv" "$STAGED/backend/data"
find "$STAGED/backend" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
find "$STAGED/backend" -name "*.sqlite3" -delete 2>/dev/null || true

# 2. BiomedParse service + model code + fine-tuned checkpoint.
echo "==> biomedparse service + seg_model"
rm -rf "$STAGED/biomedparse_service"
cp -R "$ROOT/biomedparse_service" "$STAGED/biomedparse_service"
rm -rf "$STAGED/biomedparse_service/.venv"
find "$STAGED/biomedparse_service" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
mkdir -p "$STAGED/seg_model"
if [[ -d "$ROOT/seg_model" ]]; then
  cp -R "$ROOT/seg_model/." "$STAGED/seg_model/"
else
  echo "!! seg_model not found — BiomedParse will be unavailable in the build"
fi

# 3. Frontend — Next.js standalone server (the supervisor runs `node server.js`).
#    NEXT_PUBLIC_API_URL is baked to the fixed backend port; the browser calls it via CORS.
echo "==> frontend (Next.js standalone)"
( cd "$ROOT/frontend" && NEXT_PUBLIC_API_URL="http://127.0.0.1:8000" pnpm --filter product build )
SA="$ROOT/frontend/apps/product/.next/standalone"
# Standalone assembly: colocate static assets next to server.js.
cp -R "$ROOT/frontend/apps/product/.next/static" "$SA/apps/product/.next/static"
[ -d "$ROOT/frontend/apps/product/public" ] && cp -R "$ROOT/frontend/apps/product/public" "$SA/apps/product/public" || true
# Copy standalone tree preserving symlinks (pnpm symlinks must survive intact).
# ditto (macOS) and cp -a (Linux/Windows) both preserve symlinks; rsync silently drops them.
rm -rf "$STAGED/frontend"
if command -v ditto &>/dev/null; then
  ditto "$SA" "$STAGED/frontend"
else
  cp -a "$SA" "$STAGED/frontend"
fi

# 4. Binaries for this OS — MUST be self-contained (Homebrew builds link /opt/homebrew
#    dylibs that don't exist on a clean machine; that breaks node AND llama-server there).
echo "==> binaries (self-contained llama-server + node)"
TMPBIN="$(mktemp -d)"
# 4a. llama.cpp release (binary + its @loader_path dylibs).
if [[ "$OSDIR" == darwin-* ]]; then
  LLAMA_TAG="${LLAMA_TAG:-$(gh release view --repo ggml-org/llama.cpp --json tagName --jq .tagName 2>/dev/null || echo b9835)}"
  gh release download "$LLAMA_TAG" --repo ggml-org/llama.cpp --pattern '*macos-arm64*' --dir "$TMPBIN" --clobber 2>/dev/null || \
    curl -sL -o "$TMPBIN/llama.tgz" "https://github.com/ggml-org/llama.cpp/releases/download/$LLAMA_TAG/llama-$LLAMA_TAG-bin-macos-arm64.tar.gz"
  tar -xzf "$TMPBIN"/*.t*gz -C "$TMPBIN"
  LLDIR="$(dirname "$(find "$TMPBIN" -name llama-server -type f | head -1)")"
  cp "$LLDIR/llama-server" "$LLDIR"/*.dylib "$STAGED/bin/$OSDIR/"
else
  echo "!! non-macOS: download the matching llama.cpp release into $STAGED/bin/$OSDIR/" >&2
fi
# 4b. Official Node.js (self-contained; do NOT use Homebrew's node).
NODE_VER="${NODE_VER:-$(curl -s https://nodejs.org/dist/index.json | grep -oE '"version":"v22[^"]*"' | head -1 | sed 's/.*"v/v/;s/"//')}"
case "$OSDIR" in darwin-arm64) NARCH=darwin-arm64;; darwin-x64) NARCH=darwin-x64;; linux-x64) NARCH=linux-x64;; win-x64) NARCH=win-x64;; esac
if [[ "$OSDIR" == win-* ]]; then
  curl -sL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-$NARCH.zip" -o "$TMPBIN/node.zip"
  unzip -q "$TMPBIN/node.zip" -d "$TMPBIN"
  cp "$TMPBIN/node-$NODE_VER-$NARCH/node.exe" "$STAGED/bin/$OSDIR/node.exe"
else
  curl -sL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-$NARCH.tar.gz" -o "$TMPBIN/node.tgz"
  tar -xzf "$TMPBIN/node.tgz" -C "$TMPBIN"
  cp "$TMPBIN/node-$NODE_VER-$NARCH/bin/node" "$STAGED/bin/$OSDIR/node"
fi
chmod 755 "$STAGED/bin/$OSDIR/"* 2>/dev/null || true
rm -rf "$TMPBIN"

# 5. Relocatable CPython runtimes + deps (the freeze).
#    Uses python-build-standalone via `uv`; standalone interpreters are relocatable, so we
#    install each service's deps into the interpreter's own site-packages and ship the dir.
echo "==> python runtimes (backend 3.12, biomedparse 3.11)"
"$HERE/build-python-runtime.sh" backend  "$ROOT/backend"            3.12 "$STAGED/python-backend"
"$HERE/build-python-runtime.sh" biomed   "$ROOT/biomedparse_service" 3.11 "$STAGED/python-biomedparse"

# 6. Bundled model(s): copy the catalog default (gemma light + vision projector).
echo "==> bundled models"
cp "$DESKTOP/resources/models/bundled.yaml" "$STAGED/models/bundled.yaml"
if [[ "${SKIP_MODELS:-0}" != "1" ]]; then
  "$HERE/fetch-bundled-models.sh" "$STAGED/models"
else
  echo "   SKIP_MODELS=1 — leaving model files out (app will offer them as downloads)"
fi

echo "==> done. Build the installer with: pnpm --prefix \"$DESKTOP\" dist"
