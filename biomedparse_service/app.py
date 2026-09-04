"""BiomedParse inference microservice.

Loads the fine-tuned BiomedParse model once and serves segmentation requests
on POST /segment. Returns detection result + base64 overlay image.
"""
from __future__ import annotations

import base64
import io
import os
import sys
import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# ── paths ────────────────────────────────────────────────────────────────────
SERVICE_DIR = Path(__file__).parent
BIOMEDPARSE_DIR = SERVICE_DIR.parent / "seg_model" / "BiomedParse"
# Only the fine-tuned checkpoint is shipped; the un-fine-tuned base (biomedparse_v2.ckpt)
# was removed since it is never used when the fine-tuned weights are present.
FINETUNED_CKPT = SERVICE_DIR.parent / "seg_model" / "outputs" / "checkpoints" / "last-v5.ckpt"

sys.path.insert(0, str(BIOMEDPARSE_DIR))
sys.path.insert(0, str(SERVICE_DIR))  # so detectron2_shim is importable
os.chdir(BIOMEDPARSE_DIR)  # Hydra resolves config paths relative to cwd

# Register the shim as 'detectron2' before any BiomedParse code imports it.
# BiomedParse tries `from detectron2.layers import Conv2d` and falls back to
# plain torch.nn.Conv2d (which rejects norm=) when detectron2 isn't installed.
# Wiring the shim into sys.modules prevents that fallback.
import detectron2_shim as _d2
import detectron2_shim.layers as _d2_layers
import detectron2_shim.modeling as _d2_modeling
sys.modules.setdefault("detectron2", _d2)
sys.modules.setdefault("detectron2.layers", _d2_layers)
sys.modules.setdefault("detectron2.modeling", _d2_modeling)

import hydra
from hydra import compose
from hydra.core.global_hydra import GlobalHydra

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PRESET_PROMPTS = {
    "bleeding": "is there a bleeding in the image",
    "stroke": "is there a stroke in the image",
    "healthy": "is the image healthy",
}

# ── model state ──────────────────────────────────────────────────────────────
_model: object = None
_device: torch.device = None


def _load_checkpoint(model, path: Path, device: torch.device):
    checkpoint = torch.load(str(path), map_location=device)
    if "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]
    elif "model" in checkpoint:
        state_dict = checkpoint["model"]
    else:
        state_dict = checkpoint
    cleaned = {
        (k[6:] if k.startswith("model.") else k): v
        for k, v in state_dict.items()
    }
    model.load_state_dict(cleaned, strict=False)
    return model


def _init_model():
    global _model, _device
    # MPS kernel fallbacks for this model architecture cost more than they save;
    # CPU with all threads is consistently faster here.
    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    torch.set_num_threads(os.cpu_count() or 4)
    logger.info("Using device: %s  threads: %d", _device, torch.get_num_threads())

    GlobalHydra.instance().clear()
    hydra.initialize_config_dir(config_dir=str(BIOMEDPARSE_DIR / "configs"), job_name="biomedparse_service", version_base=None)
    cfg = compose(config_name="evaluate_biomedparse_2D")

    if not FINETUNED_CKPT.exists():
        raise FileNotFoundError(f"fine-tuned checkpoint not found: {FINETUNED_CKPT}")
    ckpt_path = FINETUNED_CKPT
    logger.info("Loading checkpoint: %s", ckpt_path)

    model = hydra.utils.instantiate(cfg.model, _convert_="object")
    model = _load_checkpoint(model, ckpt_path, _device)
    model = model.to(_device).eval()
    _model = model
    logger.info("Model ready")


# ── DICOM helpers ────────────────────────────────────────────────────────────

def _is_dicom(raw: bytes) -> bool:
    # Standard DICOM files carry the magic "DICM" at byte offset 128.
    return len(raw) > 132 and raw[128:132] == b"DICM"


def _dicom_to_png_bytes(raw: bytes) -> bytes:
    """Convert a DICOM file to a PNG using a brain CT window.

    Brain window (WL=40 HU, WW=80 HU → range 0–80 HU) is the standard
    preprocessing for stroke and hemorrhage detection, matching the expected
    input distribution of the fine-tuned checkpoint.
    """
    import pydicom

    ds = pydicom.dcmread(io.BytesIO(raw), force=True)
    arr = ds.pixel_array.astype(float)

    # Multi-frame (e.g. full CT series): take the middle slice.
    if arr.ndim == 3:
        arr = arr[arr.shape[0] // 2]

    # Convert stored values to Hounsfield Units.
    slope = float(getattr(ds, "RescaleSlope", 1))
    intercept = float(getattr(ds, "RescaleIntercept", 0))
    hu = arr * slope + intercept

    # Brain window: WL=40, WW=80 → [0, 80] HU → [0, 255] uint8.
    lo, hi = 0.0, 80.0
    windowed = np.clip(hu, lo, hi)
    windowed = ((windowed - lo) / (hi - lo) * 255).astype(np.uint8)

    buf = io.BytesIO()
    Image.fromarray(windowed).convert("RGB").save(buf, format="PNG")
    return buf.getvalue()


# ── image helpers ─────────────────────────────────────────────────────────────

def _preprocess(img_bytes: bytes) -> torch.Tensor:
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (512, 512), interpolation=cv2.INTER_LINEAR)
    tensor = torch.from_numpy(img).permute(2, 0, 1).float()
    return tensor.unsqueeze(0)


