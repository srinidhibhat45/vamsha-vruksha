"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatTimestamp } from "@/lib/datetime";
import { FamilyCanvas } from "../family/FamilyCanvas";
import { checkDraft, displayOf } from "@/lib/family";
import { isProposedRef, proposedLabel } from "@/lib/vocabulary";
import type {
  DraftPerson,
  FamilyDraft,
  Submission,
  SubmissionStatus,
} from "@/lib/types";

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

/**
 * A family submission, reviewed as a family.
 *
 * The payload table is right for a correction and useless for a branch of
 * thirty: the question a reviewer is actually asking is "does this shape make
 * sense, and is any of it already here", and no list of field-value pairs
 * answers it. So the same drawing the contributor built against is reproduced,
 * with the rows they linked to existing records marked, and the coherence
 * warnings that were not severe enough to block the submission surfaced
 * here — because this is the moment somebody can act on them.
 */
function FamilySubmission({ draft }: { draft: FamilyDraft }) {
  const [selected, setSelected] = useState<string | null>(null);

  const linked = draft.people.filter((p) => p.existingId);
  const warnings = checkDraft(draft).filter((p) => p.severity === "warning");
  const chosen = draft.people.find((p) => p.key === selected);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[0.88rem] text-[var(--fg-soft)]">
        <span>
          <strong className="font-semibold">{draft.people.length}</strong> people
        </span>
        <span>
          <strong className="font-semibold">
            {draft.people.length - linked.length}
          </strong>{" "}
          new records
        </span>
        {linked.length > 0 && (
          <span className="text-[var(--color-tulsi)]">
            {linked.length} linked to records already here
          </span>
        )}
      </div>

      <FamilyCanvas
        draft={draft}
        selectedKey={selected}
        onSelect={setSelected}
        heightClass="h-[42vh] min-h-[280px] sm:h-[min(56vh,460px)]"
      />

      {chosen && <DraftFacts person={chosen} draft={draft} />}

      {warnings.length > 0 && (
        <div className="rounded-[var(--shape-md)] border border-[var(--color-gold)] bg-[color-mix(in_oklab,var(--color-gold)_7%,transparent)] p-3.5">
          <p className="text-[0.88rem] font-semibold">
            Worth checking before this goes in
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[0.85rem] text-[var(--fg-soft)]">
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.sources && draft.sources.length > 0 && (
        <div>
          <h4 className="fact-label">What the whole branch rests on</h4>
          <ul className="mt-1 space-y-0.5 text-[0.88rem] text-[var(--fg-soft)]">
            {draft.sources.map((src, i) => (
              <li key={i}>
                {src.title}
                <span className="text-[var(--fg-faint)]">
                  {" "}
                  — {src.kind.replace(/-/g, " ")}
                  {src.detail && `, ${src.detail}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * A reference field as the reviewer should read it.
 *
 * A value the contributor typed rather than picked is the one thing on this
 * panel that needs a decision from the maintainer — it becomes a new entry in
 * a shared vocabulary — so it says so rather than arriving as an id-shaped
 * string with a prefix on it.
 */
function vocab(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return isProposedRef(value) ? `${proposedLabel(value)} — proposed, not yet in the list` : value;
}

/** Everything one drafted person carries, for the reviewer who clicked them. */
function DraftFacts({
  person,
  draft,
}: {
  person: DraftPerson;
  draft: FamilyDraft;
}) {
  const nameOf = (key?: string) => {
    const found = key ? draft.people.find((p) => p.key === key) : undefined;
    return found ? displayOf(found) : undefined;
  };

  const rows: [string, string | undefined][] = [
    ["Name", displayOf(person)],
    ["Also written", person.aka?.join(", ")],
    ["In Devanagari", person.devanagari],
    ["Sex", person.gender],
    ["Living", person.status],
    ["Born", [person.birthYear, person.birthNote, person.birthPlace].filter(Boolean).join(" · ") || undefined],
    ["Died", [person.deathYear, person.deathPlace].filter(Boolean).join(" · ") || undefined],
    ["Gotra", vocab(person.gotra)],
    ["Kuladevata", vocab(person.kuladevata)],
    ["Mool", vocab(person.mool)],
    ["Matha", vocab(person.math)],
    ["Community", vocab(person.community)],
    ["Father", nameOf(person.fatherKey)],
    ["Mother", nameOf(person.motherKey)],
    [
      "Married to",
      person.spouseKeys
        ?.map((s) => [nameOf(s.key), s.year].filter(Boolean).join(", "))
        .filter(Boolean)
        .join("; ") || undefined,
    ],
    ["Work", person.occupations?.join(", ")],
    ["Lived at", person.residences?.join(", ")],
    ["Known for", person.epithet],
    ["Notes", person.bio],
    ["How sure", person.confidence],
    ["Already in the archive as", person.existingId],
  ];

  const shown = rows.filter(([, value]) => value !== undefined && value !== "");

  return (
    <div className="rounded-[var(--shape-md)] bg-[var(--bg-raised)] p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-[1.05rem] font-medium">
          {displayOf(person) || "Unnamed"}
        </h4>
        {person.photo?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.photo.thumbUrl ?? person.photo.url}
            alt={person.photo.caption ?? ""}
            className="h-16 w-16 rounded-[var(--shape-sm)] object-cover"
          />
        )}
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,9rem)_1fr]">
        {shown.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="fact-label pt-0.5">{label}</dt>
            <dd className="text-[0.9rem] leading-snug">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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

  const family =
    s.kind === "family-tree" && Array.isArray(s.payload.people)
      ? (s.payload as unknown as FamilyDraft)
      : null;

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
            {family
              ? `${displayOf(family.people[0]) || "A family"}${
                  family.people.length > 1
                    ? ` and ${family.people.length - 1} more`
                    : ""
                }`
              : String(s.payload.displayName ?? "(no name given)")}
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

      {/*
        A family is shown open. It is the one submission kind where the thing
        being judged is the shape rather than the fields, and a reviewer who
        has to click to see the shape will approve on the name alone.
      */}
      {family ? (
        <div className="mt-3 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3.5">
          <FamilySubmission draft={family} />
        </div>
      ) : (
        <details className="mt-3">
          <summary className="cursor-pointer py-1 text-[0.88rem] text-[var(--fg-faint)]">
            What was submitted
          </summary>
          <div className="mt-2.5 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3.5">
            <PayloadTable payload={s.payload} />
          </div>
        </details>
      )}

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
  const [flash, setFlash] = useState<{ message: string; personId?: string } | null>(
    null,
  );

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
        setFlash({
          message: data.person.created
            ? `Published as a new record — ${data.person.id}`
            : `Applied to ${data.person.id}`,
          personId: data.person.id,
        });
      } else if (data.family) {
        const created = data.family.created?.length ?? 0;
        const updated = data.family.updated?.length ?? 0;
        setFlash({
          message: `Published ${created} new record${created === 1 ? "" : "s"}${
            updated ? `, and updated ${updated} existing one${updated === 1 ? "" : "s"}` : ""
          }`,
          personId: data.family.apexId,
        });
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
        {flash && (
          <p className="text-[0.92rem] text-[var(--fg-soft)]">
            {flash.message}
            {flash.personId && (
              <>
                {" — "}
                <Link
                  href={`/admin/people/${encodeURIComponent(flash.personId)}`}
                  className="link-underline font-medium"
                >
                  edit
                </Link>
                {" · "}
                <Link
                  href={`/person/${encodeURIComponent(flash.personId)}`}
                  className="link-underline font-medium"
                  target="_blank"
                >
                  view on the site
                </Link>
              </>
            )}
          </p>
        )}
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
