import type { Metadata } from "next";
import Link from "next/link";
import { getArchive } from "@/lib/archive";
import { KastiRule } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "Directory",
  description:
    "Indexes of the surnames, gotras, kuladevatas, mool villages and mathas recorded in this archive — with notes on what each one means.",
};

export default function DirectoryPage() {
  const archive = getArchive();
  const s = archive.stats;

  const sections = [
    {
      href: "/directory/surname",
      title: "Surnames",
      konkani: "आडनांव",
      count: s.bySurname.length,
      blurb:
        "Most surnames here come from one of two places: an office a family once held, or the village it came from. Which pattern dominates varies by community, and the notes say so where it is known.",
      sample: s.bySurname.slice(0, 8).map((f) => f.label),
    },
    {
      href: "/directory/gotra",
      title: "Gotras",
      konkani: "गोत्र",
      count: s.byGotra.length,
      blurb:
        "The rishi a family descends from, passed from father to child and never changed by marriage. Two people of the same gotra are held to be siblings — which is why it is the first question asked at a match.",
      sample: s.byGotra.slice(0, 8).map((f) => f.label),
    },
    {
      href: "/directory/kuladevata",
      title: "Kuladevatas",
      konkani: "कुलदेवता",
      count: s.byKuladevata.length,
      blurb:
        "The deity a household turns to first, and the temple it sits in. For many families it is the single strongest clue to where they came from — often the last thing remembered after the village name has gone.",
      sample: s.byKuladevata.slice(0, 6).map((f) => f.label),
    },
    {
      href: "/directory/mool",
      title: "Mool villages",
      konkani: "मूळ गांव",
      count: s.byMool.length,
      blurb:
        "The ancestral village — the place a family names as its root, however many generations ago it left. Held onto long after anybody has been there.",
      sample: s.byMool.slice(0, 8).map((f) => f.label),
    },
    {
      href: "/directory/math",
      title: "Mathas",
      konkani: "मठ",
      count: s.byMath.length,
      blurb:
        "The monastic seat a family owes allegiance to. It divides the community more sharply than surname or region does — Vaishnava and Smarta households of the same surname may share no ritual at all.",
      sample: s.byMath.slice(0, 4).map((f) => f.label),
    },
    {
      href: "/directory/community",
      title: "Communities",
      konkani: "समाज",
      count: s.byCommunity.length,
      blurb:
        "Whatever a family calls itself. The boundaries between communities are historically fluid and locally argued over, so the archive records the answer a family gives rather than deciding for it.",
      sample: s.byCommunity.slice(0, 4).map((f) => f.label),
    },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10">
      <header className="max-w-2xl">
        <p className="eyebrow">
          <span className="deva" lang="kok">
            सूची
          </span>{" "}
          · Directory
        </p>
        <h1 className="mt-2 font-display text-[2.2rem] font-medium leading-tight">
          The vocabularies a family is described in
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          These fields do most of the work of reconnecting branches. A family
          that lost touch four generations ago will usually still agree on its
          gotra, its kuladevata and its mool village long after the names and
          dates have gone. Not every family uses every one of them, and an
          entry with only one filled in is still a real record.
        </p>
      </header>

      <KastiRule className="my-8" />

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="surface group flex flex-col p-6 transition-shadow hover:shadow-[var(--shadow-lift)]"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[1.35rem] font-medium group-hover:text-[var(--accent)]">
                {section.title}
              </h2>
              <span className="deva text-[var(--fg-faint)]" lang="kok">
                {section.konkani}
              </span>
            </div>
            <p className="mt-2.5 text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
              {section.blurb}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {section.sample.map((name) => (
                <span key={name} className="chip chip-sm">
                  {name}
                </span>
              ))}
              <span className="chip chip-sm chip-accent">
                {section.count} in all <span aria-hidden>→</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