def _run_inference(image_tensor: torch.Tensor, prompt: str):
    image_tensor = image_tensor.to(_device)
    with torch.inference_mode():
        out = _model({"image": image_tensor, "text": [prompt]}, mode="eval")
    preds = out["predictions"]

    # detection probability
    oe = preds["object_existence"]
    if isinstance(oe, torch.Tensor):
        oe = oe.detach().to(torch.float32).squeeze()
        prob = torch.sigmoid(oe).mean().item() if oe.numel() > 1 else torch.sigmoid(oe).item()
    else:
        prob = float(oe)
    detected = prob > 0.5

    # segmentation mask
    pred_mask = None
    gmasks = preds.get("pred_gmasks")
    if gmasks is not None:
        if gmasks.shape[-2:] != (512, 512):
            gmasks = F.interpolate(gmasks.float(), size=(512, 512), mode="bicubic",
                                   align_corners=False, antialias=True)
        mask_prob = torch.sigmoid(gmasks)
        if mask_prob.shape[1] > 1:
            mask_prob = mask_prob.mean(dim=1, keepdim=True)
        if detected:
            pred_mask = (mask_prob > 0.5).squeeze().cpu().numpy().astype(np.uint8) * 255
            if pred_mask.ndim < 2 or pred_mask.shape != (512, 512):
                pred_mask = np.zeros((512, 512), dtype=np.uint8)
        else:
            pred_mask = np.zeros((512, 512), dtype=np.uint8)

    return detected, prob, pred_mask


def _make_overlay(img_bytes: bytes, mask: np.ndarray | None) -> str:
    """Return base64-encoded PNG of original image with red mask overlay."""
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    orig = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    orig = cv2.cvtColor(orig, cv2.COLOR_BGR2RGB)
    orig_resized = cv2.resize(orig, (512, 512))

    if mask is not None and mask.max() > 0:
        overlay = orig_resized.copy()
        red_mask = np.zeros_like(orig_resized)
        red_mask[mask > 0] = [255, 50, 50]
        alpha = 0.45
        overlay = cv2.addWeighted(orig_resized, 1 - alpha, red_mask, alpha, 0)
        # draw contour
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(overlay, contours, -1, (255, 80, 80), 2)
    else:
        overlay = orig_resized.copy()

    pil = Image.fromarray(overlay)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _encode_original(img_bytes: bytes) -> str:
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    orig = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    orig = cv2.cvtColor(orig, cv2.COLOR_BGR2RGB)
    orig = cv2.resize(orig, (512, 512))
    pil = Image.fromarray(orig)
    buf = io.BytesIO()
    pil.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


# ── FastAPI app ───────────────────────────────────────────────────────────────

_model_lock = threading.Lock()


def _ensure_model():
    """Load the model once, on first use. Keeps service startup light — the fine-tuned
    checkpoint is ~4 GB and loading it eagerly at launch can exhaust RAM on small machines."""
    global _model
    if _model is not None:
        return
    with _model_lock:
        if _model is None:
            _init_model()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick off model loading in a background thread so the port binds immediately
    # but the model is hot before the first /segment request arrives.
    threading.Thread(target=_ensure_model, daemon=True).start()
    yield


app = FastAPI(title="BiomedParse Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": _model is not None}


@app.post("/segment")
async def segment(
    image: UploadFile = File(...),
    prompt: str = Form("is there a bleeding in the image"),
):
    img_bytes = await image.read()
    if not img_bytes:
        raise HTTPException(400, "Empty image")

    if _is_dicom(img_bytes):
        try:
            img_bytes = _dicom_to_png_bytes(img_bytes)
        except Exception as exc:
            raise HTTPException(400, f"Could not read DICOM file: {exc}") from exc

    # resolve preset shorthand → full prompt
    full_prompt = PRESET_PROMPTS.get(prompt.strip().lower(), prompt)

    try:
        _ensure_model()  # inside try/except so load failures are logged and returned as 500 detail
        tensor = _preprocess(img_bytes)
        detected, confidence, mask = _run_inference(tensor, full_prompt)
        overlay_b64 = _make_overlay(img_bytes, mask)
        original_b64 = _encode_original(img_bytes)
    except Exception as exc:
        logger.exception("Inference error")
        raise HTTPException(500, str(exc)) from exc

    return {
        "detected": detected,
        "confidence": round(confidence, 4),
        "prompt": full_prompt,
        "overlay_image": overlay_b64,
        "original_image": original_b64,
    }
