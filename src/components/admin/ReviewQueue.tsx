"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTimestamp } from "@/lib/datetime";
import type { Submission, SubmissionStatus } from "@/lib/types";

const STATUS_CHIP: Record<SubmissionStatus, string> = {
  pending: "chip-accent",
  "changes-requested": "chip-gotra",
  approved: "chip-math",
  merged: "chip-mool",
  rejected: "chip",
};

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "waiting",
  "changes-requested": "sent back",
  approved: "accepted",
  merged: "published",
  rejected: "declined",
};

const FILTERS: { id: string; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "changes-requested", label: "Sent back" },
  { id: "merged", label: "Published" },
  { id: "approved", label: "Accepted" },
  { id: "rejected", label: "Declined" },
  { id: "all", label: "Everything" },
];

type Action = "approve" | "accept-only" | "request-changes" | "reject" | "reopen";

/** Field names a reviewer should see first, in the order they matter. */
const PAYLOAD_ORDER = [
  "displayName",
  "given",
  "patronymic",
  "surname",
  "gender",
  "status",
  "birthYear",
  "birthPlace",
  "birthNote",
  "deathYear",
  "deathPlace",
  "gotra",
  "community",
  "math",
  "kuladevata",
  "mool",
  "veda",
  "sutra",
  "fatherName",
  "motherName",
  "spouseName",
  "marriageYear",
  "occupations",
  "residences",
  "epithet",
  "bio",
  "confidence",
];

function readable(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        typeof v === "object" && v !== null
          ? String((v as { title?: string }).title ?? JSON.stringify(v))
          : String(v),
      )
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function PayloadTable({ payload }: { payload: Record<string, unknown> }) {
  const known = PAYLOAD_ORDER.filter(
    (k) => payload[k] !== undefined && payload[k] !== "" && payload[k] !== null,
  );
  const rest = Object.keys(payload).filter(
    (k) =>
      !PAYLOAD_ORDER.includes(k) &&
      !k.endsWith("Id") &&
      payload[k] !== undefined &&
      payload[k] !== "" &&
      payload[k] !== null,
  );

  const rows = [...known, ...rest];
  if (rows.length === 0) {
    return (
      <p className="text-[0.9rem] text-[var(--fg-faint)]">
        The submission carries no fields.
      </p>
    );
  }

  return (
    <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,10rem)_1fr]">
      {rows.map((key) => (
        <div key={key} className="contents">
          <dt className="fact-label pt-0.5">{readable(key)}</dt>
          <dd className="text-[0.92rem] leading-snug">
            {renderValue(payload[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Card({
  submission,
  onAct,
  busy,
}: {
  submission: Submission;
  onAct: (id: string, action: Action, note?: string) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const s = submission;
  const decided = s.status !== "pending" && s.status !== "changes-requested";

  return (
    <li className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`chip chip-sm ${STATUS_CHIP[s.status]}`}>
              {STATUS_LABEL[s.status]}
            </span>
            <span className="chip chip-sm">{s.kind.replace(/-/g, " ")}</span>
            <time className="text-[0.82rem] text-[var(--fg-faint)]" dateTime={s.submittedAt}>
              {formatTimestamp(s.submittedAt)}
            </time>
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
              about{" "}
              <Link href={`/person/${s.targetId}`} className="link-underline">
                {s.targetId}
              </Link>{" "}
              ·{" "}
              <Link
                href={`/admin/people/${s.targetId}`}
                className="link-underline"
              >
                edit that record
              </Link>
            </p>
          )}

          {s.appliedTo && (
            <p className="mt-1.5 text-[0.88rem] text-[var(--fg-soft)]">
              Published as{" "}
              <Link href={`/person/${s.appliedTo}`} className="link-underline">
                {s.appliedTo}
              </Link>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {decided ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAct(s.id, "reopen")}
              className="btn btn-outlined btn-sm"
            >
              Put back in the queue
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAct(s.id, "approve", note || undefined)}
                className="btn btn-filled btn-sm"
              >
                Approve &amp; publish
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsking((v) => !v)}
                aria-expanded={asking}
                className="btn btn-outlined btn-sm"
              >
                Ask for changes
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAct(s.id, "reject", note || undefined)}
                className="btn btn-text btn-sm"
              >
                Decline
              </button>
            </>
          )}
        </div>
      </div>

      {s.message && (
        <p className="mt-3 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3.5 text-[0.92rem] italic leading-relaxed text-[var(--fg-soft)]">
          &ldquo;{s.message}&rdquo;
        </p>
      )}

      {asking && !decided && (
        <div className="mt-3 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3.5">
          <label className="label" htmlFor={`note-${s.id}`}>
            What does the contributor need to change?
          </label>
          <textarea
            id={`note-${s.id}`}
            rows={3}
            className="field mt-1.5"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="The birth year is a decade before the father's — could you check it against the horoscope?"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || !note.trim()}
              onClick={() => onAct(s.id, "request-changes", note)}
              className="btn btn-filled btn-sm"
            >
              Send it back
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="btn btn-text btn-sm"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-[0.8rem] leading-relaxed text-[var(--fg-faint)]">
            The note is stored on the submission. There is no mail in this
            archive yet, so tell them yourself
            {s.submitter.email ? ` at ${s.submitter.email}` : " if you have a way to"}.
          </p>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer py-1 text-[0.88rem] text-[var(--fg-faint)]">
          What was submitted
        </summary>
        <div className="mt-2.5 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3.5">
          <PayloadTable payload={s.payload} />
        </div>
      </details>

      {s.reviewerNote && (
        <p className="mt-2.5 border-l-2 border-[var(--accent)] pl-3 text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
          Reviewer note: {s.reviewerNote}
        </p>
      )}
    </li>
  );
}

export function ReviewQueue({
  submissions,
  initialFilter = "pending",
}: {
  submissions: Submission[];
  initialFilter?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(submissions);
  const [filter, setFilter] = useState(initialFilter);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const act = async (id: string, action: Action, note?: string) => {
    setBusy(id);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace("/admin/login?next=/admin/queue");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "That did not work");
        return;
      }

      setItems((list) => list.map((s) => (s.id === id ? data.submission : s)));
      if (data.person) {
        setFlash(
          data.person.created
            ? `Published as a new record — ${data.person.id}`
            : `Applied to ${data.person.id}`,
        );
      }
      // The queue badge in the nav is rendered on the server.
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  };

  const shown = items.filter((s) => filter === "all" || s.status === filter);
  const countFor = (id: string) =>
    id === "all" ? items.length : items.filter((s) => s.status === id).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className="chip"
          >
            {f.label}
            <span className="text-[var(--fg-faint)]">{countFor(f.id)}</span>
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-4 space-y-1">
        {error && (
          <p role="alert" className="text-[0.92rem] text-[var(--accent)]">
            {error}
          </p>
        )}
        {flash && <p className="text-[0.92rem] text-[var(--fg-soft)]">{flash}</p>}
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-[0.95rem] text-[var(--fg-faint)]">
          Nothing here.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {shown.map((s) => (
            <Card
              key={s.id}
              submission={s}
              onAct={act}
              busy={busy === s.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
