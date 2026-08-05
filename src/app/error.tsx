"use client";

import { useEffect } from "react";
import { AppLink as Link } from "@/components/AppLink";

/**
 * The site-wide error boundary.
 *
 * Every other page here is either static or a straightforward read of the
 * in-memory archive, so a render actually reaching this is unusual — worth
 * logging, and worth telling the reader plainly that it was the page's
 * fault rather than something wrong with the record they came to look at.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[page error]", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[600px] px-4 py-24 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="mt-2 font-display text-[2.4rem] font-medium leading-tight">
        This page hit a snag
      </h1>
      <p className="mx-auto mt-4 max-w-md text-[1.05rem] leading-relaxed text-[var(--fg-soft)]">
        Nothing in the archive was changed or lost — this is a fault in the
        page itself. Try again, or come back to it later.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn btn-filled">
          Try again
        </button>
        <Link href="/" className="btn btn-tonal">
          Go to the home page
        </Link>
      </div>
    </div>
  );
}
