import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArchive, type Facet } from "@/lib/archive";

type Params = Promise<{ facet: string }>;

const FACETS = {
  surname: {
    title: "Surnames",
    konkani: "आडनांव",
    param: "surname",
    intro:
      "Two patterns dominate. Office-names — Kamath, Shanbhag, Nadkarni, Hegde — record a hereditary post in village administration or the temple. Village-names — Kaikini, Hattangadi, Padukone, Basrur — record where the family lived, and in some communities are the rule almost without exception. The notes below are the derivations current among the families who carry each name; several are folk etymology and should be read as tradition rather than as evidence.",
  },
  gotra: {
    title: "Gotras",
    konkani: "गोत्र",
    param: "gotra",
    intro:
      "A gotra names the rishi a patriline descends from. It passes from father to child and is never changed by marriage, which is what makes it useful across centuries: a woman's gotra in a record still identifies the family she was born into, long after her surname stopped being used. Pravara lists follow the commonest form — confirm yours with your own matha or purohit, as recensions differ.",
  },
  kuladevata: {
    title: "Kuladevatas",
    konkani: "कुलदेवता",
    param: "kuladevata",
    intro:
      "The deity a household turns to first. Many of the temples named here are in Goa, and many of those images were carried inland to Ponda and Bicholim in the sixteenth and seventeenth centuries, ahead of the destruction of temples in the Old Conquests. A family that has forgotten its village usually has not forgotten its deity.",
  },
  mool: {
    title: "Mool villages",
    konkani: "मूळ गांव",
    param: "mool",
    intro:
      "The ancestral village. Families that left Goa for the Karavali coast, and later for Bombay and beyond, kept naming the village they came from for generations after anyone had seen it.",
  },
  math: {
    title: "Mathas",
    konkani: "मठ",
    param: "math",
    intro:
      "The monastic seat a family owes allegiance to. Where it applies it divides families more sharply than region or surname does: Vaishnava households of the Kashi and Partagali seats and Smarta households of Kavale may share a village and a surname and still keep separate ritual. Plenty of families name no matha at all.",
  },
  community: {
    title: "Communities",
    konkani: "समाज",
    param: "community",
    intro:
      "Every community named by a family in this archive, in alphabetical order and with no order of precedence. The boundaries between them are historically fluid and locally contested; this archive records what a family says about itself rather than adjudicating.",
  },
} as const;

type FacetKey = keyof typeof FACETS;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { facet } = await params;
  const config = FACETS[facet as FacetKey];
  if (!config) return { title: "Not found" };
  return {
    title: config.title,
    description: config.intro.slice(0, 180),
  };
}

export function generateStaticParams() {
  return Object.keys(FACETS).map((facet) => ({ facet }));
}

