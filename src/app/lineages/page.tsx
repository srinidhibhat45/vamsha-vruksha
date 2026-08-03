import type { Metadata } from "next";
import { AppLink as Link } from "@/components/AppLink";
import { birthYear, fullName, getArchive } from "@/lib/archive";

export const metadata: Metadata = {
  title: "Lineages",
  description:
    "Every connected family line in the archive, with its earliest recorded ancestor, gotras and mool village.",
};

export default function LineagesPage() {
  const archive = getArchive();
  const lineages = archive.lineageList;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <header className="max-w-2xl">
        <p className="eyebrow">
          <span className="deva" lang="kok">
            कुळां
          </span>{" "}
          · Lineages
        </p>
        <h1 className="mt-2 font-display text-[2.2rem] font-medium leading-tight">
          Family lines
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          A lineage here is not a surname — it is a connected web of people. If
          your great-aunt married into another family in this archive, the two
          records join and the whole thing becomes one line. That is why some of
          these carry two surnames: the marriage that joined them is recorded.
        </p>
      </header>

      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lineages.map((l) => {
          const apex = archive.people.get(l.apexId);
          const living = l.memberIds.filter(
            (id) => archive.people.get(id)?.status === "living",
          ).length;

          return (
            <article
              key={l.id}
              className="surface flex flex-col p-5 transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-[1.25rem] font-medium leading-snug">
                  <Link
                    href={`/tree?lineage=${l.id}`}
                    className="inline-flex min-h-[24px] items-center hover:text-[var(--accent)]"
                  >
                    {l.label}
                  </Link>
                </h2>
                <span className="chip chip-sm chip-accent shrink-0">
                  {l.size}
                  <span className="sr-only"> people</span>
                </span>
              </div>

              {apex && (
                <p className="mt-2 text-[0.92rem] text-[var(--fg-soft)]">
                  Earliest recorded:{" "}
                  <Link
                    href={`/person/${apex.id}`}
                    className="link-underline inline-flex min-h-[24px] items-center font-medium"
                  >
                    {fullName(apex)}
                  </Link>
                  {birthYear(apex) && `, born ${birthYear(apex)}`}
                </p>
              )}

              <dl className="mt-3.5 grid grid-cols-3 gap-2 border-y border-[var(--line)] py-3 text-center">
                <div>
                  <dt className="fact-label">
                    Generations
                  </dt>
                  <dd className="font-display text-[1.35rem] font-medium">{l.generations}</dd>
                </div>
                <div>
                  <dt className="fact-label">
                    Living
                  </dt>
                  <dd className="font-display text-[1.35rem] font-medium">{living}</dd>
                </div>
                <div>
                  <dt className="fact-label">
                    Span
                  </dt>
                  <dd className="font-display text-[1.35rem] font-medium tabular-nums">
                    {l.earliestYear && l.latestYear
                      ? l.latestYear - l.earliestYear
                      : "—"}
                    <span className="text-[0.78rem] font-normal text-[var(--fg-faint)]">
                      {" "}
                      yrs
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {l.surnames.slice(0, 4).map((sn) => (
                  <Link
                    key={sn}
                    href={`/search?surname=${encodeURIComponent(sn)}`}
                    className="chip chip-sm"
                  >
                    {sn}
                  </Link>
                ))}
                {l.surnames.length > 4 && (
                  <span
                    className="chip chip-sm"
                    aria-label={`${l.surnames.length - 4} more surnames`}
                  >
                    +{l.surnames.length - 4}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.gotras.slice(0, 3).map((g) => (
                  <span key={g} className="chip chip-sm chip-gotra">
                    {archive.gotras.get(g)?.name ?? g}
                  </span>
                ))}
                {l.mools.slice(0, 2).map((m) => (
                  <span key={m} className="chip chip-sm chip-mool">
                    {archive.places.get(m)?.name ?? m}
                  </span>
                ))}
              </div>

              <div className="mt-auto flex gap-2 pt-4">
                <Link
                  href={`/tree?lineage=${l.id}`}
                  className="btn btn-outlined btn-sm flex-1"
                >
                  Open tree
                </Link>
                <Link
                  href={`/search?lineage=${l.id}`}
                  className="btn btn-text btn-sm"
                >
                  List<span className="sr-only"> everyone in this line</span>
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
