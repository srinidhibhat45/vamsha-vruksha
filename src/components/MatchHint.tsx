"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MatchCandidate, MatchDescriptor } from "@/lib/match";

/**
 * "This may already be here", said while there is still time to act on it.
 *
 * The archive already warned about duplicates on the thank-you screen, after
 * the submission had gone. That is the wrong moment in the only way that
 * matters: the contributor has finished, and the merge is now a moderator's
 * problem rather than a two-second decision by the one person who actually
 * knows whether these are the same great-grandfather.
 *
 * So this sits under the name fields and updates as they are filled in, and it
 * offers an action rather than a warning. `onLink` is the whole design — the
 * useful reply to "this looks like Vasudev Kamath of Keloshi" is not "noted",
 * it is to make this row *be* that record, so the branch attaches to the
 * family already in the archive instead of starting a parallel copy of it.
 */
export function MatchHint({
  descriptor,
  onLink,
  linkLabel = "This is the same person",
  heading = "This may already be in the archive",
  /** Nothing is requested until the name is at least this long. */
  minLength = 3,
}: {
  descriptor: MatchDescriptor;
  /** Omitted where linking is not possible — then it is advice, not an action. */
  onLink?: (match: MatchCandidate) => void;
  linkLabel?: string;
  heading?: string;
  minLength?: number;
}) {
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [dismissed, setDismissed] = useState(false);

  // Serialised so the effect re-runs on a changed *value* rather than on a new
  // object identity — the parent rebuilds this descriptor on every keystroke.
  const key = JSON.stringify(descriptor);
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    lastKey.current = key;
    if (dismissed) setDismissed(false);
  }

  useEffect(() => {
    const desc = JSON.parse(key) as MatchDescriptor;
    const name = [desc.given, desc.surname].filter(Boolean).join("").trim();
    if (name.length < minLength) {
      setMatches([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(desc),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { matches?: MatchCandidate[] };
        setMatches(data.matches ?? []);
      } catch {
        /* superseded by a later keystroke, or offline — silence is correct */
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key, minLength]);

  if (dismissed || matches.length === 0) return null;

  const strong = matches.some((m) => m.strength === "strong");

  return (
    <div
      role="status"
      className={`rounded-[var(--shape-md)] border p-3.5 ${
        strong
          ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]"
          : "border-[var(--color-gold)] bg-[color-mix(in_oklab,var(--color-gold)_7%,transparent)]"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[0.9rem] font-semibold">
          {strong ? "This looks like somebody already here" : heading}
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="btn btn-text btn-sm"
        >
          Not any of these
        </button>
      </div>

      <ul className="mt-2.5 space-y-2.5">
        {matches.map((m) => (
          <li
            key={m.id}
            className="rounded-[var(--shape-sm)] bg-[color-mix(in_oklab,var(--bg-raised)_70%,transparent)] p-2.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-2">
              <Link
                href={m.href}
                target="_blank"
                className="link-underline text-[0.95rem] font-medium"
              >
                {m.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </Link>
              {m.detail && (
                <span className="text-[0.82rem] text-[var(--fg-faint)]">
                  {m.detail}
                </span>
              )}
            </div>

            {/*
              The reasons, not the percentage. A contributor can check "father
              is Vasudev Kamath" against what they know; they cannot check 87%.
            */}
            <p className="mt-1 text-[0.85rem] leading-relaxed text-[var(--fg-soft)]">
              {m.reasons.join(" · ")}
            </p>

            {onLink && (
              <button
                type="button"
                onClick={() => onLink(m)}
                className="btn btn-tonal btn-sm mt-2"
              >
                {linkLabel}
              </button>
            )}
          </li>
        ))}
      </ul>

      {onLink && (
        <p className="mt-2.5 text-[0.8rem] leading-relaxed text-[var(--fg-faint)]">
          Linking joins your entry to the record that is already here instead of
          adding a second copy of the same person. Anything you have filled in
          that the archive is missing still reaches a reviewer.
        </p>
      )}
    </div>
  );
}
