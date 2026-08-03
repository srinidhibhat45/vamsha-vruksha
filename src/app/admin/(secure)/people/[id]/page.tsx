import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fullName, getArchive, lifespan } from "@/lib/archive";
import { readPersonRaw } from "@/lib/peopleStore";
import { buildRefs } from "@/lib/refs";
import { PersonEditor, type EditorPerson } from "@/components/admin/PersonEditor";
import type { Person } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const person = getArchive().people.get(id);
  return { title: person ? `Edit ${fullName(person)}` : "Edit a record" };
}

/** Fill the editor's flat string fields from the stored record. */
function toEditorPerson(person: Person): EditorPerson {
  const archive = getArchive();
  const named = (id: string | undefined) => {
    if (!id) return null;
    const p = archive.people.get(id);
    return p ? { id, name: fullName(p), detail: lifespan(p) } : { id, name: id };
  };

  const num = (n: number | undefined) => (n === undefined ? "" : String(n));

  return {
    id: person.id,
    given: person.name.given ?? "",
    patronymic: person.name.patronymic ?? "",
    surname: person.name.surname ?? "",
    display: person.name.display ?? "",
    devanagari: person.name.devanagari ?? "",
    kannada: person.name.kannada ?? "",
    aka: (person.name.aka ?? []).join(", "),
    gender: person.gender ?? "?",
    status: person.status ?? "unknown",

    birthYear: num(person.birth?.date?.year),
    birthRaw: person.birth?.date?.raw ?? "",
    // "exact" and "between" have no control in the editor; both fall back to
    // the unstated option rather than silently becoming "circa".
    birthQualifier:
      person.birth?.date?.qualifier &&
      ["circa", "before", "after"].includes(person.birth.date.qualifier)
        ? person.birth.date.qualifier
        : "",
    birthPlace: person.birth?.place?.id ?? "",
    birthPlaceLabel: person.birth?.place?.label ?? "",

    deathYear: num(person.death?.date?.year),
    deathRaw: person.death?.date?.raw ?? "",
    deathPlace: person.death?.place?.id ?? "",
    deathPlaceLabel: person.death?.place?.label ?? "",
    deathNote: person.death?.note ?? "",

    gotra: person.gotra ?? "",
    community: person.community ?? "",
    math: person.math ?? "",
    kuladevata: person.kuladevata ?? "",
    mool: person.mool ?? "",
    veda: person.veda ?? "",
    sutra: person.sutra ?? "",

    // Label-only entries are kept as rows rather than dropped, or opening the
    // record and saving it would quietly shorten the person's life story.
    residences: (person.residences ?? [])
      .map((r) => ({ id: r.id ?? "", label: r.label ?? "" }))
      .filter((r) => r.id || r.label),
    occupations: (person.occupations ?? []).join(", "),
    epithet: person.epithet ?? "",
    bio: person.bio ?? "",
    notes: person.notes ?? "",

    father: named(person.fatherId),
    mother: named(person.motherId),
    spouses: (person.spouses ?? [])
      .map((s) => {
        const partner = named(s.personId);
        return partner
          ? {
              person: partner,
              status: s.status ?? "married",
              year: num(s.date?.year),
            }
          : null;
      })
      .filter((s): s is NonNullable<typeof s> => !!s),
    parentage: person.parentage ?? "",

    photoUrl: person.photo?.url ?? "",
    photoCaption: person.photo?.caption ?? "",

    confidence: person.confidence ?? "unverified",
    contributedBy: person.contributedBy ?? "",
  };
}

export default async function EditPersonPage({ params }: { params: Params }) {
  const { id } = await params;

  // Straight from disk rather than from the cached graph, so the form always
  // opens on what is actually stored.
  const person = readPersonRaw(id);
  if (!person) notFound();

  const archive = getArchive();
  const lineageId = archive.lineageOf.get(id);
  const lineage = lineageId ? archive.lineages.get(lineageId) : undefined;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-9">
      <header>
        <p className="eyebrow">Editing a record</p>
        <h1 className="mt-2 font-display text-[2.1rem] font-medium">
          {fullName(person)}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.9rem] text-[var(--fg-faint)]">
          <code className="rounded bg-[var(--bg-inset)] px-1.5 py-0.5">
            {person.id}
          </code>
          {lifespan(person) && <span>· {lifespan(person)}</span>}
          {lineage && (
            <span>
              ·{" "}
              <Link href={`/lineages#${lineage.id}`} className="link-underline">
                {lineage.label}
              </Link>
            </span>
          )}
          {person.updatedAt && <span>· last changed {person.updatedAt}</span>}
        </p>

        {person.sample && (
          <p className="mt-4 rounded-[var(--shape-md)] bg-[var(--bg-inset)] p-3.5 text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
            This is one of the generated sample records — the person is
            fictional, though the gotra, village and naming conventions around
            them are not. Editing it is harmless; it stays marked as sample.
          </p>
        )}

        <p className="mt-4 max-w-2xl text-[0.9rem] leading-relaxed text-[var(--fg-faint)]">
          A field cleared here is cleared on the record. That is the point — it
          is how a wrong gotra gets retracted — but it means blanking a field
          you simply do not know is not the same as leaving it as it was.
        </p>
      </header>

      <div className="mt-7">
        <PersonEditor
          refs={buildRefs()}
          initial={toEditorPerson(person)}
          personId={person.id}
        />
      </div>
    </div>
  );
}
