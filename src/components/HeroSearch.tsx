"use client";

import { AppLink as Link } from "@/components/AppLink";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The front page's search box.
 *
 * It is the single most important control on the site — most people arrive
 * looking for one name — so it is deliberately outsized: 64px tall, its own
 * elevation, and nothing else on the page competing at that weight. The three
 * navigational actions underneath are text buttons for exactly that reason.
 */
export function HeroSearch({
  examples,
  centred = false,
}: {
  examples: string[];
  centred?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <div className={centred ? "mx-auto w-full max-w-2xl" : "w-full max-w-xl"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
        role="search"
      >
        {/*
          The lead icon and the submit button reserve their own room through
          --field-lead / --field-trail rather than through hand-tuned padding
          utilities, which is what used to leave the magnifier sitting on top
          of the placeholder.
        */}
        <div className="field-wrap [--field-lead:3.5rem] [--field-trail:8.5rem]">
          <span className="field-lead">
            <svg
              viewBox="0 0 20 20"
              className="h-[1.35rem] w-[1.35rem]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="6" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="A name, surname, gotra or village…"
            aria-label="Search the archive"
            type="search"
            className="field field-round min-h-16 border-[1.5px] bg-[var(--bg-raised)] text-[1.05rem] shadow-[var(--shadow-lift)]"
            autoComplete="off"
          />
          <span className="field-trail field-trail-interactive">
            <button type="submit" className="btn btn-filled btn-lg">
              Search
            </button>
          </span>
        </div>
      </form>

      <div
        className={`mt-4 flex flex-wrap items-center gap-2 text-[0.85rem] text-[var(--fg-faint)] ${
          centred ? "justify-center" : ""
        }`}
      >
        <span id="hero-examples-label">Try</span>
        {examples.map((ex) => (
          <Link
            key={ex}
            href={`/search?q=${encodeURIComponent(ex)}`}
            aria-describedby="hero-examples-label"
            className="chip chip-sm"
          >
            {ex}
          </Link>
        ))}
      </div>
    </div>
  );
}