export default async function FacetPage({ params }: { params: Params }) {
  const { facet } = await params;
  const config = FACETS[facet as FacetKey];
  if (!config) notFound();

  const archive = getArchive();
  const s = archive.stats;

  const list: Facet[] =
    facet === "surname"
      ? s.bySurname
      : facet === "gotra"
        ? s.byGotra
        : facet === "kuladevata"
          ? s.byKuladevata
          : facet === "mool"
            ? s.byMool
            : facet === "math"
              ? s.byMath
              : s.byCommunity;

  const maxCount = Math.max(1, ...list.map((f) => f.count));

  /**
   * The photograph of the temple, where the facet is one that has a building
   * behind it. A directory of two dozen deity names reads as a glossary; the
   * same list with the temples beside it reads as a set of places a family
   * could go, which is what these entries actually are.
   */
  const imageFor = (id: string) => {
    const temple =
      facet === "kuladevata"
        ? archive.templeByKuladevata.get(id)
        : facet === "math"
          ? archive.templeByMath.get(id)
          : undefined;
    return temple?.image ? { temple, image: temple.image } : undefined;
  };

  const noteFor = (id: string): string | undefined => {
    if (facet === "gotra") {
      const g = archive.gotras.get(id);
      return g?.pravara?.length
        ? `Pravara: ${g.pravara.join(", ")}${g.note ? ` — ${g.note}` : ""}`
        : g?.note;
    }
    if (facet === "kuladevata") {
      const k = archive.kuladevatas.get(id);
      return [k?.temple, k?.deityOf, k?.note].filter(Boolean).join(" · ");
    }
    if (facet === "mool") {
      const p = archive.places.get(id);
      return [p?.region, p?.alt?.length ? `also ${p.alt.join(", ")}` : undefined, p?.note]
        .filter(Boolean)
        .join(" · ");
    }
    if (facet === "math") {
      const m = archive.maths.get(id);
      return [m?.seat, m?.tradition, m?.note].filter(Boolean).join(" · ");
    }
    if (facet === "community") {
      const c = archive.communities.get(id);
      return [c?.region, c?.note].filter(Boolean).join(" · ");
    }
    const sn = archive.surnameNotes.get(id.toLowerCase());
    if (!sn) return undefined;
    return [
      sn.pattern && sn.pattern !== "unknown"
        ? `${sn.pattern}-name`
        : undefined,
      sn.note,
      sn.variants?.length ? `Also written ${sn.variants.join(", ")}` : undefined,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10">
      <nav
        aria-label="Breadcrumb"
        className="mb-6 flex items-center gap-2 text-[0.85rem] text-[var(--fg-faint)]"
      >
        <Link
          href="/directory"
          className="state-layer -mx-1 inline-flex min-h-[24px] items-center rounded-[var(--shape-xs)] px-1 hover:text-[var(--fg)]"
        >
          Directory
        </Link>
        <span>/</span>
        <span className="text-[var(--fg-soft)]">{config.title}</span>
      </nav>

      <header className="max-w-2xl">
        <p className="deva text-[1.15rem] text-[var(--accent)]" lang="kok">
          {config.konkani}
        </p>
        <h1 className="mt-1.5 font-display text-[2.2rem] font-medium leading-tight">
          {config.title}
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          {config.intro}
        </p>
        <p className="mt-3 text-[0.88rem] text-[var(--fg-faint)]">
          {list.length} recorded in the archive
        </p>
      </header>

      <ul className="mt-8 surface divide-y divide-[var(--line)] overflow-hidden">
        {list.map((f) => {
          const note = noteFor(f.id);
          const picture = imageFor(f.id);
          return (
            <li key={f.id}>
              <Link
                href={`/search?${config.param}=${encodeURIComponent(f.id)}`}
                className="group flex gap-4 px-5 py-4 transition-colors hover:bg-[var(--bg-sunken)]"
              >
                {picture && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={picture.image.src}
                    alt=""
                    width={112}
                    height={84}
                    loading="lazy"
                    decoding="async"
                    className="hidden h-[84px] w-28 shrink-0 rounded-[var(--shape-sm)] bg-[var(--bg-inset)] object-cover sm:block"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-[1.25rem] font-medium group-hover:text-[var(--accent)]">
                      {f.label}
                    </h2>
                    <span className="shrink-0 text-[0.85rem] tabular-nums text-[var(--fg-faint)]">
                      {f.count.toLocaleString()}{" "}
                      {f.count === 1 ? "person" : "people"}
                    </span>
                  </div>

                  {/* Proportional bar — makes the long tail of small families
                      legible next to the handful of very large ones. */}
                  <div
                    className="mt-2 h-1 rounded-full bg-[var(--bg-inset)]"
                    aria-hidden
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent)] opacity-60"
                      style={{ width: `${Math.max(2, (f.count / maxCount) * 100)}%` }}
                    />
                  </div>

                  {note && (
                    <p className="mt-2.5 text-[0.9rem] leading-relaxed text-[var(--fg-soft)]">
                      {note}
                    </p>
                  )}

                  {picture && (
                    <p className="mt-1.5 text-[0.72rem] text-[var(--fg-faint)]">
                      Photograph {picture.image.credit}, {picture.image.license}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
