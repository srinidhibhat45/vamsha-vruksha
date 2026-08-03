import { AppLink as Link } from "@/components/AppLink";
import type { ArchiveStats } from "@/lib/archive";
import { KastiRule, TreeMark } from "./Ornament";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Explore",
    links: [
      { href: "/tree", label: "Family tree" },
      { href: "/lineages", label: "Lineages" },
      { href: "/search", label: "Search" },
      { href: "/relate", label: "Relationship finder" },
      { href: "/diaspora", label: "Where families went" },
    ],
  },
  {
    title: "Directory",
    links: [
      { href: "/directory/surname", label: "Surnames" },
      { href: "/directory/gotra", label: "Gotras" },
      { href: "/directory/kuladevata", label: "Kuladevatas" },
      { href: "/directory/mool", label: "Mool villages" },
      { href: "/directory/math", label: "Mathas" },
    ],
  },
  {
    title: "Take part",
    links: [
      { href: "/contribute", label: "Add your family" },
      { href: "/contribute#correct", label: "Correct a record" },
      { href: "/about#sources", label: "What counts as a source" },
      { href: "/about#privacy", label: "Privacy and living people" },
      { href: "/about", label: "About this archive" },
    ],
  },
];

export function SiteFooter({ stats }: { stats: ArchiveStats }) {
  return (
    <footer className="mt-16 border-t border-[var(--line)] bg-[var(--bg-sunken)] no-print">
      <div className="mx-auto max-w-[1400px] px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <TreeMark className="h-8 w-8 text-[var(--accent)]" />
              <span className="font-display text-lg">Vansh Vriksha</span>
            </div>
            <p className="mt-3 max-w-xs text-[0.9rem] leading-relaxed text-[var(--fg-soft)]">
              A public archive of families, open to every community, built from
              what households still remember and what documents survive.
            </p>
            <p
              className="deva mt-4 text-[1rem] text-[var(--fg-soft)]"
              lang="kok"
            >
              आमचें मूळ आमी विसरूं नये
            </p>
            <p className="mt-1 text-[0.8rem] italic text-[var(--fg-faint)]">
              Let us not forget where we come from
            </p>
          </div>

          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="eyebrow mb-3">{col.title}</h3>
              <ul className="space-y-1">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="state-layer -mx-2 flex min-h-[36px] items-center rounded-[var(--shape-xs)] px-2 text-[0.9rem] text-[var(--fg-soft)]"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <KastiRule className="my-8" />

        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[0.85rem] text-[var(--fg-faint)]">
          <span>
            <strong className="font-semibold text-[var(--fg-soft)]">
              {stats.people.toLocaleString()}
            </strong>{" "}
            people
          </span>
          <span>
            <strong className="font-semibold text-[var(--fg-soft)]">
              {stats.lineages.toLocaleString()}
            </strong>{" "}
            lineages
          </span>
          <span>
            <strong className="font-semibold text-[var(--fg-soft)]">
              {stats.bySurname.length}
            </strong>{" "}
            surnames
          </span>
          <span>
            <strong className="font-semibold text-[var(--fg-soft)]">
              {stats.byGotra.length}
            </strong>{" "}
            gotras
          </span>
          {stats.earliestYear && (
            <span>
              earliest record{" "}
              <strong className="font-semibold text-[var(--fg-soft)]">
                {stats.earliestYear}
              </strong>
            </span>
          )}
          <span className="ml-auto">
            Free to read, free to search, free to correct.
          </span>
        </div>
      </div>
    </footer>
  );
}
