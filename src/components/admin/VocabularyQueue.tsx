"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Select } from "../ui/Select";
import type { PendingEntry } from "@/lib/vocabStore";

/**
 * Names contributors typed that are not yet in a vocabulary.
 *
 * This screen is the price of letting people type a gotra that is not on the
 * list, and it is worth paying: the alternative is a dropdown that quietly
 * forces every family whose kuladevata is missing to pick the wrong one. What
 * arrives here is small — a handful of names a month — and each takes one
 * press.
 *
 * The three answers are deliberately not "approve / reject". A proposal is
 * usually neither: it is *Bhardwaj* where the archive says *Bharadwaja*, and
 * the useful action is to merge it, which also moves the records already using
 * it. Rejecting outright would leave those records pointing at a deleted id,
 * so discard clears the field on the way out.
 */

const VOCABULARY_LABEL: Record<PendingEntry["vocabulary"], string> = {
  gotras: "Gotra",
  maths: "Matha",
  communities: "Community",
  kuladevatas: "Kuladevata",
  places: "Place",
};

/** The detail fields worth asking for, per vocabulary. */
const EXTRA_FIELDS: Record<
  PendingEntry["vocabulary"],
  { key: string; label: string; placeholder?: string }[]
> = {
  gotras: [
    { key: "devanagari", label: "In Devanagari", placeholder: "भारद्वाज" },
    { key: "rishi", label: "Rishi", placeholder: "Bharadwaja" },
  ],
  maths: [
    { key: "devanagari", label: "In Devanagari" },
    { key: "seat", label: "Seat", placeholder: "Varanasi, with branches at…" },
  ],
  communities: [{ key: "region", label: "Region" }],
  kuladevatas: [
    { key: "devanagari", label: "In Devanagari" },
    { key: "temple", label: "Temple", placeholder: "Shri Mangueshi Temple" },
  ],
  places: [{ key: "region", label: "Region", placeholder: "Salcete, Goa" }],
};

export function VocabularyQueue({
  entries,
  confirmedBy,
}: {
  entries: PendingEntry[];
  /** Confirmed entries per vocabulary, for the merge picker. */
  confirmedBy: Record<string, { id: string; label: string }[]>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  if (!entries.length) {
    return (
      <div className="surface p-8 text-center">
        <h2 className="font-display text-[1.4rem] font-medium">
          Nothing waiting
        </h2>
        <p className="mx-auto mt-2 max-w-md text-[0.94rem] leading-relaxed text-[var(--fg-soft)]">
          When somebody types a gotra, kuladevata, matha, community or village
          that is not on the list, it is recorded against their family straight
          away and appears here for you to confirm, merge or discard. Until
          then it stays out of everybody else&rsquo;s dropdown.
        </p>
      </div>
    );
  }

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/admin/login?next=/admin/vocabulary");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "That did not work");
        return;
      }
      setFlash(
        data.merged !== undefined
          ? `Merged. ${data.merged} record${data.merged === 1 ? "" : "s"} repointed.`
          : data.cleared !== undefined
            ? `Discarded. ${data.cleared} record${data.cleared === 1 ? "" : "s"} had the field cleared.`
            : "Confirmed — it is on the list now.",
      );
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-[0.95rem] text-[var(--accent)]">
            {error}
          </p>
        )}
        {flash && !error && (
          <p className="text-[0.95rem] text-[var(--color-tulsi)]">{flash}</p>
        )}
      </div>

      {entries.map((entry) => (
        <EntryCard
          key={`${entry.vocabulary}:${entry.id}`}
          entry={entry}
          confirmed={confirmedBy[entry.vocabulary] ?? []}
          busy={busy === `${entry.vocabulary}:${entry.id}`}
          onAct={(body) => act(`${entry.vocabulary}:${entry.id}`, body)}
        />
      ))}
    </div>
  );
}

function EntryCard({
  entry,
  confirmed,
  busy,
  onAct,
}: {
  entry: PendingEntry;
  confirmed: { id: string; label: string }[];
  busy: boolean;
  onAct: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [mergeInto, setMergeInto] = useState(entry.nearby[0]?.id ?? "");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const base = { vocabulary: entry.vocabulary, id: entry.id };

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="fact-label">{VOCABULARY_LABEL[entry.vocabulary]}</p>
          <h2 className="font-display text-[1.4rem] font-medium leading-tight">
            {entry.name}
          </h2>
          <p className="mt-1 text-[0.85rem] text-[var(--fg-faint)]">
            <code className="rounded bg-[var(--bg-inset)] px-1 py-px">
              {entry.id}
            </code>
            {" · "}
            {entry.uses === 0
              ? "not used by any record"
              : `used by ${entry.uses} record${entry.uses === 1 ? "" : "s"}`}
            {entry.proposedBy && ` · proposed by ${entry.proposedBy}`}
          </p>
        </div>
      </div>

      {entry.nearby.length > 0 && (
        <p className="mt-3 rounded-[var(--shape-sm)] border border-[var(--color-gold)] bg-[color-mix(in_oklab,var(--color-gold)_8%,transparent)] p-3 text-[0.88rem] leading-relaxed">
          This looks like a spelling of{" "}
          <strong className="font-semibold">
            {entry.nearby.map((n) => n.name).join(", ")}
          </strong>
          , which the archive already holds. Merging is almost certainly the
          right answer.
        </p>
      )}

      {/* ------------------------------------------------- Confirm */}
      <div className="mt-4 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-4">
        <h3 className="label">Confirm it, with the details</h3>
        <p className="hint mt-0.5">
          What you fill in here is what every reader sees. Confirming puts it in
          the dropdown for the next contributor.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Name</span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {EXTRA_FIELDS[entry.vocabulary].map((field) => (
            <label key={field.key} className="block">
              <span className="label">{field.label}</span>
              <input
                className="field"
                value={extra[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(e) =>
                  setExtra((x) => ({ ...x, [field.key]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="block sm:col-span-2">
            <span className="label">Note</span>
            <input
              className="field"
              value={extra.note ?? ""}
              onChange={(e) => setExtra((x) => ({ ...x, note: e.target.value }))}
              placeholder="Two or three words on what it is, for the directory page."
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => onAct({ ...base, action: "confirm", ...extra, name })}
          className="btn btn-filled btn-sm mt-3"
        >
          {busy ? "Working…" : "Confirm and add to the list"}
        </button>
      </div>

      {/* --------------------------------------------------- Merge */}
      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-4">
        <div className="min-w-[16rem] flex-1">
          <Select
            label="Or merge it into an entry already here"
            value={mergeInto}
            onChange={setMergeInto}
            placeholder="Choose an entry"
            searchable
            options={[
              { value: "", label: "Choose an entry" },
              ...confirmed.map((c) => ({ value: c.id, label: c.label })),
            ]}
          />
        </div>
        <button
          type="button"
          disabled={busy || !mergeInto}
          onClick={() => onAct({ ...base, action: "merge", into: mergeInto })}
          className="btn btn-outlined btn-sm"
        >
          Merge
          {entry.uses > 0 && ` and move ${entry.uses}`}
        </button>

        <div className="ml-auto">
          {confirmDiscard ? (
            <span className="flex items-center gap-2">
              <span className="text-[0.85rem] text-[var(--fg-soft)]">
                {entry.uses > 0
                  ? `Clears this field on ${entry.uses} record${entry.uses === 1 ? "" : "s"}.`
                  : "Nothing uses it."}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAct({ ...base, action: "discard" })}
                className="btn btn-filled btn-sm"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="btn btn-text btn-sm"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="btn btn-text btn-sm text-[var(--fg-faint)]"
            >
              Discard it
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
