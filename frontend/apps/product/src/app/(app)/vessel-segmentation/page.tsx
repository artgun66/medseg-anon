"use client";

import { useCallback, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// Large files (NRRD/NIfTI) exceed Render's ~30 MB body limit, so upload directly
// to the Modal HTTP endpoint which has no such restriction.
const VESSEL_URL =
  process.env.NEXT_PUBLIC_VESSEL_URL ??
  "https://anon-workspace--vessel-vessel-api.modal.run";

type Result = {
  job_id: string;
  vessel_voxels: number;
  preview_image: string;
  overlay_image: string;
  error?: string;
};

function formatVoxels(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function VesselSegmentationPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f); setResult(null); setError(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const run = async () => {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData();
      fd.append("scan", file);
      // Step 1: upload file, get call_id immediately
      const resp = await fetch(`${VESSEL_URL}/segment`, { method: "POST", body: fd });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        let msg = "Request failed";
        try { msg = JSON.parse(text).detail ?? JSON.parse(text).error ?? msg; } catch { if (text && !text.trimStart().startsWith("<")) msg = text.slice(0, 300); }
        throw new Error(msg);
      }
      const { call_id } = await resp.json();
      // Step 2: poll until done (GPU inference can take 2-5 min)
      for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const poll = await fetch(`${VESSEL_URL}/result/${call_id}`);
        if (!poll.ok) throw new Error("Polling failed");
        const data = await poll.json();
        if (data.status === "done") { setResult(data); return; }
        if (data.status !== "pending") throw new Error(data.detail ?? "Inference failed");
      }
      throw new Error("Timed out after 10 minutes");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadMask = () => {
    if (!result) return;
    window.open(`${API}/api/vessel/download/${result.job_id}/`, "_blank");
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text)]">Brain Vessel Segmentation</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            nnUNet · robust-vessel-segmentation · 3D CTA → binary vessel mask
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
          Research only
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-2">

        {/* Left: upload + run */}
        <div className="flex flex-col gap-4">

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition ${
              dragging
                ? "border-[var(--accent)] bg-[var(--accent)]/10"
                : "border-[var(--border)] hover:border-[var(--accent)]/50 hover:bg-[var(--panel-elevated)]"
            }`}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <svg className="h-7 w-7 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-medium text-[var(--accent)]">{file.name}</p>
                <p className="text-xs text-[var(--muted)]">NIfTI ready — no browser preview available</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <svg className="h-7 w-7 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm text-[var(--muted)]">
                  Drop a CTA scan or <span className="text-[var(--accent)]">browse</span>
                </p>
                <p className="text-xs text-[var(--muted)]">NIfTI (.nii.gz, .nii) or NRRD (.nrrd)</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".nii,.nii.gz,.nrrd,.mhd,.mha,application/gzip"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {file && (
            <p className="text-xs text-[var(--muted)]">
              {file.name}{" "}
              <button className="text-[var(--accent)] hover:underline" onClick={() => { setFile(null); setResult(null); }}>
                Remove
              </button>
            </p>
          )}

          <button
            onClick={run}
            disabled={!file || loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Segmenting… (GPU inference, may take 2–5 min)
              </>
            ) : "Segment vessels"}
          </button>

          {error && (
            <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error)]/10 px-3 py-2 text-xs text-[var(--error)]">{error}</div>
          )}

        </div>

        {/* Right: results */}
        <div className="flex flex-col gap-4">
          {result ? (
            <>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
                <p className="text-sm font-semibold text-[var(--success)]">Segmentation complete</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {formatVoxels(result.vessel_voxels)} vessel voxels detected
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1.5 text-xs uppercase tracking-wider text-[var(--muted)]">Input (axial)</p>
                  <img
                    src={`data:image/png;base64,${result.preview_image}`}
                    alt="CTA axial slice"
                    className="w-full rounded-xl border border-[var(--border)]"
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs uppercase tracking-wider text-[var(--muted)]">Vessel overlay</p>
                  <img
                    src={`data:image/png;base64,${result.overlay_image}`}
                    alt="Vessel segmentation overlay"
                    className="w-full rounded-xl border border-[var(--border)]"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={downloadMask}
                  className="flex-1 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-2 text-xs font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20"
                >
                  Download 3D mask (.nii.gz)
                </button>
                <button
                  onClick={() => { setResult(null); setFile(null); }}
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] transition hover:text-[var(--text)]"
                >
                  New scan
                </button>
              </div>
            </>
          ) : (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] text-center">
              <p className="text-sm text-[var(--muted)]">Results will appear here</p>
              <p className="text-xs text-[var(--muted)]">Upload a .nii.gz CTA scan and click Segment vessels</p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-[var(--muted)]">
        MedSeg · alceballosa/robust-vessel-segmentation · CC-BY-NC-SA 4.0 · not for clinical use.
      </p>

    </main>
  );
}
