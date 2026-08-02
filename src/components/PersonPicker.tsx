"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Suggestion } from "@/lib/search";

export interface PickedPerson {
  id: string;
  name: string;
  detail?: string;
}

/**
 * A type-ahead for choosing one person out of the archive.
 *
 * Deliberately not a `<select>`: the archive has thousands of people and the
 * reader almost always knows a name but not an id. Search runs against the
 * spelling-tolerant index, so a half-remembered spelling still lands.
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
}: {
  label: string;
  value: PickedPerson | null;
  onChange: (person: PickedPerson | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const uid = useId();
  const inputId = `${uid}-input`;
  const listboxId = `${uid}-listbox`;
  const statusId = `${uid}-status`;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setResults((data.suggestions ?? []).filter((s) => s.kind === "person"));
        setActive(0);
        setOpen(true);
      } catch {
        /* superseded by a later keystroke */
      }
    }, 140);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (s: Suggestion) => {
    onChange({ id: s.id, name: s.name, detail: s.detail });
    setQuery("");
    setResults([]);
    setOpen(false);
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

  const expanded = open && results.length > 0;

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
        onFocus={() => results.length && setOpen(true)}
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-describedby={statusId}
        aria-activedescendant={
          expanded && results[active] ? `${uid}-opt-${results[active].id}` : undefined
        }
        onKeyDown={(e) => {
          if (!open || !results.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % results.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + results.length) % results.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
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
              <span className="block truncate text-[0.78rem] text-[var(--fg-faint)]">
                {r.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {/* Announced as it changes, so the result count is not sighted-only. */}
      <p id={statusId} role="status" aria-live="polite" className="hint">
        {query.trim().length >= 2
          ? results.length === 0
            ? "No match — try a surname, or a different spelling."
            : `${results.length} ${results.length === 1 ? "match" : "matches"}. Use the arrow keys to choose one.`
          : "Type at least two letters."}
      </p>
    </div>
  );
}
