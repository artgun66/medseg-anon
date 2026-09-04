# Cloud Deployment Guide

Stack: **Vercel** (Next.js frontend) + **Render** (Django backend) + **Modal** (GPU inference)

All three Modal apps are already deployed. The BiomedParse checkpoint is already uploaded.
You only need to finish the Render and Vercel setup below.

---

## 1. Modal (already done)

Three functions are live on your Modal account:
- `gemma` → `chat_stream` — Gemma 3 27B-IT text/vision chat on A10G
- `biomedparse` → `segment` — CT scan segmentation on A10G
- `vessel` → `segment` — nnUNet vessel segmentation on A10G

BiomedParse checkpoint is uploaded to volume `biomedparse-weights` at `/checkpoints/last-v5.ckpt`.

### Upload vessel weights (when you have them)

```bash
cd "LLM-App 3"
backend/.venv/bin/python -m modal volume put vessel-weights \
  vessel_weights/nnUNet_weights /nnUNet_weights
```

---

## 2. Render (Django backend)

1. Go to https://render.com and sign up / log in
2. Click **New → Blueprint** and connect your GitHub repo
3. Render will detect `render.yaml` and create the web service + Postgres DB automatically
4. In the Render dashboard, set these **environment variables** (marked `sync: false` in render.yaml):

| Key | Value |
|-----|-------|
| `MODAL_TOKEN_ID` | your Modal token ID (from `~/.modal.toml`) |
| `MODAL_TOKEN_SECRET` | your Modal token secret |
| `HF_TOKEN` | your Hugging Face token |
| `CORS_ALLOWED_ORIGINS` | `https://your-app.vercel.app` (fill in after Vercel step) |

5. Click **Deploy** — Render runs migrations, seeds catalog, and starts gunicorn automatically
6. Copy your Render service URL, e.g. `https://llm-app-backend.onrender.com`

---

## 3. Vercel (Next.js frontend)

1. Go to https://vercel.com and sign up / log in
2. Click **Add New → Project** and import your GitHub repo
3. Vercel will detect `vercel.json` in the root and configure the Next.js project automatically
4. In the Vercel project settings → **Environment Variables**, add:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_URL` | `https://llm-app-backend.onrender.com` (your Render URL from step 2) |

5. Click **Deploy** — Vercel builds and hosts the frontend
6. Go back to Render and update `CORS_ALLOWED_ORIGINS` to your Vercel URL

---

## After deploying

- Open your Vercel URL in a browser — the app should load and connect to the Render backend
- Chat uses Gemma 3 27B-IT on Modal A10G (first message cold-starts ~20s; subsequent messages are instant while the GPU container stays warm)
- BiomedParse CT scan analysis runs on Modal A10G (~15-30s with GPU)
- Vessel segmentation runs on Modal A10G (~3-5 min with GPU vs 30 min on CPU)

## Cost

- **Vercel**: free tier (hobby) covers this app
- **Render**: free tier for web service + Postgres (spins down after 15 min inactivity; first request after sleep takes ~30s)
- **Modal**: pay per GPU-second — roughly $0.001 per chat message, $0.01 per BiomedParse call, $0.10 per vessel segmentation
