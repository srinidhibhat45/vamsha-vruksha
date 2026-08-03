import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { birthYear, fullName, getArchive } from "@/lib/archive";
import type { LayoutMode } from "@/lib/layout";
import { buildTreePayload, resolveLineage } from "@/lib/treeSource";
import { TreeViewer } from "@/components/tree/TreeViewer";

export const metadata: Metadata = {
  title: "Family tree",
  description:
    "Walk the family tree — ancestors, descendants and marriages, with Konkani kinship terms.",
};

type Params = Promise<{
  person?: string;
  lineage?: string;
  mode?: string;
  up?: string;
  down?: string;
}>;

function clampDepth(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(12, Math.round(n)));
}

export default async function TreePage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;
  const archive = getArchive();

  if (!archive.lineageList.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-[2.2rem] font-medium">
          Nothing here yet
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          The archive has no records loaded. Add the first family and the tree
          will grow from there.
        </p>
        <Link href="/contribute" className="btn btn-filled btn-lg mt-7">
          Add a family
        </Link>
      </div>
    );
  }

  // A tree needs a family to draw. With more than one in the archive, opening
  // one at random would land the reader in a stranger's family with no way
  // to tell that is what happened — so an unqualified /tree asks first,
  // rather than guessing. A person or lineage named explicitly in the URL
  // (a link from search, a re-root, a bookmark) still goes straight there,
  // and a single-lineage archive has no real choice to offer.
  const explicitLineageId =
    params.lineage && archive.lineages.has(params.lineage)
      ? params.lineage
      : undefined;
  const lineageId =
    explicitLineageId ??
    (params.person ? resolveLineage(params.person) : undefined) ??
    (archive.lineageList.length === 1 ? archive.lineageList[0].id : undefined);

  if (!lineageId) {
    return <ChooseFamily lineages={archive.lineageList} archive={archive} />;
  }

  const payload = buildTreePayload(lineageId);
  if (!payload) notFound();

  const mode: LayoutMode = (["hourglass", "descendants", "ancestors"] as const).includes(
    params.mode as LayoutMode,
  )
    ? (params.mode as LayoutMode)
    : "hourglass";

  const lineages = archive.lineageList.map((l) => ({
    id: l.id,
    label: l.label,
    size: l.size,
  }));

  // The chrome above the canvas is the site header, plus the sample-data notice
  // when it is showing. Subtracting it here lets the viewer own exactly one
  // screenful, so panning never fights with page scrolling.
  const chrome = archive.sampleOnly ? "5.6rem" : "3.9rem";

  return (
    <div
      style={{ height: `calc(100dvh - ${chrome})` }}
      className="tree-route flex flex-col"
    >
      {/*
        The page is one full-bleed canvas, so there is nowhere to put a
        visible title without stealing room from the drawing. It still needs
        one: a document with no h1 gives a screen-reader user nothing to
        orient by, and "Family tree" alone would not say *whose*.
      */}
      <h1 className="sr-only">
        Family tree of {payload.lineageLabel} — {payload.size} people
      </h1>
      <TreeViewer
        payload={payload}
        lineages={lineages}
        initialFocus={params.person}
        initialMode={mode}
        initialUp={clampDepth(params.up, 3)}
        initialDown={clampDepth(params.down, 3)}
      />
    </div>
  );
}

/**
 * The landing screen for /tree with no lineage or person named. One tree
 * cannot draw two unconnected families at once, so the reader has to pick
 * one — this asks, rather than silently opening whichever lineage happens
 * to be largest.
 */
function ChooseFamily({
  lineages,
  archive,
}: {
  lineages: ReturnType<typeof getArchive>["lineageList"];
  archive: ReturnType<typeof getArchive>;
}) {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12">
      <header className="max-w-2xl">
        <p className="eyebrow">
          <span className="deva" lang="kok">
            वंशवृक्ष
          </span>{" "}
          · Family tree
        </p>
        <h1 className="mt-2 font-display text-[2.2rem] font-medium leading-tight">
          Whose tree?
        </h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          The archive holds {lineages.length} separate family lines. Choose
          one to open its tree, or find a person by name first.
        </p>
      </header>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lineages.map((l) => {
          const apex = archive.people.get(l.apexId);
          return (
            <Link
              key={l.id}
              href={`/tree?lineage=${l.id}`}
              className="surface state-layer flex flex-col p-5 transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-[1.15rem] font-medium leading-snug">
                  {l.label}
                </h2>
                <span className="chip chip-sm chip-accent shrink-0">
                  {l.size}
                  <span className="sr-only"> people</span>
                </span>
              </div>
              {apex && (
                <p className="mt-2 text-[0.88rem] text-[var(--fg-soft)]">
                  Earliest recorded: {fullName(apex)}
                  {birthYear(apex) && `, born ${birthYear(apex)}`}
                </p>
              )}
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-[0.92rem] text-[var(--fg-soft)]">
        Know who you are looking for?{" "}
        <Link href="/search" className="link-underline font-medium">
          Search by name
        </Link>{" "}
        instead, and its tree will open already rooted on them.
      </p>
    </div>
  );
}
