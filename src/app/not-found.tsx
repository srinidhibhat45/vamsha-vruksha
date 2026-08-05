import type { Metadata } from "next";
import { AppLink as Link } from "@/components/AppLink";
import { KastiRule } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "Not found",
  robots: { index: false, follow: true },
};

/**
 * Every dead link on this site — a merged record, a mistyped id, a bookmark
 * to a person who was found to be a duplicate and folded into someone else —
 * lands here rather than on the framework's bare default, so it at least
 * offers the two things a reader in that position actually wants next.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[600px] px-4 py-24 text-center">
      <p className="eyebrow">
        <span className="deva" lang="kok">
          न मेळ्ळें
        </span>{" "}
        · Not found
      </p>
      <h1 className="mt-2 font-display text-[2.4rem] font-medium leading-tight">
        That record isn&rsquo;t here
      </h1>
      <p className="mx-auto mt-4 max-w-md text-[1.05rem] leading-relaxed text-[var(--fg-soft)]">
        The page you followed a link to has moved, was merged into another
        record, or never existed. Nothing else on the archive is affected.
      </p>

      <KastiRule className="my-8" />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/search" className="btn btn-filled">
          Search the archive
        </Link>
        <Link href="/" className="btn btn-tonal">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
