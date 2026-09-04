import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NavLink } from "../components/NavLink";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MedSeg — AI-powered stroke analysis",
  description:
    "Ask questions about stroke and analyse CT scans with AI-powered segmentation. Research tool for stroke education and detection.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`h-full min-h-0 antialiased ${fontSans.className}`}>
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col px-0 sm:px-3">
          <header className="z-20 grid min-h-[4.5rem] shrink-0 grid-cols-1 gap-3 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 sm:mt-3 sm:rounded-2xl sm:border sm:px-5 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-4 md:py-0">
            <Link
              href="/"
              className="group min-w-0 justify-self-start rounded-2xl px-1 py-0.5 transition hover:bg-slate-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
            >
              <div className="flex items-center gap-2.5">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold tracking-tight text-[var(--text)]">
                    MedSeg
                  </div>
                  <p className="hidden text-[11px] leading-tight text-[var(--muted)] sm:block sm:max-w-[220px]">
                    AI-powered stroke analysis
                  </p>
                </div>
              </div>
            </Link>
            <nav
              className="flex min-w-0 items-center justify-start gap-1 overflow-x-auto rounded-full border border-[var(--border)] bg-[var(--bg)] p-1 md:justify-self-center"
              aria-label="Main"
            >
              <NavLink href="/threads">Chat</NavLink>
              <NavLink href="/biomedparse">Stroke Segmentation</NavLink>
              <NavLink href="/vessel-segmentation">Vessel Segmentation</NavLink>
            </nav>
            <div className="flex items-center justify-start gap-4 md:justify-self-end">
              <Link
                href="/publications"
                className="inline-flex items-center text-xs font-medium text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                Publications
              </Link>
              <a
                href="https://anonymous.4open.science/r/ct-stroke-vlm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)] transition hover:text-[var(--text)]"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 015.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.53 11.53 0 0023.5 12.02C23.5 5.74 18.27.5 12 .5z" />
                </svg>
                GitHub
              </a>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto sm:py-3">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
