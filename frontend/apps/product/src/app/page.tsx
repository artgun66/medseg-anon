const CAPABILITIES = [
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-3.564-.69L3 20.25l1.64-4.418A8.964 8.964 0 013 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
    title: "Ask about stroke",
    description: "Ask anything about stroke types, symptoms, risk factors, treatment options, or recovery. The assistant answers using medical knowledge.",
    href: "/threads",
    cta: "Start chatting",
    accent: "from-[var(--accent-2)] to-[var(--accent)]",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v13" />
      </svg>
    ),
    title: "Analyse a CT scan",
    description: "Upload a non-contrast CT brain image. The AI segments and highlights hemorrhagic or ischemic lesions.",
    href: "/biomedparse",
    cta: "Upload scan",
    accent: "from-red-500/80 to-red-700/80",
  },
  {
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 22V13m0 0 4.2-4.2M12 13 7.8 8.8M12 13V7.2" />
        <circle cx="12" cy="4.8" r="2.2" />
        <circle cx="18" cy="7" r="2.2" />
        <circle cx="6" cy="7" r="2.2" />
      </svg>
    ),
    title: "Segment vessels",
    description: "Upload 3D CTA volumes for nnUNet vessel segmentation, preview overlays, and export a binary mask.",
    href: "/vessel-segmentation",
    cta: "Segment CTA",
    accent: "from-cyan-500 to-blue-600",
  },
];


export default async function Page() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:px-10 md:py-16">

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <div className="mb-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8 md:p-12">
        <div className="max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text)] md:text-6xl">
            Understand stroke findings with{" "}
            <span className="bg-gradient-to-r from-[var(--accent-2)] to-[var(--accent)] bg-clip-text text-transparent">
              guided AI analysis
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg">
            Validated stroke-imaging models are often locked behind machine-learning tooling. MedSeg brings
            them into one simple interface with MedGemma chat, fine-tuned BiomedParse lesion segmentation
            (developed by our team, see{" "}
            <a href="/publications" className="font-medium text-[var(--accent)] hover:underline">Publications</a>),
            and cerebrovascular
            vessel segmentation, so you can upload a CT or CTA scan, inspect overlays, and ask follow-up questions.
          </p>
          <p className="mt-6 text-sm leading-relaxed text-[var(--muted)]">
            MedSeg is fully open source.{" "}
            <a
              href="https://anonymous.4open.science/r/ct-stroke-vlm"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              View the code on GitHub →
            </a>
          </p>
        </div>
      </div>

      {/* ── Combined card ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <div className="grid gap-6 md:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <a key={c.href} href={c.href} className="group rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 transition hover:border-[var(--accent)]">
              <div className="mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--panel-elevated)] text-[var(--accent)]">
                {c.icon}
              </div>
              <div className="flex min-h-32 flex-col">
                <p className="text-sm font-semibold text-[var(--text)]">{c.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{c.description}</p>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-xs font-semibold text-[var(--accent)]">
                  {c.cta}
                  <svg className="h-3 w-3 transition group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ── Desktop download ───────────────────────────────────────────────── */}
      <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Run locally</p>
            <p className="mt-1 text-base font-semibold text-[var(--text)]">Download the desktop app</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Run MedSeg fully offline, with all inference on your own hardware and no account needed.
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)]">
            <svg className="h-5 w-5 text-[var(--text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
            </svg>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {/* macOS Apple Silicon */}
          <a
            href="https://anonymous.4open.science/r/ct-stroke-vlm"
            download
            className="group flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 transition hover:border-[var(--accent)]"
          >
            <svg className="h-7 w-7 shrink-0 text-[var(--text)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">macOS · Apple Silicon</p>
              <p className="text-xs text-[var(--muted)]">M1 / M2 / M3 · .dmg</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-y-0.5 group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>

          {/* macOS Intel */}
          <a
            href="https://anonymous.4open.science/r/ct-stroke-vlm"
            download
            className="group flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 transition hover:border-[var(--accent)]"
          >
            <svg className="h-7 w-7 shrink-0 text-[var(--text)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">macOS · Intel</p>
              <p className="text-xs text-[var(--muted)]">x86_64 · .dmg</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-y-0.5 group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>

          {/* Windows */}
          <a
            href="https://anonymous.4open.science/r/ct-stroke-vlm"
            download
            className="group flex flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 transition hover:border-[var(--accent)]"
          >
            <svg className="h-7 w-7 shrink-0 text-[var(--text)]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 12V6.75l6-1.32v6.57H3zm17 0V5.25L10 3v9h10zm0 .75V18.75L10 21v-9h10zM3 18.75v-6H9v6.42l-6-1.32z"/>
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--text)]">Windows</p>
              <p className="text-xs text-[var(--muted)]">Windows 10/11 64-bit · .exe</p>
            </div>
            <svg className="h-4 w-4 shrink-0 text-[var(--muted)] transition group-hover:translate-y-0.5 group-hover:text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
          </a>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--panel-elevated)] px-3 py-2.5">
          <p className="text-xs font-medium text-[var(--text)]">First launch on macOS</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            Move MedSeg to Applications, then run{" "}
            <code className="rounded bg-[var(--bg)] px-1 py-0.5 text-[11px] text-[var(--text)]">xattr -cr /Applications/MedSeg.app</code>{" "}
            in Terminal and open it normally.
          </p>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          GPU with ≥ 8 GB VRAM recommended · macOS 13+ or Windows 10+ ·{" "}
          <a href="https://anonymous.4open.science/r/ct-stroke-vlm" target="_blank" rel="noopener noreferrer"
            className="text-[var(--accent)] hover:underline">All releases</a>
        </p>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <p className="mt-8 text-xs leading-relaxed text-[var(--muted)]">
        MedSeg is not intended for clinical diagnosis or treatment. Always consult a qualified physician.
      </p>

    </main>
  );
}
