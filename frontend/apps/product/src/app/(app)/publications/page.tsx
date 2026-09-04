export default function PublicationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:px-10 md:py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
        Publications
      </h1>
      <article className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">
            Under review
          </span>
        </div>

        <h2 className="mt-4 text-xl font-semibold leading-snug tracking-tight text-[var(--text)]">
          Publication details withheld for anonymous review
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          The manuscript associated with this project is currently under double-blind
          peer review. Title, authors, affiliations, venue, and results are withheld
          until the review process concludes.
        </p>
      </article>

      <p className="mt-8 text-xs text-[var(--muted)]/60">
        Research prototype · not for clinical diagnosis or treatment.
      </p>
    </main>
  );
}
