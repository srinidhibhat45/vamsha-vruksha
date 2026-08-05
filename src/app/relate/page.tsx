import type { Metadata } from "next";
import { birthYear, deathYear, fullName, getArchive } from "@/lib/archive";
import { RelateTool } from "@/components/RelateTool";
import type { PickedPerson } from "@/components/PersonPicker";

export const metadata: Metadata = {
  title: "Relationship finder",
  description:
    "Work out how any two people in the archive are related, named in both English and Konkani.",
  alternates: { canonical: "/relate" },
};

type Params = Promise<{ a?: string; b?: string }>;

function pick(id?: string): PickedPerson | undefined {
  if (!id) return undefined;
  const archive = getArchive();
  const p = archive.people.get(id);
  if (!p) return undefined;
  const b = birthYear(p);
  const d = deathYear(p);
  const lineageId = archive.lineageOf.get(p.id);
  return {
    id: p.id,
    name: fullName(p),
    detail: [
      b && d ? `${b}–${d}` : b ? `b. ${b}` : undefined,
      lineageId ? archive.lineages.get(lineageId)?.label : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export default async function RelatePage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-[820px] px-4 py-12">
      <header className="text-center">
        <p className="eyebrow">
          <span className="deva" lang="kok">
            नातें
          </span>{" "}
          · Relationship
        </p>
        <h1 className="mt-2 font-display text-[2.6rem] font-medium leading-tight">
          How are we related?
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-[1.05rem] leading-relaxed text-[var(--fg-soft)]">
          Pick any two people in the archive. The answer comes back in English
          and in Konkani — which, for kin, is the more exact of the two.
        </p>
      </header>

      <div className="mt-9">
        <RelateTool initialA={pick(params.a)} initialB={pick(params.b)} />
      </div>
    </div>
  );
}
