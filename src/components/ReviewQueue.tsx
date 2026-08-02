"use client";

import Link from "next/link";
import { useState } from "react";
import type { Submission } from "@/lib/types";

const STATUS_STYLE: Record<string, string> = {
  pending: "chip-accent",
  approved: "chip-mool",
  rejected: "chip",
  merged: "chip-gotra",
};

export function ReviewQueue({
  submissions,
  reviewKey,
}: {
  submissions: Submission[];
  reviewKey: string;
}) {
  const [items, setItems] = useState(submissions);
  const [filter, setFilter] = useState<string>("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (id: string, status: string, note?: string) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: reviewKey, id, status, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "That did not work");
        return;
      }
      const data = await res.json();
      setItems((list) =>
        list.map((s) => (s.id === id ? data.submission : s)),
      );
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  };

  const shown = items.filter((s) => filter === "all" || s.status === filter);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {["pending", "approved", "rejected", "merged", "all"].map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className="chip"
          >
            {f}
            <span className="text-[var(--fg-faint)]">
              {f === "all"
                ? items.length
                : items.filter((s) => s.status === f).length}
            </span>
          </button>
        ))}
      </div>

      <p role="alert" className="mt-4 text-[0.92rem] text-[var(--accent)]">
        {error}
      </p>

      {shown.length === 0 ? (
        <p className="mt-8 text-[0.95rem] text-[var(--fg-faint)]">
          Nothing {filter === "all" ? "in the queue" : `marked ${filter}`}.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {shown.map((s) => (
            <li key={s.id} className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`chip chip-sm ${STATUS_STYLE[s.status] ?? ""}`}>
                      {s.status}
                    </span>
                    <span className="chip chip-sm">{s.kind.replace("-", " ")}</span>
                    <span className="text-[0.85rem] text-[var(--fg-faint)]">
                      {new Date(s.submittedAt).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="mt-2.5 font-display text-[1.3rem] font-medium">
                    {String(s.payload.displayName ?? "(no name given)")}
                  </h2>
                  <p className="mt-0.5 text-[0.88rem] text-[var(--fg-soft)]">
                    from {s.submitter.name}
                    {s.submitter.relationship && ` — ${s.submitter.relationship}`}
                    {s.submitter.email && ` · ${s.submitter.email}`}
                  </p>
                  {s.targetId && (
                    <p className="mt-1.5 text-[0.88rem]">
                      correcting{" "}
                      <Link
                        href={`/person/${s.targetId}`}
                        className="link-underline"
                      >
                        {s.targetId}
                      </Link>
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => act(s.id, "approved")}
                    className="btn btn-filled btn-sm"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => act(s.id, "merged")}
                    className="btn btn-outlined btn-sm"
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => act(s.id, "rejected")}
                    className="btn btn-text btn-sm"
                  >
                    Reject
                  </button>
                </div>
              </div>

              {s.message && (
                <p className="mt-3 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3.5 text-[0.92rem] leading-relaxed italic text-[var(--fg-soft)]">
                  “{s.message}”
                </p>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer py-1 text-[0.88rem] text-[var(--fg-faint)]">
                  Full payload
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3 text-[0.8rem] leading-relaxed scroll-slim">
                  {JSON.stringify(s.payload, null, 2)}
                </pre>
              </details>

              {s.reviewerNote && (
                <p className="mt-2 text-[0.88rem] text-[var(--fg-faint)]">
                  Reviewer note: {s.reviewerNote}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
