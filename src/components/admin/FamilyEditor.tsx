"use client";

import { AppLink as Link } from "@/components/AppLink";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FamilyBuilder } from "../family/FamilyBuilder";
import { checkDraft, describeDraft, displayOf } from "@/lib/family";
import type { ContributeRefs } from "../ContributeForm";
import type { DraftPerson } from "@/lib/types";

/**
 * A maintainer entering a whole family.
 *
 * The same builder the public form uses, because the tedious part is identical
 * on both sides and the difference is only what happens at the end — a
 * maintainer's family is written straight into the archive rather than into
 * the queue. Building a separate admin version of a screen this size would
 * have guaranteed the two drifted, and the one that drifted would be the
 * public one, which is exactly backwards.
 *
 * What is added here is what a maintainer needs and a contributor does not: an
 * unsaved-work guard, and a result panel with the minted ids to open.
 */
export function FamilyEditor({ refs }: { refs: ContributeRefs }) {
  const router = useRouter();
  const [people, setPeople] = useState<DraftPerson[]>([]);
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const [result, setResult] = useState<{
    created: string[];
    updated: string[];
    warnings: string[];
  } | null>(null);

  const dirty = people.length > 0 && !result;

  // A forty-person family lost to a stray reload is an evening gone. The admin
  // record editor guards the same way.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = async () => {
    setBusy(true);
    setError(null);
    setIssues([]);

    const problems = checkDraft({ people }).filter((p) => p.severity === "error");
    if (problems.length) {
      setIssues(problems.map((p) => ({ path: p.key ?? "", message: p.message })));
      setBusy(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: people.map((p) => ({
            ...p,
            // A maintainer states records rather than remembering them, so the
            // default provenance is different from a contributor's.
            confidence: p.confidence ?? "unverified",
          })),
          note: credit || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace("/admin/login?next=/admin/people/family");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "That did not save");
        setIssues(data.issues ?? []);
        return;
      }

      setResult({
        created: data.created ?? [],
        updated: data.updated ?? [],
        warnings: data.warnings ?? [],
      });
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="surface p-8">
        <h2 className="font-display text-[1.8rem] font-medium">
          {result.created.length} record
          {result.created.length === 1 ? "" : "s"} written
        </h2>
        {result.updated.length > 0 && (
          <p className="mt-2 text-[0.95rem] text-[var(--fg-soft)]">
            {result.updated.length} existing record
            {result.updated.length === 1 ? " was" : "s were"} updated to carry
            the new marriage links.
          </p>
        )}

        {result.warnings.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-5 text-[0.9rem] text-[var(--fg-soft)]">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}

        <ul className="mt-5 flex flex-wrap gap-2">
          {result.created.map((id) => (
            <li key={id}>
              <Link href={`/admin/people/${encodeURIComponent(id)}`} className="chip chip-sm">
                {id}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setPeople([]);
            }}
            className="btn btn-filled"
          >
            Enter another family
          </button>
          <Link href="/admin/people" className="btn btn-outlined">
            Back to records
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FamilyBuilder
        refs={refs}
        people={people}
        onChange={setPeople}
        variant="admin"
      />

      {people.length > 0 && (
        <section className="surface p-6">
          <label className="label" htmlFor="family-credit">
            Credited to
          </label>
          <input
            id="family-credit"
            className="field mt-1.5"
            value={credit}
            onChange={(e) => setCredit(e.target.value)}
            placeholder="From the Kashi Math register, entered by the maintainer"
            aria-describedby="family-credit-hint"
          />
          <p id="family-credit-hint" className="hint mt-1">
            Written against every record this creates. Left blank, they are
            credited to the maintainer.
          </p>
        </section>
      )}

      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-[0.95rem] text-[var(--accent)]">
            {error}
          </p>
        )}
        {issues.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-[0.9rem] text-[var(--accent)]">
            {issues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] px-1 py-4 backdrop-blur">
        <button
          type="button"
          onClick={save}
          disabled={busy || people.length === 0}
          aria-busy={busy}
          className="btn btn-filled btn-lg"
        >
          {busy
            ? "Writing…"
            : `Write ${people.filter((p) => !p.existingId).length || "these"} record${
                people.filter((p) => !p.existingId).length === 1 ? "" : "s"
              }`}
        </button>
        <p className="text-[0.85rem] text-[var(--fg-faint)]">
          {people.length
            ? `${people.length} in the draft${
                people.some((p) => p.existingId)
                  ? `, ${people.filter((p) => p.existingId).length} already in the archive`
                  : ""
              }. Written straight to the archive — no review step.`
            : "Nothing to write yet."}
        </p>
        {people.length > 0 && (
          <span className="ml-auto text-[0.85rem] text-[var(--fg-faint)]">
            {displayOf(people[0]) || describeDraft(people[0], people)}
            {people.length > 1 && ` and ${people.length - 1} more`}
          </span>
        )}
      </div>
    </div>
  );
}
