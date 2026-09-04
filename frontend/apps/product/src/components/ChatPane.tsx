"use client";

import type { ThreadMessage } from "@local-llm/api-client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { AvailableModel } from "../app/(app)/threads/view/ThreadView";
import { api, apiBaseUrl } from "../lib/api";
import { MessageInput, type ImageAttachment, type NiftiAttachment, type MessageInputHandle } from "./MessageInput";

type BiomedResult = {
  target: "bleeding" | "stroke";
  detected: boolean;
  confidence: number;
  overlay_image: string;
  original_image: string;
};

type VesselResult = {
  job_id: string;
  vessel_voxels: number;
  preview_image: string;
  overlay_image: string;
};

type DisplayMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  pending?: boolean;
  attachedImages?: string[];
  biomedResults?: BiomedResult[];
  biomedPending?: boolean;
  vesselResults?: VesselResult[];
  vesselPending?: boolean;
};

type Props = {
  threadId: string;
  initialMessages: ThreadMessage[];
  modelSlug: string;
  availableModels: AvailableModel[];
  onModelChange: (slug: string) => void;
  systemPrompt: string;
  onSystemPromptSave: (next: string) => Promise<void>;
  onMessageComplete?: () => void;
};

type ApiMessage =
  | { role: string; content: string }
  | {
      role: string;
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// Decide which BiomedParse targets to run for a dropped image. If the user's
// message clearly asks for one (e.g. "check for bleeding"), run just that; if it
// says nothing specific — the common case of dropping an image into chat — run
// BOTH hemorrhage and ischemic so neither is silently skipped.
function detectTargets(text: string): ("bleeding" | "stroke")[] {
  const lc = text.toLowerCase();
  const mentionsStroke = lc.includes("stroke") || lc.includes("ischemic") || lc.includes("ischaemic") || lc.includes("infarct");
  const mentionsBleed = lc.includes("bleed") || lc.includes("hemorrhage") || lc.includes("haemorrhage") || lc.includes("blood");
  if (mentionsStroke && !mentionsBleed) return ["stroke"];
  if (mentionsBleed && !mentionsStroke) return ["bleeding"];
  return ["bleeding", "stroke"];
}

async function runBiomedParse(img: ImageAttachment, target: "bleeding" | "stroke"): Promise<BiomedResult | null> {
  try {
    const fd = new FormData();
    fd.append("image", dataUrlToBlob(img.dataUrl), img.name);
    fd.append("prompt", target);
    const resp = await fetch(`${apiBaseUrl}/api/biomedparse/segment/`, { method: "POST", body: fd });
    if (!resp.ok) return null;
    const data = await resp.json();
    return { target, ...data };
  } catch {
    return null;
  }
}

async function runVesselSegment(nifti: NiftiAttachment): Promise<VesselResult | null> {
  try {
    const fd = new FormData();
    fd.append("scan", nifti.file, nifti.name);
    const resp = await fetch(`${apiBaseUrl}/api/vessel/segment/`, { method: "POST", body: fd });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

export function ChatPane({
  threadId,
  initialMessages,
  modelSlug,
  availableModels,
  onModelChange,
  onMessageComplete,
}: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(
    initialMessages.map((m) => ({
      role: m.role === "tool" ? "system" : m.role,
      content: m.content,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<MessageInputHandle>(null);
  const dragDepth = useRef(0);
  const modelSelectId = useId();
  const currentModelId = `${modelSelectId}-current`;
  const controlRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset)]";

  const currentModelHasVision = useMemo(
    () => availableModels.find((m) => m.slug === modelSlug)?.visionEnabled ?? false,
    [availableModels, modelSlug],
  );

  const didInitialScroll = useRef(false);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: didInitialScroll.current ? "smooth" : "auto",
      block: "end",
    });
    didInitialScroll.current = true;
  }, [messages]);

  // Auto-send BiomedParse context when navigated from the CT analysis page.
  const prefillFired = useRef(false);
  useEffect(() => {
    if (prefillFired.current || !modelSlug) return;
    const raw = typeof window !== "undefined"
      ? sessionStorage.getItem("medseg_biomedparse_prefill")
      : null;
    if (!raw) return;
    prefillFired.current = true;
    sessionStorage.removeItem("medseg_biomedparse_prefill");
    try {
      const ctx = JSON.parse(raw) as { message: string; images: Array<{ name: string; dataUrl: string }> };
      const imgs: ImageAttachment[] = ctx.images.map(img => ({
        kind: "image" as const,
        name: img.name,
        dataUrl: img.dataUrl,
        size: img.dataUrl.length,
      }));
      send(ctx.message, imgs, []);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelSlug]);

  async function send(text: string, images: ImageAttachment[], niftis: NiftiAttachment[]) {
    if ((!text.trim() && images.length === 0 && niftis.length === 0) || busy || !modelSlug) return;
    setError(null);

    const visibleText = text.trim() || (niftis.length > 0 ? "(CTA scan submitted for vessel analysis)" : "(CT scan submitted for analysis)");
    const userMsg: DisplayMessage = {
      role: "user",
      content: visibleText,
      attachedImages: images.map((img) => img.dataUrl),
      biomedPending: images.length > 0,
      vesselPending: niftis.length > 0,
    };

    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", content: "", pending: true },
    ]);
    setBusy(true);

    // ── 1a. Run BiomedParse on every image ─────────────────────────────────
    let biomedResults: BiomedResult[] = [];
    if (images.length > 0) {
      const targets = detectTargets(text);
      const settled = await Promise.all(
        images.flatMap((img) => targets.map((t) => runBiomedParse(img, t))),
      );
      biomedResults = settled.filter((r): r is BiomedResult => r !== null);

      setMessages((prev) => {
        const copy = [...prev];
        const userIdx = copy.length - 2;
        if (userIdx >= 0) copy[userIdx] = { ...copy[userIdx], biomedResults, biomedPending: false };
        return copy;
      });
    }

    // ── 1b. Run vessel segmentation on every NIfTI ─────────────────────────
    let vesselResults: VesselResult[] = [];
    if (niftis.length > 0) {
      const settled = await Promise.all(niftis.map((n) => runVesselSegment(n)));
      vesselResults = settled.filter((r): r is VesselResult => r !== null);

      setMessages((prev) => {
        const copy = [...prev];
        const userIdx = copy.length - 2;
        if (userIdx >= 0) copy[userIdx] = { ...copy[userIdx], vesselResults, vesselPending: false };
        return copy;
      });
    }

    // ── 2. Build LLM context ────────────────────────────────────────────────
    const biomedContext = biomedResults.length > 0
      ? biomedResults.map((r) => {
          const targetLabel = r.target === "bleeding" ? "intracranial hemorrhage" : "ischemic stroke";
          const verdict = r.detected ? "DETECTED" : "NOT DETECTED";
          return `[BiomedParse CT Scan Analysis]\nDetection target: ${targetLabel}\nResult: ${verdict}`;
        }).join("\n\n") + "\n\n"
      : "";

    const vesselContext = vesselResults.length > 0
      ? vesselResults.map((r) => {
          const voxelsMil = (r.vessel_voxels / 1_000_000).toFixed(2);
          return `[Vessel Segmentation Analysis]\nVessel voxels detected: ${r.vessel_voxels} (${voxelsMil}M)\nModel: nnUNet robust-vessel-segmentation Dataset241`;
        }).join("\n\n") + "\n\n"
      : "";

    const userContent = biomedContext + vesselContext + (text.trim() || (vesselResults.length > 0 ? "Based on the vessel segmentation results, what can you tell me about the vascular anatomy and any clinical implications?" : "Based on this CT scan analysis, what can you tell me about the findings? Explain what this means clinically."));

    // ── 3. Build OpenAI-format history for the LLM ─────────────────────────
    // For any prior user message that had BiomedParse results, reconstruct the
    // full context so the LLM keeps the scan findings across follow-up turns.
    const apiMessages: ApiMessage[] = messages
      .filter((m) => !m.pending)
      .map((m) => {
        if (m.role !== "user" || !m.biomedResults?.length) {
          return { role: m.role, content: m.content };
        }
        const ctx = m.biomedResults.map((r) => {
          const label = r.target === "bleeding" ? "intracranial hemorrhage" : "ischemic stroke";
          return `[BiomedParse CT Scan Analysis]\nTarget: ${label}\nResult: ${r.detected ? "DETECTED" : "NOT DETECTED"}`;
        }).join("\n\n");
        const userText = m.content === "(CT scan submitted for analysis)" ? "Analyse these findings." : m.content;
        return { role: m.role, content: ctx + "\n\n" + userText };
      });
    // Include the actual images in the LLM message so Qwen can see them.
    if (images.length > 0 && currentModelHasVision) {
      apiMessages.push({
        role: "user",
        content: [
          ...images.map((img) => ({ type: "image_url" as const, image_url: { url: img.dataUrl } })),
          { type: "text" as const, text: userContent },
        ],
      });
    } else {
      apiMessages.push({ role: "user", content: userContent });
    }

    // ── 4. Stream LLM response ─────────────────────────────────────────────
    let contentAssembled = "";
    let reasoningAssembled = "";
    try {
      for await (const chunk of api.streamChat({
        model: modelSlug,
        messages: apiMessages,
        thread_id: threadId,
      })) {
        if ("error" in chunk) { setError(chunk.error); break; }
        const delta = chunk.choices?.[0]?.delta;
        const dContent = delta?.content ?? "";
        const dReasoning = delta?.reasoning_content ?? "";
        if (!dContent && !dReasoning) continue;
        if (dContent) contentAssembled += dContent;
        if (dReasoning) reasoningAssembled += dReasoning;
        setMessages((prev) => {
          const copy = prev.slice();
          const last = copy[copy.length - 1];
          if (last?.pending) {
            copy[copy.length - 1] = {
              ...last,
              content: contentAssembled,
              reasoning: reasoningAssembled || undefined,
            };
          }
          return copy;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "stream failed");
    } finally {
      setMessages((prev) => {
        const copy = prev.slice();
        const last = copy[copy.length - 1];
        if (last?.pending) copy[copy.length - 1] = { ...last, pending: false };
        return copy;
      });
      setBusy(false);
      onMessageComplete?.();
    }
  }

  // ── drag-and-drop ──────────────────────────────────────────────────────────
  function onDragEnter(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault(); dragDepth.current += 1; setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }
  function onDragOver(e: React.DragEvent) {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault(); e.dataTransfer.dropEffect = "copy";
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); dragDepth.current = 0; setDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) inputRef.current?.addFiles(files);
  }

  const emptyPrompts = [
    "What symptoms suggest hemorrhagic stroke?",
    "Explain ASPECTS in plain language",
    "Drop a CT slice for segmentation",
  ];

  function roleLabel(role: DisplayMessage["role"]) {
    if (role === "assistant") return "MedSeg";
    if (role === "user") return "You";
    return "System";
  }

  function roleInitial(role: DisplayMessage["role"]) {
    if (role === "assistant") return "S";
    if (role === "user") return "Y";
    return "!";
  }

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragActive && (
        <div
          className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--accent-soft)]/60"
          aria-hidden
        >
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 py-4 text-sm font-semibold text-[var(--text)] shadow-sm">
            Drop files to attach
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:px-6">
        <div className="min-w-0">
          <p id={currentModelId} className="flex flex-wrap items-center gap-2 text-sm text-[var(--text)]">
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Active model
            </span>
            <span className="font-semibold">{modelSlug || "No local model selected"}</span>
            {currentModelHasVision && (
              <span className="inline-flex items-center rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white" title="This model accepts images">
                vision
              </span>
            )}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Drag in CT Slices for Stroke Segmentation or CTA Scans for Vessel Segmentation
          </p>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:shrink-0 sm:items-end">
          <label htmlFor={modelSelectId} className="text-xs font-medium text-[var(--muted)]">Switch model</label>
          <select
            id={modelSelectId}
            aria-describedby={currentModelId}
            className={"w-full min-w-0 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-medium text-[var(--text)] shadow-sm transition hover:border-[var(--accent)]/30 sm:min-w-72 " + controlRing}
            value={modelSlug}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {availableModels.length === 0 && <option value="">No local models — visit Hub</option>}
            {availableModels.map((m) => (
              <option key={m.slug} value={m.slug}>{m.slug}{m.visionEnabled ? " (vision)" : ""}</option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        {messages.length === 0 ? (
          <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8 text-center shadow-sm md:p-10">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-base font-semibold text-white">
              S
            </div>
            <p className="text-lg font-semibold text-[var(--text)]">How can MedSeg help?</p>
            <p className="mx-auto mt-3 max-w-lg text-balance text-sm leading-7 text-[var(--muted)]">
              Ask anything about stroke, or drop a CT brain scan image to get an
              AI-powered analysis with segmentation overlay. Follow-up questions
              are answered in context.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {emptyPrompts.map((hint) => (
                <span key={hint} className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
                  {hint}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mx-auto max-w-4xl space-y-5">
            {messages.map((m, i) => (
              <li key={i} className={"flex items-start gap-3 " + (m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role !== "user" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-xs font-semibold text-white">
                    {roleInitial(m.role)}
                  </div>
                )}
                <div className={
                  "max-w-[min(86%,46rem)] rounded-2xl border px-4 py-3 text-sm " +
                  (m.role === "user"
                    ? "border-blue-200 bg-blue-50 text-[var(--text)]"
                    : m.role === "assistant"
                      ? "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]"
                      : "border-[var(--border)] bg-[var(--panel-elevated)] text-[var(--muted)]")
                }>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">{roleLabel(m.role)}</p>

                  {/* Uploaded image thumbnails */}
                  {m.attachedImages && m.attachedImages.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {m.attachedImages.map((src, ii) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={ii} src={src} alt="Uploaded scan" className="h-28 w-28 rounded-lg object-cover border border-slate-200 shadow-sm" />
                      ))}
                    </div>
                  )}

                  {/* BiomedParse loading state */}
                  {m.biomedPending && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
                      <span className="text-xs text-[var(--muted)]">Analysing CT scan with BiomedParse (CPU — takes ~2-3 min)…</span>
                    </div>
                  )}

                  {/* Vessel segmentation loading state */}
                  {m.vesselPending && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
                      <span className="text-xs text-cyan-700">Running vessel segmentation (may take a few minutes)…</span>
                    </div>
                  )}

                  {/* BiomedParse results */}
                  {m.biomedResults && m.biomedResults.length > 0 && (
                    <div className="mb-3 space-y-3">
                      {m.biomedResults.map((r, ri) => (
                        <div key={ri} className={`rounded-xl border p-3 ${r.detected ? "border-red-500/30 bg-red-500/10" : "border-green-500/30 bg-green-500/10"}`}>
                          {/* Verdict row */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ${r.detected ? "bg-red-400 shadow-red-400/50" : "bg-green-400 shadow-green-400/50"}`} />
                            <p className={`text-sm font-semibold ${r.detected ? "text-red-700" : "text-green-700"}`}>
                              {r.detected
                                ? `${r.target === "bleeding" ? "Hemorrhage" : "Ischemic stroke"} detected`
                                : `No ${r.target === "bleeding" ? "hemorrhage" : "ischemic stroke"} detected`}
                            </p>
                          </div>
                          {/* Images */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted)]">Original</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${r.original_image}`} alt="Original CT" className="w-full rounded-lg" />
                            </div>
                            <div>
                              <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted)]">Segmentation</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${r.overlay_image}`} alt="Segmentation overlay" className="w-full rounded-lg" />
                            </div>
                          </div>
                          <p className="mt-2 text-xs italic text-[var(--muted)]/70">
                            BiomedParse fine-tuned model · not for clinical use
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Vessel segmentation results */}
                  {m.vesselResults && m.vesselResults.length > 0 && (
                    <div className="mb-3 space-y-3">
                      {m.vesselResults.map((r, ri) => (
                        <div key={ri} className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-500 shadow-sm shadow-cyan-300/60" />
                            <p className="text-sm font-semibold text-cyan-800">
                              Vessel segmentation complete
                            </p>
                            <span className="ml-auto text-xs text-cyan-600">
                              {r.vessel_voxels >= 1_000_000
                                ? `${(r.vessel_voxels / 1_000_000).toFixed(2)}M`
                                : `${(r.vessel_voxels / 1000).toFixed(1)}K`} vessel voxels
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted)]">CT axial slice</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${r.preview_image}`} alt="CT axial slice" className="w-full rounded-lg" />
                            </div>
                            <div>
                              <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted)]">Vessel overlay</p>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={`data:image/png;base64,${r.overlay_image}`} alt="Vessel overlay" className="w-full rounded-lg" />
                            </div>
                          </div>
                          <p className="mt-2 text-xs italic text-[var(--muted)]/70">
                            nnUNet robust-vessel-segmentation · not for clinical use
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message text */}
                  {m.reasoning && !m.content && (
                    <p className="whitespace-pre-wrap text-xs italic leading-6 text-[var(--muted)]">Thinking: {m.reasoning}</p>
                  )}
                  {m.content && <p className="whitespace-pre-wrap leading-7">{m.content}</p>}
                  {!m.content && !m.reasoning && m.pending && (
                    <div className="flex items-center gap-1.5 py-1" aria-label="Assistant is typing">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:-0.2s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:-0.1s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)]" />
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-white text-xs font-bold text-[var(--accent)] shadow-sm">
                    {roleInitial(m.role)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-4 text-xs text-[var(--error)]" role="alert">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <MessageInput
        ref={inputRef}
        disabled={busy || !modelSlug}
        hasModel={!!modelSlug}
        allowImages={true}
        onSend={send}
      />
    </div>
  );
}
