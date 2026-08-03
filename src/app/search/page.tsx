import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getArchive } from "@/lib/archive";
import { search, type SearchFilters } from "@/lib/search";
import { PersonRow } from "@/components/PersonRow";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search the archive by name, surname, gotra, kuladevata or ancestral village. Spelling-tolerant: Shreenivas finds Srinivasa.",
};

type Params = Promise<Record<string, string | undefined>>;

const FACET_KEYS = [
  { key: "surname", title: "Surname" },
  { key: "gotra", title: "Gotra" },
  { key: "kuladevata", title: "Kuladevata" },
  { key: "mool", title: "Mool village" },
  { key: "math", title: "Matha" },
  { key: "community", title: "Community" },
  { key: "confidence", title: "How well attested" },
] as const;

const SORTS = [
  { id: "relevance", label: "Best match" },
  { id: "oldest", label: "Oldest first" },
  { id: "newest", label: "Newest first" },
  { id: "name", label: "A–Z" },
] as const;

const PAGE_SIZE = 25;

/** Build a URL with one parameter changed, dropping it when set to undefined. */
function withParam(
  params: Record<string, string | undefined>,
  key: string,
  value: string | undefined,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") next.set(k, v);
  }
  if (value === undefined) next.delete(key);
  else next.set(key, value);
  const qs = next.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;
  const archive = getArchive();

  const filters: SearchFilters = {
    gotra: params.gotra,
    math: params.math,
    community: params.community,
    mool: params.mool,
    kuladevata: params.kuladevata,
    surname: params.surname,
    confidence: params.confidence,
    country: params.country,
    living: params.living === "1" ? true : params.living === "0" ? false : undefined,
    hasPhoto: params.photo === "1" ? true : undefined,
    bornAfter: params.after ? Number(params.after) : undefined,
    bornBefore: params.before ? Number(params.before) : undefined,
  };

  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const sort = (SORTS.find((s) => s.id === params.sort)?.id ??
    "relevance") as (typeof SORTS)[number]["id"];

  const response = search({
    query: params.q,
    filters,
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const activeFilters = Object.entries({
    surname: params.surname,
    gotra: params.gotra ? archive.gotras.get(params.gotra)?.name : undefined,
    kuladevata: params.kuladevata
      ? archive.kuladevatas.get(params.kuladevata)?.name
      : undefined,
    mool: params.mool ? archive.places.get(params.mool)?.name : undefined,
    math: params.math ? archive.maths.get(params.math)?.name : undefined,
    community: params.community
      ? archive.communities.get(params.community)?.name
      : undefined,
    confidence: params.confidence,
  }).filter((entry): entry is [string, string] => !!entry[1]);

  const totalPages = Math.ceil(response.total / PAGE_SIZE);

  // A page number past the end — from a stale bookmark, a shared link, or
  // the back button after narrowing a filter — used to render the same
  // "nothing matched, add them" empty state as a genuine zero-result search.
  // That is actively misleading when matches exist; this sends the reader to
  // the last real page instead of telling them a real person is not here.
  if (response.total > 0 && page > totalPages) {
    redirect(withParam(params, "page", totalPages > 1 ? String(totalPages) : undefined));
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <header>
        <p className="eyebrow">
          <span className="deva" lang="kok">
            सोद
          </span>{" "}
          · Search
        </p>
        <h1 className="mt-2 font-display text-[2.2rem] font-medium leading-tight">
          {params.q ? (
            <>
              Results for &ldquo;{params.q}&rdquo;
            </>
          ) : activeFilters.length ? (
            "Filtered records"
          ) : (
            "Everyone in the archive"
          )}
        </h1>
        <p className="mt-2 text-[1rem] text-[var(--fg-soft)]" role="status">
          {response.total.toLocaleString()}{" "}
          {response.total === 1 ? "person" : "people"}
          {response.suggestion && params.q && (
            <>
              {" · "}
              did you mean{" "}
              <Link
                href={withParam(params, "q", response.suggestion)}
                className="link-underline text-[var(--accent)]"
              >
                {response.suggestion}
              </Link>
              ?
            </>
          )}
        </p>

        {activeFilters.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="fact-label mr-1">Filtered by</span>
            {activeFilters.map(([key, label]) => (
              <Link
                key={key}
                href={withParam(params, key, undefined)}
                className="chip chip-selected"
              >
                {label}
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
                <span className="sr-only">— remove this filter</span>
              </Link>
            ))}
            <Link
              href={params.q ? `/search?q=${encodeURIComponent(params.q)}` : "/search"}
              className="btn btn-text btn-sm"
            >
              Clear all
            </Link>
          </div>
        )}
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[250px_1fr]">
        {/* -------------------------------------------------- Facets */}
        {/*
          Every control here is a link, so "selected" has to be carried by
          something other than focus. aria-current does that for a screen
          reader and the filled chip does it for everyone else — the old
          version changed only the text colour, which is exactly the case
          WCAG 1.4.1 rules out.
        */}
        <aside className="order-2 lg:order-1" aria-label="Narrow these results">
          <div className="space-y-7 lg:sticky lg:top-24">
            <div>
              <h2 className="eyebrow mb-2.5">Sort</h2>
              <div className="flex flex-wrap gap-2">
                {SORTS.map((s) => (
                  <Link
                    key={s.id}
                    href={withParam(params, "sort", s.id)}
                    aria-current={sort === s.id ? "true" : undefined}
                    className="chip chip-sm"
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h2 className="eyebrow mb-2.5">Alive today</h2>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={withParam(params, "living", params.living === "1" ? undefined : "1")}
                  aria-current={params.living === "1" ? "true" : undefined}
                  className="chip chip-sm"
                >
                  Living
                </Link>
                <Link
                  href={withParam(params, "living", params.living === "0" ? undefined : "0")}
                  aria-current={params.living === "0" ? "true" : undefined}
                  className="chip chip-sm"
                >
                  Ancestors
                </Link>
              </div>
            </div>

            {FACET_KEYS.map(({ key, title }) => {
              const list = response.facets[key];
              if (!list?.length) return null;
              return (
                <div key={key}>
                  <h2 className="eyebrow mb-1.5">{title}</h2>
                  <ul>
                    {list.slice(0, 12).map((f) => {
                      const active = params[key] === f.id;
                      return (
                        <li key={f.id}>
                          <Link
                            href={withParam(
                              params,
                              key,
                              active ? undefined : f.id,
                            )}
                            aria-current={active ? "true" : undefined}
                            className={`state-layer flex min-h-[36px] items-center justify-between gap-2 rounded-[var(--shape-sm)] px-2.5 py-1.5 text-[0.875rem] ${
                              active
                                ? "bg-[var(--accent-container)] font-semibold text-[var(--accent-on-container)]"
                                : "text-[var(--fg-soft)]"
                            }`}
                          >
                            <span className="truncate">{f.label}</span>
                            <span className="shrink-0 text-[0.78rem] tabular-nums opacity-70">
                              {f.count}
                              <span className="sr-only">
                                {" "}
                                {f.count === 1 ? "person" : "people"}
                              </span>
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        {/* ------------------------------------------------- Results */}
        <div className="order-1 min-w-0 lg:order-2">
          {response.results.length === 0 ? (
            <div className="rangoli-field surface flex flex-col items-center px-6 py-20 text-center">
              <h2 className="font-display text-[1.75rem] font-medium">
                Nothing matched
              </h2>
              <p className="mt-3 max-w-md text-[1rem] leading-relaxed text-[var(--fg-soft)]">
                Spelling is rarely the problem here — the search already treats
                Shreenivas, Srinivasa and Sreenivas as the same name. More
                likely this person simply is not in the archive yet.
              </p>
              <Link href="/contribute" className="btn btn-filled mt-7">
                Add them
              </Link>
            </div>
          ) : (
            <>
              <div className="surface overflow-hidden">
                {response.results.map((r) => (
                  <PersonRow
                    key={r.person.id}
                    person={r.person}
                    lineageLabel={r.lineageLabel}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <nav
                  aria-label="Result pages"
                  className="mt-6 flex items-center justify-between gap-4"
                >
                  {page > 1 ? (
                    <Link
                      href={`${withParam(params, "sort", sort)}${withParam(params, "sort", sort).includes("?") ? "&" : "?"}page=${page - 1}`}
                      className="btn btn-outlined"
                    >
                      <span aria-hidden>←</span> Previous
                      <span className="sr-only"> page</span>
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="text-[0.85rem] text-[var(--fg-faint)]">
                    Page {page} of {totalPages}
                  </span>
                  {page < totalPages ? (
                    <Link
                      href={`${withParam(params, "sort", sort)}${withParam(params, "sort", sort).includes("?") ? "&" : "?"}page=${page + 1}`}
                      className="btn btn-outlined"
                    >
                      Next<span className="sr-only"> page</span>{" "}
                      <span aria-hidden>→</span>
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
