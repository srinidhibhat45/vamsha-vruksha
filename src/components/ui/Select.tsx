"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

/**
 * A Material 3 exposed dropdown menu.
 *
 * Why not a native `<select>`: the lists this site puts in one are long and
 * culturally specific — a hundred and forty places, sixty gotras — and a
 * native select gives no way to type past the first letter, no room for the
 * second line of context that tells Kumta-in-Uttara-Kannada from Kumta the
 * suburb, and no consistent look across the three platforms this runs on.
 *
 * What it must not lose by leaving the native control behind is the
 * accessibility that came free with it. So this is a real ARIA 1.2 combobox
 * over a listbox:
 *
 *   - the trigger is `role="combobox"` with `aria-expanded` and `aria-controls`
 *   - the popup is `role="listbox"`, its rows `role="option"`
 *   - the active row is pointed at by `aria-activedescendant`, so focus never
 *     leaves the trigger and a screen reader reads each option as you arrow
 *     through it
 *   - Home/End/PageUp/PageDown/Escape/Enter/Space and type-ahead all behave
 *     the way they do in a native select
 *   - opening with ArrowDown starts on the current value, not on the first row
 *
 * `searchable` adds a filter box for the long vocabularies. The pattern stays
 * a combobox; only the text input moves inside the popup.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Second line — region, tradition, count. Announced with the label. */
  detail?: string;
}

const TYPEAHEAD_RESET_MS = 700;

export function Select({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  placeholder = "Select…",
  searchable = false,
  className = "",
  buttonClassName = "",
  id,
  describedBy,
  disabled,
  name,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Visible label, rendered above the control. */
  label?: string;
  /** Use where the layout has no room for a visible label. One or the
      other is required — a combobox with no accessible name is unusable. */
  ariaLabel?: string;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  buttonClassName?: string;
  id?: string;
  describedBy?: string;
  disabled?: boolean;
  /** Mirrored into a hidden input so the control still posts in a plain form. */
  name?: string;
}) {
  const reactId = useId();
  const baseId = id ?? `select-${reactId}`;
  const listboxId = `${baseId}-listbox`;
  const labelId = `${baseId}-label`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.detail?.toLowerCase().includes(q),
    );
  }, [options, query, searchable]);

  const close = useCallback(
    (refocus = true) => {
      setOpen(false);
      setQuery("");
      if (refocus) buttonRef.current?.focus();
    },
    [],
  );

  const commit = useCallback(
    (option: SelectOption) => {
      onChange(option.value);
      close();
    },
    [onChange, close],
  );

  /* Open on the current value rather than on row zero. */
  const openMenu = useCallback(
    (startAt?: number) => {
      const current = options.findIndex((o) => o.value === value);
      setActiveIndex(startAt ?? (current >= 0 ? current : 0));
      setOpen(true);
    },
    [options, value],
  );

  /* Dismiss on an outside press or on a scroll that would tear the popup
     away from its trigger. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  /* Keep the active row in view without stealing focus from the trigger. */
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const move = (delta: number) => {
    if (!visible.length) return;
    setActiveIndex((i) => {
      const next = i + delta;
      if (next < 0) return 0;
      if (next > visible.length - 1) return visible.length - 1;
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!open) {
      if (
        e.key === "ArrowDown" ||
        e.key === "ArrowUp" ||
        e.key === "Enter" ||
        e.key === " " ||
        e.key === "Spacebar"
      ) {
        e.preventDefault();
        openMenu();
        return;
      }
      // Type-ahead on a closed control selects without opening, as a native
      // select does.
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        const text =
          now - typeahead.current.at < TYPEAHEAD_RESET_MS
            ? typeahead.current.text + e.key
            : e.key;
        typeahead.current = { text, at: now };
        const hit = options.find((o) =>
          o.label.toLowerCase().startsWith(text.toLowerCase()),
        );
        if (hit) onChange(hit.value);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(visible.length - 1);
        break;
      case "PageDown":
        e.preventDefault();
        move(10);
        break;
      case "PageUp":
        e.preventDefault();
        move(-10);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        break;
      case "Enter":
        e.preventDefault();
        if (visible[activeIndex]) commit(visible[activeIndex]);
        break;
      case " ":
      case "Spacebar":
        // Inside a filter box a space is a space.
        if (searchable) break;
        e.preventDefault();
        if (visible[activeIndex]) commit(visible[activeIndex]);
        break;
      default:
        if (
          !searchable &&
          e.key.length === 1 &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          const now = Date.now();
          const text =
            now - typeahead.current.at < TYPEAHEAD_RESET_MS
              ? typeahead.current.text + e.key
              : e.key;
          typeahead.current = { text, at: now };
          const idx = visible.findIndex((o) =>
            o.label.toLowerCase().startsWith(text.toLowerCase()),
          );
          if (idx >= 0) setActiveIndex(idx);
        }
    }
  };

  const activeId =
    open && visible[activeIndex]
      ? `${baseId}-opt-${visible[activeIndex].value}`
      : undefined;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && (
        <span className="label" id={labelId}>
          {label}
        </span>
      )}

      {name && <input type="hidden" name={name} value={value} />}

      <button
        ref={buttonRef}
        type="button"
        id={baseId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-labelledby={label ? `${labelId} ${baseId}` : undefined}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={describedBy}
        aria-activedescendant={activeId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onClick={() => (open ? close() : openMenu())}
        className={`field flex items-center gap-2 text-start ${buttonClassName}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            selected ? "" : "text-[var(--fg-faint)]"
          }`}
        >
          {selected?.label ?? placeholder}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-[var(--fg-faint)] transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {/* Rendered but hidden when closed so aria-controls always resolves. */}
      <div
        className={`menu-surface absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[min(22rem,60vh)] scroll-slim ${
          open ? "" : "hidden"
        }`}
      >
        {searchable && (
          <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg-raised)] p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Filter…"
              aria-label="Filter the list"
              aria-controls={listboxId}
              autoComplete="off"
              className="field field-sm"
            />
          </div>
        )}

        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-labelledby={label ? labelId : undefined}
          aria-label={label ? undefined : ariaLabel}
        >
          {visible.length === 0 && (
            <li className="px-4 py-3 text-[0.85rem] text-[var(--fg-faint)]">
              Nothing matches that.
            </li>
          )}
          {visible.map((option, i) => (
            <li
              key={option.value}
              id={`${baseId}-opt-${option.value}`}
              role="option"
              aria-selected={option.value === value}
              data-index={i}
              data-active={i === activeIndex}
              className="menu-item"
              onPointerMove={() => setActiveIndex(i)}
              onClick={() => commit(option)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{option.label}</span>
                {option.detail && (
                  <span className="block truncate text-[0.78rem] text-[var(--fg-faint)]">
                    {option.detail}
                  </span>
                )}
              </span>
              {option.value === value && (
                <svg
                  viewBox="0 0 20 20"
                  className="h-4 w-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m4 10.5 4 4 8-9" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
