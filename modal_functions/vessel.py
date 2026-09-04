"""Vessel segmentation (nnUNet) inference on Modal A10G.

Deployed with: modal deploy modal_functions/vessel.py
Weights uploaded once with:
  modal volume put vessel-weights vessel_weights/nnUNet_weights /nnUNet_weights

HTTP endpoint (for direct browser upload — bypasses Render size limit):
  https://anon-workspace--vessel-vessel-api.modal.run/segment
"""
import modal

app = modal.App("vessel")

WEIGHTS_DIR = "/nnUNet_weights/nnUNet_weights"

weights_vol = modal.Volume.from_name("vessel-weights", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.3.0",
        "nnunetv2",
        "SimpleITK",
        "nibabel",
        "numpy",
        "Pillow",
        "scipy",
        "scikit-image",
        "acvl-utils",
        "dynamic-network-architectures",
        "fastapi[standard]",
        "python-multipart",
    )
)


@app.function(
    gpu="A10G",
    image=image,
    volumes={"/nnUNet_weights": weights_vol},
    timeout=600,
    memory=16384,
    min_containers=0,
    max_containers=12,
    scaledown_window=30,
)
def segment(nifti_bytes: bytes, filename: str) -> str:
    import base64, io, os, tempfile, uuid

    import nibabel as nib
    import numpy as np
    import SimpleITK as sitk
    from PIL import Image

    # Convert NRRD / MHD / other formats to NIfTI bytes
    if filename.lower().endswith((".nrrd", ".mhd", ".mha")):
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(filename)[1], delete=False) as f:
            f.write(nifti_bytes)
            tmp_in = f.name
        tmp_out = tmp_in + ".nii.gz"
        img = sitk.ReadImage(tmp_in)
        sitk.WriteImage(img, tmp_out)
        with open(tmp_out, "rb") as f:
            nifti_bytes = f.read()
        os.unlink(tmp_in)
        os.unlink(tmp_out)
        filename = filename.rsplit(".", 1)[0] + ".nii.gz"

    job_id = str(uuid.uuid4())

    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = os.path.realpath(tmpdir)
        infer_dir = os.path.join(tmpdir, "input")
        pred_dir = os.path.join(tmpdir, "predictions")
        os.makedirs(infer_dir)
        os.makedirs(pred_dir)

        base = filename.replace(".nii.gz", "").replace(".nii", "")
        scan_path = os.path.join(infer_dir, f"{base}_0000.nii.gz")
        with open(scan_path, "wb") as f:
            f.write(nifti_bytes)

        import subprocess
        env = {**os.environ, "nnUNet_results": WEIGHTS_DIR}
        cmd = [
            "nnUNetv2_predict",
            "-i", infer_dir,
            "-o", pred_dir,
            "-d", "Dataset241_Dyn",
            "-c", "3d_fullres",
            "-tr", "nnUNetTrainer",
            "-p", "nnUNetResEncUNetLPlans",
            "-f", "all",
            "-chk", "checkpoint_best.pth",
            "--continue_prediction",
        ]
        result = subprocess.run(cmd, env=env, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"nnUNetv2_predict failed:\n{result.stderr[-3000:]}")

        pred_files = [f for f in os.listdir(pred_dir) if f.endswith(".nii.gz")]
        if not pred_files:
            raise RuntimeError("nnUNet produced no output file")
        pred_path = os.path.join(pred_dir, pred_files[0])

        mask_img = nib.load(pred_path)
        mask_data = np.asarray(mask_img.dataobj)
        vessel_voxels = int(np.sum(mask_data > 0))

        orig_img = nib.load(scan_path)
        orig_data = np.asarray(orig_img.dataobj, dtype=np.float32)
        mid = orig_data.shape[2] // 2

        def _window(arr, lo=-200, hi=400):
            arr = np.clip(arr, lo, hi)
            return ((arr - lo) / (hi - lo) * 255).astype(np.uint8)

        orig_slice = _window(orig_data[:, :, mid])
        mask_slice = (mask_data[:, :, mid] > 0).astype(np.uint8)

        orig_rgb = np.stack([orig_slice] * 3, axis=-1)
        overlay = orig_rgb.copy()
        overlay[mask_slice > 0] = [255, 80, 80]
        overlay = (orig_rgb * 0.6 + overlay * 0.4).astype(np.uint8)

        def _b64_png(arr):
            buf = io.BytesIO()
            Image.fromarray(arr).save(buf, format="PNG")
            return base64.b64encode(buf.getvalue()).decode()

        with open(pred_path, "rb") as f:
            mask_bytes = f.read()

    import json
    return json.dumps({
        "job_id": job_id,
        "vessel_voxels": int(vessel_voxels),
        "preview_image": _b64_png(orig_rgb),
        "overlay_image": _b64_png(overlay),
        "mask_b64": base64.b64encode(mask_bytes).decode(),
    })


# HTTP endpoint — browser uploads directly here, bypassing Render's ~30MB body limit.
# Async job pattern: POST /segment → {call_id}, GET /result/{call_id} → poll for result.
@app.function(image=image, memory=2048, timeout=300)
@modal.asgi_app()
def vessel_api():
    from fastapi import FastAPI, File, UploadFile, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    import json, modal as _modal

    web_app = FastAPI()
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @web_app.post("/segment")
    async def http_segment(scan: UploadFile = File(...)):
        nifti_bytes = await scan.read()
        if not nifti_bytes:
            raise HTTPException(status_code=400, detail="Empty file")
        # Spawn GPU inference and return call_id immediately — no waiting
        call = segment.spawn(nifti_bytes, scan.filename or "scan.nii.gz")
        return {"call_id": call.object_id, "status": "pending"}

    @web_app.get("/result/{call_id}")
    async def get_result(call_id: str):
        try:
            call = _modal.FunctionCall.from_id(call_id)
            result_json = call.get(timeout=0)  # raises TimeoutError if still running
            result = json.loads(result_json) if isinstance(result_json, str) else result_json
            result.pop("mask_b64", None)
            result["status"] = "done"
            return result
        except TimeoutError:
            return {"status": "pending"}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    return web_app
