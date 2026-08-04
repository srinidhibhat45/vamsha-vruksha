"use client";

import { AppLink as Link } from "@/components/AppLink";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { TreeMark } from "./Ornament";
import type { Suggestion } from "@/lib/search";

const NAV = [
  { href: "/tree", label: "Tree", konkani: "वंशवृक्ष" },
  { href: "/search", label: "Search", konkani: "सोद" },
  { href: "/lineages", label: "Lineages", konkani: "कुळां" },
  { href: "/directory", label: "Directory", konkani: "सूची" },
  { href: "/relate", label: "Relate", konkani: "नातें" },
  { href: "/diaspora", label: "Diaspora", konkani: "विस्तार" },
];

export function SiteHeader({
  totalPeople,
  sampleOnly,
}: {
  totalPeople: number;
  sampleOnly: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  /*
    On the results page, the box holds what was searched for.

    It used to come up empty there, which made refining a search — the
    commonest thing a reader does after the first one — mean retyping the name
    from memory with the results for it still on screen. Only on /search:
    everywhere else an empty box is right.

    `typing` is what keeps the seeding from firing the type-ahead. Without it
    the suggestion list would drop open over the results on every page load,
    offering to navigate to the search that has already happened.
  */
  const urlQuery = pathname === "/search" ? (searchParams.get("q") ?? "") : "";
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    setQuery(urlQuery);
    setTyping(false);
    setShowResults(false);
  }, [urlQuery]);

  const uid = useId();
  const listboxId = `${uid}-suggestions`;
  const menuId = `${uid}-menu`;

  // Cmd/Ctrl-K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") setShowResults(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced type-ahead. Aborts the previous request so a slow response for
  // "kam" cannot land after the fast one for "kamath".
  useEffect(() => {
    const q = query.trim();
    if (!typing || q.length < 2) {
      if (q.length < 2) setResults([]);
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
        setResults(data.suggestions ?? []);
        setActive(0);
        setShowResults(true);
      } catch {
        /* aborted or offline — leave the previous list in place */
      }
    }, 140);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, typing]);

  const go = useCallback(
    (href: string) => {
      setShowResults(false);
      setTyping(false);
      // Not cleared. Navigating to /search?q=… is answered by the seeding
      // effect above, which puts the query back in the box where the reader
      // can edit it; clearing here would blank it for a frame and then blank
      // it again on any page that is not /search — which the effect handles.
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showResults || !results.length) {
      if (e.key === "Enter" && query.trim()) {
        go(`/search?q=${encodeURIComponent(query.trim())}`);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]?.href ?? `/search?q=${encodeURIComponent(query)}`);
    }
  };

  const expanded = showResults && results.length > 0;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur-md no-print">
      {sampleOnly && (
        <div className="on-accent bg-[var(--color-kumkum)] px-4 py-2 text-center text-[0.8rem] leading-snug text-[#fff6ee]">
          <strong className="font-semibold">Demonstration data.</strong> Every
          person shown is fictional — the gotras, mathas, temples and villages
          are real, the people are not.{" "}
          <Link
            href="/about#sample"
            className="font-medium underline underline-offset-2"
          >
            How to load real records
          </Link>
        </div>
      )}

      <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-2.5 sm:gap-3">
        <Link
          href="/"
          className="flex min-w-0 shrink items-center gap-2.5 rounded-lg text-[var(--fg)]"
        >
          <TreeMark className="h-9 w-9 shrink-0 text-[var(--accent)]" />
          <span className="min-w-0 leading-none">
            <span className="font-display block truncate text-[1.15rem] font-medium tracking-tight">
              Vansh Vriksha
            </span>
            <span className="block truncate text-[0.68rem] uppercase tracking-[0.14em] text-[var(--fg-faint)]">
              Lineage Archive
            </span>
          </span>
        </Link>

        {/* Takes the slack on small screens, where the search box is hidden. */}
        <span className="ml-auto md:hidden" aria-hidden />

        {/*
          ARIA 1.2 combobox. The input keeps focus while ArrowUp/Down moves
          aria-activedescendant through the list, which is what makes a
          screen reader read each suggestion as you arrive at it. Before
          this the whole type-ahead was invisible to assistive technology.
        */}
        {/*
          Below `md` this is hidden outright. There is not enough width for a
          logo, a search field, a theme toggle and a menu button, and the
          search was the one that lost — squeezed to an empty pill with its
          placeholder clipped, while the menu button ran off the edge. Small
          screens get search from the hero and from the menu instead — and the
          menu really does carry one now, which for a long time it did not:
          the hero only exists on the home page, so a phone reader looking at
          a result list, a person or a tree had no search field anywhere on
          screen and no way to reach one except by going back to the front.
        */}
        <div
          ref={boxRef}
          className="relative ml-auto hidden w-full max-w-md md:block lg:ml-6"
        >
          <div className="field-wrap [--field-lead:2.75rem] [--field-trail:3.5rem]">
            <span className="field-lead">
              <svg
                viewBox="0 0 20 20"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setTyping(true);
                setQuery(e.target.value);
              }}
              onKeyDown={onKeyDown}
              onFocus={() => results.length && setShowResults(true)}
              placeholder="Search a name, surname, gotra or village…"
              aria-label="Search the archive"
              role="combobox"
              aria-expanded={expanded}
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                expanded && results[active]
                  ? `${uid}-opt-${results[active].kind}-${results[active].id}`
                  : undefined
              }
              className="field field-sm field-round text-[0.9rem]"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="field-trail">
              <kbd className="hidden rounded border border-[var(--line-strong)] bg-[var(--bg-sunken)] px-1.5 py-0.5 font-body text-[0.68rem] text-[var(--fg-faint)] sm:block">
                ⌘K
              </kbd>
            </span>
          </div>

          <div
            className={`menu-surface absolute left-0 right-0 top-[calc(100%+6px)] max-h-[60vh] scroll-slim ${
              expanded ? "" : "hidden"
            }`}
          >
            <ul id={listboxId} role="listbox" aria-label="Search suggestions">
              {results.map((r, i) => (
                <li
                  key={`${r.kind}-${r.id}`}
                  id={`${uid}-opt-${r.kind}-${r.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  className="menu-item"
                  onPointerMove={() => setActive(i)}
                  onClick={() => go(r.href)}
                >
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="shrink-0 truncate text-[0.78rem] text-[var(--fg-faint)]">
                    {r.detail}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-1 border-t border-[var(--line)] pt-1">
              <Link
                href={`/search?q=${encodeURIComponent(query)}`}
                onClick={() => go(`/search?q=${encodeURIComponent(query)}`)}
                className="menu-item text-[var(--accent)]"
              >
                See all results for “{query}”
              </Link>
            </div>
          </div>
        </div>

        <nav aria-label="Sections" className="ml-2 hidden items-center gap-0.5 xl:flex">
          {NAV.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`state-layer rounded-lg px-3 py-2 text-[0.875rem] transition-colors ${
                  isActive
                    ? "bg-[var(--accent-container)] font-semibold text-[var(--accent-on-container)]"
                    : "text-[var(--fg-soft)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/contribute"
          className="btn btn-filled btn-sm hidden shrink-0 sm:inline-flex"
        >
          Contribute
        </Link>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={open}
          aria-controls={menuId}
          className="btn btn-text btn-icon btn-sm shrink-0 text-[var(--fg-soft)] xl:hidden"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
          </svg>
        </button>
      </div>

      <nav
        id={menuId}
        aria-label="All sections"
        className={`border-t border-[var(--line)] px-4 py-2 xl:hidden ${open ? "" : "hidden"}`}
      >
        {/*
          The search the header cannot fit below `md`. A plain form rather than
          the type-ahead above it: the suggestion list would have to open over
          the menu that opened it, and one name typed and submitted is what
          this is for. Hidden from `md` up, where the real search box is back.
        */}
        <form
          role="search"
          className="mb-2 md:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (q) go(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <div className="field-wrap [--field-lead:2.75rem] [--field-trail:5rem]">
            <span className="field-lead">
              <svg
                viewBox="0 0 20 20"
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <circle cx="9" cy="9" r="6" />
                <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
              </svg>
            </span>
            <input
              value={query}
              onChange={(e) => {
                setTyping(true);
                setQuery(e.target.value);
              }}
              placeholder="A name, gotra or village…"
              aria-label="Search the archive"
              type="search"
              autoComplete="off"
              className="field field-round min-h-[44px] text-[0.95rem]"
            />
            <span className="field-trail field-trail-interactive">
              <button type="submit" className="btn btn-filled btn-sm">
                Search
              </button>
            </span>
          </div>
        </form>

        <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {[
            ...NAV,
            { href: "/contribute", label: "Contribute", konkani: "योगदान" },
            { href: "/about", label: "About", konkani: "विशीं" },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="state-layer flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-3 py-2 text-[0.95rem]"
              >
                {item.label}
                <span
                  className="deva text-[0.78rem] text-[var(--fg-faint)]"
                  lang="kok"
                >
                  {item.konkani}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="px-3 py-2 text-[0.78rem] text-[var(--fg-faint)]">
          {totalPeople.toLocaleString()} people recorded
        </p>
      </nav>
    </header>
  );
}
