# Local LLM — Desktop app (Tauri 2)

A zero-install desktop build of Local LLM. A small **Rust supervisor** (inside a Tauri 2
shell) starts the bundled Django backend, the task worker, the BiomedParse service, and the
Next.js standalone server as sidecars on `127.0.0.1`, then points the webview at the
frontend — all without the user installing Docker, Python, Postgres, or Node.

## Architecture

```
Tauri shell (src-tauri/) ── webview shows splash, then navigates to the frontend
└─ Rust supervisor (src-tauri/src/supervisor.rs), on launch:
   1. conflict-detect backend :8000 / biomedparse :8001; pick a free frontend port
   2. seed_desktop   migrate + sign/seed catalog + register bundled models   (blocks)
   3. backend        uvicorn config.asgi:application      → 127.0.0.1:8000
   4. worker         manage.py run_worker                 (separate process)
   5. biomedparse    uvicorn app:app                      → 127.0.0.1:8001  (optional)
   6. frontend       node server.js (Next standalone)     → 127.0.0.1:<free>
   7. wait for /healthz, then navigate the webview
   on quit: SIGTERM/kill each child's process group (reaps llama-server grandchildren)
```

- The **browser calls the backend directly** at `127.0.0.1:8000` (baked into the bundle at
  build time; backend `CORS_ALLOW_ALL_ORIGINS` permits the frontend origin). `llama-server`
  is spawned by the backend on first chat. BiomedParse's port is passed to the backend via
  `BIOMEDPARSE_SERVICE_URL`.
- Backend/biomedparse ports are **fixed** (the frontend bundle targets `:8000`); the
  frontend port is **free**. Truly-free backend ports would need a runtime-config bootstrap.
- Per-user data (SQLite DB, downloaded models, generated secrets, logs) lives under the OS
  app-data dir, never in the read-only bundle. Path resolution (dev vs bundled) is in
  `supervisor.rs::Paths::resolve`.

## Prerequisites

- **Rust ≥ 1.88** (Tauri 2's deps require it). Homebrew's rust may be older — `brew upgrade
  rust` or install rustup. See `src-tauri/rust-toolchain.toml`.
- Node 20+, and the Tauri system deps for your OS (WebKitGTK on Linux).

## Run in dev (against the repo's existing venvs)

Prereqs on this machine: `backend/.venv`, the frontend **standalone** build, and
`llama-server` on PATH (`brew install llama.cpp`). BiomedParse is optional.

```bash
# 1. Build the frontend standalone server (once, or after frontend changes)
cd ../frontend && NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 pnpm --filter product build
#   then colocate static assets next to server.js:
cp -r apps/product/.next/static apps/product/.next/standalone/apps/product/.next/static
cd ../desktop

# 2. Launch the Tauri app (compiles the Rust supervisor, then boots the sidecars)
npm install
npm run dev
```

First launch runs `seed_desktop` (creates the SQLite DB, seeds the catalog). Without a
bundled `*.gguf` in `resources/models/`, no model is pre-installed — open the Hub to
download one, or stage the default (below).

## Build a distributable

```bash
./scripts/stage-resources.sh        # assemble desktop/staged/ (per-OS; heavy — torch + ~4GB model)
#   SKIP_MODELS=1 ./scripts/stage-resources.sh
cargo tauri icon assets/icon.png    # generate app icons (once; add a source PNG)
npm install && npm run build        # → src-tauri/target/release/bundle/ (.dmg/.exe/.AppImage/.deb)
```

`staged/` layout (must match `supervisor.rs::Paths::resolve`):

```
staged/
├─ backend/                 Django source (no venv/data)
├─ python-backend/          relocatable CPython 3.12 + backend deps
├─ biomedparse_service/     FastAPI service source
├─ python-biomedparse/      relocatable CPython 3.11 + torch + detectron2 shim
├─ seg_model/             BiomedParse model code + last-v5.ckpt
├─ frontend/                Next standalone output (apps/product/server.js + .next + node_modules)
├─ bin/<os>/                llama-server + node
└─ models/                  gemma-*.gguf + mmproj-*.gguf + bundled.yaml
```

## Code signing (Phase 5)

Unsigned by default (fine for local testing). For distribution, wire CI secrets:
- **macOS**: `APPLE_CERTIFICATE`/`_PASSWORD` + `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`.
- **Windows**: `TAURI_SIGNING_PRIVATE_KEY`/`_PASSWORD`.

See `.github/workflows/desktop-build.yml`.

## Status

- ✅ Backend on SQLite + separate worker process (`config.settings.desktop`).
- ✅ Frontend Next.js standalone server; browser → backend via direct CORS.
- ✅ **Verified headless:** streaming chat through the standalone server + direct to backend
  (gemma-4-e2b on Metal, SSE tokens), CORS preflight from a non-`:3000` origin, separate
  worker on SQLite WAL, standalone server serving all pages.
- ✅ **Rust supervisor compiles** (`cargo check` clean on rustc 1.96; needs ≥ 1.88).
- ⏳ GUI window launch (`npm run dev`) not exercised here — needs a desktop session.
- ⚠️ BiomedParse segmentation not yet exercised in a desktop run.
- ⏳ Per-platform freezes, model staging, GUI launch, and signing run in CI / on each OS.
