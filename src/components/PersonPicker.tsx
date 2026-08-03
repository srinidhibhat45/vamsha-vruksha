"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Suggestion } from "@/lib/search";

export interface PickedPerson {
  id: string;
  name: string;
  detail?: string;
}

/**
 * A type-ahead for choosing one person out of the archive — or for saying that
 * the person you mean is not in it.
 *
 * Deliberately not a `<select>`: the archive has thousands of people and the
 * reader almost always knows a name but not an id. Search runs against the
 * spelling-tolerant index, so a half-remembered spelling still lands.
 *
 * Two behaviours here are corrections of the obvious design, and both come
 * from the same mistake — treating the search results as the set of possible
 * answers:
 *
 * **Nothing is highlighted until the reader highlights it.** Pre-selecting the
 * first match means pressing Enter after typing a name silently answers with
 * somebody else's record. The commonest name in this archive returns nine
 * matches and the tenth Narayan Kamath is the one being typed.
 *
 * **"Add them as new" is offered even when there are matches.** A new person
 * usually *does* look like several existing ones — that is what a family
 * naming its sons after its grandfathers produces. Hiding the escape hatch
 * whenever the index has an opinion is what forces contributors to pick a
 * near-miss, and a wrongly merged person is far harder to undo than a
 * duplicate.
 *
 * Wired as an ARIA 1.2 combobox — the input keeps focus and
 * aria-activedescendant walks the list, so the suggestions are announced one
 * by one instead of appearing silently.
 */
export function PersonPicker({
  label,
  value,
  onChange,
  placeholder = "Type a name…",
  autoFocus,
  onCreateNew,
  createLabel = "Add as someone new",
  hint,
}: {
  label: string;
  value: PickedPerson | null;
  onChange: (person: PickedPerson | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Offered whenever a name has been typed, not only when the archive draws a
   * blank. Where the caller can create the person in place, it says so with
   * the name already typed.
   */
  onCreateNew?: (typedName: string) => void;
  createLabel?: string;
  hint?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  /** -1 means "nothing chosen yet" — see the note above. */
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  const uid = useId();
  const inputId = `${uid}-input`;
  const listboxId = `${uid}-listbox`;
  const statusId = `${uid}-status`;

  const typed = query.trim();
  const canCreate = !!onCreateNew && typed.length >= 2;

  useEffect(() => {
    if (typed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(typed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setResults((data.suggestions ?? []).filter((s) => s.kind === "person"));
        setActive(-1);
        setOpen(true);
      } catch {
        /* superseded by a later keystroke */
      } finally {
        setSearching(false);
      }
    }, 140);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [typed]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const reset = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setActive(-1);
  };

  const choose = (s: Suggestion) => {
    onChange({ id: s.id, name: s.name, detail: s.detail });
    reset();
  };

  const create = () => {
    if (!onCreateNew || !typed) return;
    onCreateNew(typed);
    reset();
  };

  if (value) {
    return (
      <div>
        <span className="label" id={`${uid}-chosen-label`}>
          {label}
        </span>
        <div className="flex min-h-[48px] items-center gap-2 rounded-[var(--shape-xs)] border border-[var(--outline)] bg-[var(--bg-raised)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.95rem]">{value.name}</div>
            {value.detail && (
              <div className="truncate text-[0.8rem] text-[var(--fg-faint)]">
                {value.detail}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="btn btn-text btn-sm shrink-0"
          >
            Change<span className="sr-only"> {label}</span>
          </button>
        </div>
      </div>
    );
  }

  // The create row is the last option in the list, so it is reachable with the
  // same arrow keys as everything else rather than being a button beside it.
  const rowCount = results.length + (canCreate ? 1 : 0);
  const creatingRow = canCreate ? results.length : -1;
  const expanded = open && rowCount > 0;
  const activeId =
    expanded && active >= 0
      ? active === creatingRow
        ? `${uid}-opt-create`
        : `${uid}-opt-${results[active]?.id}`
      : undefined;

  return (
    <div ref={boxRef} className="relative">
      <label className="label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => rowCount && setOpen(true)}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-describedby={statusId}
        aria-activedescendant={activeId}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (active >= 0 && active < results.length) choose(results[active]);
            else if (active === creatingRow || (active === -1 && canCreate)) {
              // Enter on a name the reader typed means that name, not the
              // archive's best guess at it.
              create();
            }
            return;
          }
          if (!rowCount) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a + 1 >= rowCount ? 0 : a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => (a - 1 < 0 ? rowCount - 1 : a - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        placeholder={placeholder}
        className="field"
        autoComplete="off"
      />

      <ul
        id={listboxId}
        role="listbox"
        aria-label={`Matches for ${label}`}
        className={`menu-surface absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-72 scroll-slim ${
          expanded ? "" : "hidden"
        }`}
      >
        {results.map((r, i) => (
          <li
            key={r.id}
            id={`${uid}-opt-${r.id}`}
            role="option"
            aria-selected={i === active}
            data-active={i === active}
            className="menu-item"
            onPointerMove={() => setActive(i)}
            onClick={() => choose(r)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{r.name}</span>
              {/*
                Said out loud rather than folded into the grey subtitle: a
                result that looks nothing like what was typed reads as a wrong
                answer until you know it was matched on a nickname.
              */}
              {r.via && (
                <span className="block truncate text-[0.78rem] text-[var(--color-gold)]">
                  also written {r.via}
                </span>
              )}
              <span className="block truncate text-[0.78rem] text-[var(--fg-faint)]">
                {r.detail}
              </span>
            </span>
          </li>
        ))}

        {canCreate && (
          <li
            id={`${uid}-opt-create`}
            role="option"
            aria-selected={active === creatingRow}
            data-active={active === creatingRow}
            className={`menu-item text-[var(--accent)] ${
              results.length ? "border-t border-[var(--line)]" : ""
            }`}
            onPointerMove={() => setActive(creatingRow)}
            onClick={create}
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M8 3v10M3 8h10" />
            </svg>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {createLabel}: {typed}
              </span>
              <span className="block truncate text-[0.78rem] text-[var(--fg-faint)]">
                {results.length
                  ? "None of the matches above is them"
                  : "Nobody here by that name yet"}
              </span>
            </span>
          </li>
        )}
      </ul>

      {/* Announced as it changes, so the result count is not sighted-only. */}
      <p id={statusId} role="status" aria-live="polite" className="hint">
        {hint ? `${hint} ` : ""}
        {typed.length < 2
          ? "Type at least two letters."
          : searching
            ? "Searching…"
            : results.length === 0
              ? canCreate
                ? "No match. Press Enter to add them as somebody new."
                : "No match — try a surname, or a different spelling."
              : `${results.length} ${results.length === 1 ? "match" : "matches"}. Arrow down to choose one${
                  canCreate ? ", or press Enter to add a new person" : ""
                }.`}
      </p>
    </div>
  );
}
