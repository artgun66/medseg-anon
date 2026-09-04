# Running locally (macOS / Apple Silicon)

This is the working local setup: model download, chat (Metal-accelerated), and
BiomedParse segmentation — all three live. The chat and segmentation surfaces are the
same app (attach a CT scan in a chat thread → it routes the image to BiomedParse and
renders the overlay inline).

## What runs where

| Service | Port | Started by | Notes |
|---|---|---|---|
| Postgres | 55432 (host) | Docker (`docker-compose.local.yml`) | `dev.sh` brings it up |
| Backend (uvicorn ASGI) | 8000 | `./scripts/dev.sh start` | native, for Metal |
| Worker (downloads) | — | `./scripts/dev.sh start` | polls the task queue |
| llama-server | random 127.0.0.1 | spawned by backend on first chat | Metal, `n-gpu-layers=999` |
| Frontend (Next.js) | 3000 | `pnpm --filter product dev` | native |
| **BiomedParse** | 8001 | `./biomedparse_service/start.sh` | **separate — not managed by dev.sh** |

## First-time setup (already done on this machine)

- `backend/.venv` — Python 3.12 venv with backend deps.
- `.env.local` (repo root) — `DATABASE_URL` points at `localhost:55432`, with generated
  `FERNET_KEY` + catalog Ed25519 keys. **Gitignored; do not commit.**
- `frontend/apps/product/.env.local` — `NEXT_PUBLIC_API_URL` / `API_URL` → `http://localhost:8000`.
- `brew install llama.cpp` — provides `llama-server` on PATH.
- Catalog seeded from `apps/catalog/data/curated.yaml` (`seed_catalog`).
- `biomedparse_service/.venv` — Python 3.11 venv (torch 2.1.2 stack).

## Start / stop

```bash
# 1. Postgres + backend + worker
./scripts/dev.sh start          # status | stop | restart | logs <backend|worker>

# 2. Frontend
cd frontend && pnpm --filter product dev      # → http://localhost:3000

# 3. BiomedParse segmentation service (separate)
./biomedparse_service/start.sh                # → http://127.0.0.1:8001
```

Then: Hub `http://localhost:3000/hub` (download a model) → chat at `/threads`.

## BiomedParse + detectron2 (important caveat)

`biomedparse_service/requirements.txt` does **not** include `detectron2`, and the model
code imports `Conv2d`/`ShapeSpec`/`get_norm`/`SEM_SEG_HEADS_REGISTRY`/`Backbone` from it.
Upstream detectron2 ships compiled C++ ops that don't build on macOS arm64 against
torch 2.1.2 — and none of those ops are used by the FPN-decoder eval path here.

So a small **pure-Python detectron2 shim** is installed into the service venv at
`biomedparse_service/.venv/lib/python3.11/site-packages/detectron2/` providing faithful
versions of exactly those symbols (notably the `Conv2d` wrapper that accepts the `norm=`
kwarg — the project's own `torch.nn.Conv2d` fallback is broken).

**If you recreate the biomedparse venv, re-add the shim** (or install real detectron2 on a
CUDA/Linux box). The checkpoint loaded is `seg_model/outputs/checkpoints/last-v5.ckpt`
(fine-tuned), falling back to the base `biomedparse_v2.ckpt` if absent.

Segmentation runs on **CPU** here (no CUDA/MPS in the model code) — a single inference
takes a few seconds, which is fine for the demo.
