"use client";

import { AppLink as Link } from "@/components/AppLink";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export interface AdminPersonRow {
  id: string;
  name: string;
  lifespan: string;
  gender: string;
  status: "living" | "deceased" | "unknown";
  surname?: string;
  gotraLabel?: string;
  moolLabel?: string;
  confidence: string;
  sample?: boolean;
  /** Parent + spouse links that a deletion would sever. */
  links: number;
  updatedAt?: string;
}

type Dialog =
  | { kind: "death"; row: AdminPersonRow }
  | { kind: "delete"; row: AdminPersonRow }
  | null;

const STATUS_CHIP: Record<string, string> = {
  living: "chip-mool",
  deceased: "chip",
  unknown: "chip",
};

export function PeopleTable({ rows }: { rows: AdminPersonRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<"all" | "living" | "deceased" | "unknown">("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [deathYear, setDeathYear] = useState("");
  const [deathPlace, setDeathPlace] = useState("");
  const [deathNote, setDeathNote] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (only !== "all" && r.status !== only) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.gotraLabel ?? "").toLowerCase().includes(q) ||
        (r.moolLabel ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, only]);

  // Long lists are cut rather than paginated: the search box above is the
  // real way through eight hundred records, and a page control implies an
  // ordering that a name index does not have.
  const shown = filtered.slice(0, 200);

  const closeDialog = () => {
    setDialog(null);
    setDeathYear("");
    setDeathPlace("");
    setDeathNote("");
    setError(null);
  };

  const handle = async (run: () => Promise<Response>, done: string) => {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const res = await run();
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        router.replace("/admin/login?next=/admin/people");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "That did not work");
        return;
      }
      setFlash(done);
      closeDialog();
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  const markDeceased = (row: AdminPersonRow) =>
    handle(
      () =>
        fetch(`/api/admin/people/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mark-deceased",
            year: deathYear ? Number(deathYear) : undefined,
            placeLabel: deathPlace || undefined,
            note: deathNote || undefined,
          }),
        }),
      `${row.name} is recorded as deceased.`,
    );

  const markLiving = (row: AdminPersonRow) =>
    handle(
      () =>
        fetch(`/api/admin/people/${encodeURIComponent(row.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark-living" }),
        }),
      `${row.name} is recorded as living.`,
    );

  const remove = (row: AdminPersonRow) =>
    handle(
      () =>
        fetch(
          `/api/admin/people/${encodeURIComponent(row.id)}?links=${row.links}`,
          { method: "DELETE" },
        ),
      `${row.name} has been removed.`,
    );

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className="label" htmlFor="people-search">
            Search
          </label>
          <input
            id="people-search"
            className="field mt-1.5"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A name, a gotra, a village, an id…"
            type="search"
          />
        </div>

        <div className="flex flex-wrap gap-2 pb-1">
          {(["all", "living", "deceased", "unknown"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className="chip"
              aria-pressed={only === f}
              onClick={() => setOnly(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite" className="mt-3 min-h-[1.25rem]">
        {error && (
          <p role="alert" className="text-[0.9rem] text-[var(--accent)]">
            {error}
          </p>
        )}
        {flash && <p className="text-[0.9rem] text-[var(--fg-soft)]">{flash}</p>}
      </div>

      <p className="mt-1 text-[0.85rem] text-[var(--fg-faint)]">
        {filtered.length} of {rows.length} records
        {filtered.length > shown.length &&
          ` · showing the first ${shown.length}, narrow the search to see the rest`}
      </p>

      <div className="mt-3 overflow-x-auto scroll-slim">
        <table className="w-full min-w-[46rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <th scope="col" className="fact-label py-2 pr-3 font-semibold">Name</th>
              <th scope="col" className="fact-label py-2 pr-3 font-semibold">Years</th>
              <th scope="col" className="fact-label py-2 pr-3 font-semibold">Gotra</th>
              <th scope="col" className="fact-label py-2 pr-3 font-semibold">Mool</th>
              <th scope="col" className="fact-label py-2 pr-3 font-semibold">Status</th>
              <th scope="col" className="fact-label py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--line)] align-middle"
              >
                <td className="py-2.5 pr-3">
                  <Link
                    href={`/admin/people/${encodeURIComponent(row.id)}`}
                    className="link-underline font-medium"
                  >
                    {row.name}
                  </Link>
                  <span className="ml-2 text-[0.78rem] text-[var(--fg-faint)]">
                    {row.id}
                  </span>
                  {row.sample && (
                    <span className="ml-2 chip chip-sm">sample</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-[0.88rem] tabular-nums text-[var(--fg-soft)]">
                  {row.lifespan || "—"}
                </td>
                <td className="py-2.5 pr-3 text-[0.88rem] text-[var(--fg-soft)]">
                  {row.gotraLabel ?? "—"}
                </td>
                <td className="py-2.5 pr-3 text-[0.88rem] text-[var(--fg-soft)]">
                  {row.moolLabel ?? "—"}
                </td>
                <td className="py-2.5 pr-3">
                  <span className={`chip chip-sm ${STATUS_CHIP[row.status]}`}>
                    {row.status}
                  </span>
                </td>
                <td className="py-2.5 text-right whitespace-nowrap">
                  {row.status === "deceased" ? (
                    <button
                      type="button"
                      className="btn btn-text btn-sm"
                      disabled={busy}
                      onClick={() => markLiving(row)}
                    >
                      Mark living
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-text btn-sm"
                      onClick={() => setDialog({ kind: "death", row })}
                    >
                      Mark deceased
                    </button>
                  )}
                  <Link
                    href={`/admin/people/${encodeURIComponent(row.id)}`}
                    className="btn btn-text btn-sm"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    className="btn btn-text btn-sm text-[var(--accent)]"
                    onClick={() => setDialog({ kind: "delete", row })}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {shown.length === 0 && (
          <p className="py-8 text-center text-[0.95rem] text-[var(--fg-faint)]">
            No record matches that.
          </p>
        )}
      </div>

      {/* ------------------------------------------------ Death dialog */}
      {dialog?.kind === "death" && (
        <Modal title={`Record the death of ${dialog.row.name}`} onClose={closeDialog}>
          <p className="text-[0.9rem] leading-relaxed text-[var(--fg-soft)]">
            Everything below is optional. Marking the status alone is a real
            record — a family that knows someone has died but not when is the
            ordinary case, not a deficient one.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="death-year">
                Year
              </label>
              <input
                id="death-year"
                className="field mt-1.5"
                inputMode="numeric"
                value={deathYear}
                onChange={(e) => setDeathYear(e.target.value)}
                placeholder="1968"
              />
            </div>
            <div>
              <label className="label" htmlFor="death-place">
                Place
              </label>
              <input
                id="death-place"
                className="field mt-1.5"
                value={deathPlace}
                onChange={(e) => setDeathPlace(e.target.value)}
                placeholder="Karwar"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="death-note">
              Note
            </label>
            <input
              id="death-note"
              className="field mt-1.5"
              value={deathNote}
              onChange={(e) => setDeathNote(e.target.value)}
              placeholder="Anything the family recorded"
            />
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-text" onClick={closeDialog}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-filled"
              disabled={busy}
              onClick={() => markDeceased(dialog.row)}
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </Modal>
      )}

      {/* ----------------------------------------------- Delete dialog */}
      {dialog?.kind === "delete" && (
        <Modal title={`Remove ${dialog.row.name}?`} onClose={closeDialog}>
          <p className="text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
            The record goes from{" "}
            <code className="rounded bg-[var(--bg-inset)] px-1 py-0.5">
              data/people/
            </code>{" "}
            and cannot be undone from here — only from git.
          </p>

          {dialog.row.links > 0 ? (
            <p className="mt-3 rounded-[var(--shape-md)] border border-[var(--accent)] p-3 text-[0.9rem] leading-relaxed">
              {dialog.row.links}{" "}
              {dialog.row.links === 1 ? "person is" : "people are"} linked to
              this record as a parent or a spouse. Those links will be cut, and
              anyone whose only connection to the tree ran through this person
              will be left standing alone in their lineage.
            </p>
          ) : (
            <p className="mt-3 text-[0.9rem] text-[var(--fg-faint)]">
              Nothing else in the archive points at this record.
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className="btn btn-text" onClick={closeDialog}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-filled"
              disabled={busy}
              onClick={() => remove(dialog.row)}
            >
              {busy ? "Removing…" : "Remove the record"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The trigger button is still focused when this mounts — a keyboard user
  // who opened the dialog would otherwise have their next Tab land back on
  // the row they were just acting on, with no sign the dialog exists. Moving
  // focus to the heading puts them inside it, and closing hands focus back.
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    return () => trigger?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="surface max-h-[90vh] w-full max-w-md overflow-y-auto p-6 scroll-slim"
        onKeyDown={onKeyDown}
      >
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[1.4rem] font-medium"
        >
          {title}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
