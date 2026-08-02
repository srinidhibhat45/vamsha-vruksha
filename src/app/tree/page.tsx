import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getArchive } from "@/lib/archive";
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

  const lineageId =
    (params.lineage && archive.lineages.has(params.lineage)
      ? params.lineage
      : undefined) ?? resolveLineage(params.person);

  if (!lineageId) notFound();

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
