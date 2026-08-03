import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CONFIDENCE_LABEL,
  CONFIDENCE_NOTE,
  birthYear,
  deathYear,
  fullName,
  getArchive,
  initials,
  parentIdsOf,
  siblingIdsOf,
  spouseIdsOf,
} from "@/lib/archive";
import { relate } from "@/lib/kinship";
import {
  Deepa,
  GotraMark,
  Mandala,
  MarkBranch,
  MarkHourglass,
  MarkSource,
} from "@/components/Ornament";
import type { FuzzyDate, Person } from "@/lib/types";

/**
 * One person's full record.
 *
 * Built on Material 3's card and list patterns, for a reason that is specific
 * to this page rather than fashionable: a record is a stack of six unrelated
 * kinds of thing — a life, a family, a chronology, a descent, a provenance, a
 * bundle of lineage fields — and the previous layout ran all six together as
 * headings over bare text on one flat page. There was nothing to tell a
 * reader where the family ended and the timeline began except a change of
 * word. Each of them is now a card with its own header and mark, related
 * people are two-line list items with a monogram instead of a run of links,
 * and the identity block at the top is a surface of its own tinted with the
 * one colour this page is entitled to use — the person's own.
 */

type Params = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  const archive = getArchive();
  const person = archive.people.get(id);
  if (!person) return { title: "Not found" };

  const b = birthYear(person);
  const d = deathYear(person);
  const years = b && d ? `${b}–${d}` : b ? `b. ${b}` : "";
  return {
    title: `${fullName(person)}${years ? ` (${years})` : ""}`,
    description: [
      fullName(person),
      person.gotra && `${archive.gotras.get(person.gotra)?.name} gotra`,
      person.mool && `of ${archive.places.get(person.mool)?.name}`,
    ]
      .filter(Boolean)
      .join(", "),
  };
}

function formatDate(date?: FuzzyDate): string {
  if (!date) return "not recorded";
  if (date.raw) return date.raw;
  if (!date.year) return "not recorded";
  const prefix =
    date.qualifier === "circa"
      ? "c. "
      : date.qualifier === "before"
        ? "before "
        : date.qualifier === "after"
          ? "after "
          : "";
  if (date.month && date.day) {
    return `${prefix}${date.day}/${date.month}/${date.year}`;
  }
  return `${prefix}${date.year}`;
}

/** Walk straight up the father's line — the descent a gotra follows. */
function maleLine(id: string): Person[] {
  const archive = getArchive();
  const out: Person[] = [];
  const seen = new Set<string>();
  let cur = archive.people.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.fatherId ? archive.people.get(cur.fatherId) : undefined;
  }
  return out.reverse();
}

function toneOf(gender: string): string {
  if (gender === "F") return "var(--color-kumkum)";
  if (gender === "M") return "var(--color-samudra)";
  return "var(--color-gold)";
}

// The tree's card colour is the only other place this is recorded, and that
// colour is decorative (WCAG 1.4.1) — a reader who cannot see it, or cannot
// tell the two apart, needs it written down somewhere too.
function genderLabel(gender: string): string | undefined {
  if (gender === "F") return "Woman";
  if (gender === "M") return "Man";
  return undefined;
}

export default async function PersonPage({ params }: { params: Params }) {
  const { id } = await params;
  const archive = getArchive();
  const person = archive.people.get(id);
  if (!person) notFound();

  const b = birthYear(person);
  const d = deathYear(person);
  const age =
    b && d ? d - b : b && person.status === "living" ? 2026 - b : undefined;

  const parents = parentIdsOf(archive, id).map((x) => archive.people.get(x)!);
  const spouses = spouseIdsOf(archive, id).map((x) => archive.people.get(x)!);
  const children = (archive.childrenOf.get(id) ?? []).map(
    (x) => archive.people.get(x)!,
  );
  const siblings = siblingIdsOf(archive, id).map((x) => archive.people.get(x)!);

  const lineageId = archive.lineageOf.get(id);
  const lineage = lineageId ? archive.lineages.get(lineageId) : undefined;
  const line = maleLine(id);
  const gotra = person.gotra ? archive.gotras.get(person.gotra) : undefined;
  const math = person.math ? archive.maths.get(person.math) : undefined;
  const kuladevata = person.kuladevata
    ? archive.kuladevatas.get(person.kuladevata)
    : undefined;
  const mool = person.mool ? archive.places.get(person.mool) : undefined;
  const community = person.community
    ? archive.communities.get(person.community)
    : undefined;

  const apex = lineage ? archive.people.get(lineage.apexId) : undefined;
  const toApex =
    apex && apex.id !== id ? relate(archive, id, apex.id) : undefined;

  const tone = toneOf(person.gender);

  const timeline: { year?: number; label: string; detail?: string }[] = [];
  if (person.birth?.date)
    timeline.push({
      year: person.birth.date.year,
      label: "Born",
      detail: [
        formatDate(person.birth.date),
        person.birth.place?.id
          ? archive.places.get(person.birth.place.id)?.name
          : person.birth.place?.label,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  for (const s of person.spouses ?? []) {
    const other = archive.people.get(s.personId);
    timeline.push({
      year: s.date?.year,
      label: "Married",
      detail: [
        other ? fullName(other) : "—",
        s.date ? formatDate(s.date) : undefined,
        s.place?.id ? archive.places.get(s.place.id)?.name : s.place?.label,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  for (const c of children) {
    timeline.push({
      year: birthYear(c),
      label: "Child born",
      detail: `${fullName(c)}${birthYear(c) ? `, ${birthYear(c)}` : ""}`,
    });
  }
  if (person.death?.date)
    timeline.push({
      year: person.death.date.year,
      label: "Died",
      detail: [
        formatDate(person.death.date),
        person.death.place?.id
          ? archive.places.get(person.death.place.id)?.name
          : person.death.place?.label,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  timeline.sort((x, y) => (x.year ?? 9999) - (y.year ?? 9999));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8">
      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.85rem] text-[var(--fg-faint)]"
      >
        <Link
          href="/search"
          className="state-layer -mx-1 inline-flex min-h-[24px] items-center rounded-[var(--shape-xs)] px-1 hover:text-[var(--fg)]"
        >
          Archive
        </Link>
        <span>/</span>
        {lineage && (
          <>
            <Link
              href={`/tree?lineage=${lineage.id}`}
              className="state-layer -mx-1 inline-flex min-h-[24px] items-center rounded-[var(--shape-xs)] px-1 hover:text-[var(--fg)]"
            >
              {lineage.label}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-[var(--fg-soft)]">{fullName(person)}</span>
      </nav>

      {/* ------------------------------------------------------- Header */}
      <header
        className="m3-card m3-card-elevated relative overflow-hidden"
        style={{ ["--tone" as string]: tone }}
      >
        {/* A wash of the person's own colour, and a mandala turned down far
            enough to be a watermark. Nothing on this page carries a fact in
            colour, so the tint is free to be decorative. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(160deg, color-mix(in oklab, ${tone} 13%, transparent) 0%, transparent 46%)`,
          }}
          aria-hidden
        />
        <div
          className="mandala-bed opacity-[0.07]"
          style={{
            color: tone,
            maskImage:
              "radial-gradient(ellipse 50% 120% at 92% 40%, #000 10%, transparent 70%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 50% 120% at 92% 40%, #000 10%, transparent 70%)",
          }}
        >
          <Mandala className="ml-[62%] h-[26rem] w-[26rem] max-w-none shrink-0" folds={12} />
        </div>

        <div className="relative flex flex-wrap items-start gap-6 p-6">
          <span
            className="avatar avatar-square [--avatar:88px]"
            style={{ ["--tone" as string]: tone }}
            aria-hidden
          >
            {initials(person)}
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[2.25rem] font-medium leading-tight">
              {fullName(person)}
            </h1>
            {(person.name.devanagari || person.name.kannada) && (
              <p
                className="deva mt-0.5 text-xl text-[var(--fg-soft)]"
                lang={person.name.devanagari ? "kok" : "kn"}
              >
                {person.name.devanagari ?? person.name.kannada}
              </p>
            )}
            <p className="mt-2 text-[0.98rem] text-[var(--fg-soft)]">
              {b && d
                ? `${b} – ${d}`
                : b
                  ? `born ${b}`
                  : d
                    ? `died ${d}`
                    : "dates not recorded"}
              {age !== undefined && ` · ${age} years`}
              {person.status === "living" && (
                <span className="ml-2 inline-flex items-center gap-1 align-middle text-[var(--color-haldi)]">
                  <Deepa className="h-3.5 w-3.5" />
                  living
                </span>
              )}
            </p>

            {/*
              Each of these is a link into a filtered search, so the field name
              travels with the value — "Kaundinya gotra", not a bare word whose
              kind you are expected to already know.
            */}
            <div className="mt-4 flex flex-wrap gap-2">
              {gotra && (
                <Link
                  href={`/search?gotra=${gotra.id}`}
                  className="chip chip-gotra"
                >
                  {gotra.name} gotra
                </Link>
              )}
              {mool && (
                <Link href={`/search?mool=${mool.id}`} className="chip chip-mool">
                  {mool.name}
                  <span className="font-normal opacity-70"> · mool</span>
                </Link>
              )}
              {kuladevata && (
                <Link
                  href={`/search?kuladevata=${kuladevata.id}`}
                  className="chip"
                >
                  {kuladevata.name}
                  <span className="font-normal opacity-70"> · kuladevata</span>
                </Link>
              )}
              {math && (
                <Link href={`/search?math=${math.id}`} className="chip chip-math">
                  {math.name}
                </Link>
              )}
              {community && (
                <Link href={`/search?community=${community.id}`} className="chip">
                  {community.name}
                </Link>
              )}
            </div>

            {person.epithet && (
              <p className="mt-4 border-l-2 border-[color-mix(in_oklab,var(--tone)_45%,transparent)] pl-3 text-[1rem] italic leading-relaxed text-[var(--fg-soft)]">
                {person.epithet}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <Link
              href={`/tree?person=${person.id}&mode=hourglass`}
              className="btn btn-filled"
            >
              Show in the tree
            </Link>
            <Link href={`/relate?a=${person.id}`} className="btn btn-outlined">
              Relationship to…
            </Link>
            <Link
              href={`/contribute?correct=${person.id}`}
              className="btn btn-text"
            >
              Suggest a correction
            </Link>
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_330px]">
        <div className="min-w-0 space-y-6">
          {person.bio && (
            <Card
              title="Life"
              facet="var(--color-gold)"
              mark={<Deepa className="h-[1.05rem] w-[1.05rem]" />}
            >
              <p className="text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
                {person.bio}
              </p>
            </Card>
          )}

          {/* ------------------------------------------------- Family */}
          <Card
            title="Family"
            facet="var(--color-laterite)"
            mark={<MarkBranch className="h-[1.05rem] w-[1.05rem]" />}
            bodyClass="p-3"
          >
            <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
              <FamilyGroup
                title="Parents"
                people={parents}
                empty="Not recorded — this is where the line stops."
              />
              <FamilyGroup
                title={spouses.length > 1 ? "Marriages" : "Married to"}
                people={spouses}
                empty="No marriage recorded."
              />
              <FamilyGroup
                title={`Children${children.length ? ` · ${children.length}` : ""}`}
                people={children}
                empty="No children recorded."
              />
              <FamilyGroup
                title={`Siblings${siblings.length ? ` · ${siblings.length}` : ""}`}
                people={siblings}
                empty="No siblings recorded."
              />
            </div>
          </Card>

          {/* ----------------------------------------------- Timeline */}
          {timeline.length > 0 && (
            <Card
              title="Timeline"
              facet="var(--color-samudra)"
              mark={<MarkHourglass className="h-[1.05rem] w-[1.05rem]" />}
            >
              {/* The year sits in a gutter of its own to the left of the
                  rail, so the dates can be read down the page as a column
                  without the labels breaking the line. Laid out on a grid
                  rather than with negative offsets: the rail is a real cell
                  that stretches to each row's height, so a two-line entry
                  cannot leave a gap in it. */}
              <ol>
                {timeline.map((e, i) => {
                  const last = i === timeline.length - 1;
                  return (
                    <li
                      key={i}
                      className="grid grid-cols-[3.2rem_1.5rem_1fr] items-start"
                    >
                      <span className="pt-px text-right font-display text-[0.95rem] tabular-nums text-[var(--fg-soft)]">
                        {e.year ?? "—"}
                      </span>
                      <span
                        className="relative flex justify-center self-stretch"
                        aria-hidden
                      >
                        <span
                          className={`absolute top-0 w-px bg-[var(--line-strong)] ${
                            last ? "h-[0.75rem]" : "bottom-0"
                          }`}
                        />
                        <span
                          className="relative mt-[0.28rem] h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-raised)]"
                          style={{ background: tone }}
                        />
                      </span>
                      <span className={last ? "block" : "block pb-5"}>
                        <span className="block text-[0.9rem] font-medium leading-snug">
                          {e.label}
                        </span>
                        {e.detail && (
                          <span className="mt-0.5 block text-[0.85rem] leading-snug text-[var(--fg-soft)]">
                            {e.detail}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {/* -------------------------------------------- Male descent */}
          {line.length > 1 && (
            <Card
              title="Line of descent"
              facet="var(--color-tulsi)"
              mark={<GotraMark className="h-[1.05rem] w-[1.05rem]" />}
            >
              <p className="text-[0.85rem] leading-relaxed text-[var(--fg-faint)]">
                Father to child, the way gotra and kuladevata are passed down.{" "}
                {line.length - 1 === 1
                  ? "One generation is recorded above this person."
                  : `${line.length - 1} generations are recorded above this person.`}
              </p>
              <ol className="mt-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {line.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-1.5">
                    {i > 0 && (
                      <span className="text-[var(--fg-faint)]" aria-hidden>
                        →
                      </span>
                    )}
                    {p.id === person.id ? (
                      <span className="chip chip-selected" aria-current="true">
                        {fullName(p)}
                        {birthYear(p) ? ` ${birthYear(p)}` : ""}
                      </span>
                    ) : (
                      <Link href={`/person/${p.id}`} className="chip">
                        {fullName(p)}
                        {birthYear(p) ? ` ${birthYear(p)}` : ""}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {/* --------------------------------------------- Provenance */}
          <Card
            title="Where this comes from"
            facet="var(--accent)"
            mark={<MarkSource className="h-[1.05rem] w-[1.05rem]" />}
          >
            <p className="flex items-start gap-2.5 text-[0.9rem] leading-relaxed">
              <span
                className="mt-[0.36rem] inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  background:
                    person.confidence === "verified"
                      ? "var(--color-tulsi)"
                      : person.confidence === "attested"
                        ? "var(--color-gold)"
                        : "transparent",
                  border:
                    person.confidence === "oral" ||
                    person.confidence === "unverified"
                      ? "1px solid var(--fg-faint)"
                      : "none",
                }}
                aria-hidden
              />
              <span>
                <strong className="font-semibold">
                  {CONFIDENCE_LABEL[person.confidence]}
                </strong>{" "}
                <span className="text-[var(--fg-soft)]">
                  {CONFIDENCE_NOTE[person.confidence]}
                </span>
              </span>
            </p>

            {person.sources?.length ? (
              <ul className="mt-4 space-y-2.5 border-t border-[var(--line)] pt-3.5">
                {person.sources.map((src, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.88rem] leading-relaxed"
                  >
                    <span className="chip chip-sm">
                      {src.kind.replace("-", " ")}
                    </span>
                    <span>
                      <strong className="font-medium">{src.title}</strong>
                      {src.detail && (
                        <span className="text-[var(--fg-soft)]">
                          {" "}
                          — {src.detail}
                        </span>
                      )}
                      {src.year && (
                        <span className="text-[var(--fg-faint)]">
                          {" "}
                          ({src.year})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 border-t border-[var(--line)] pt-3.5 text-[0.85rem] leading-relaxed text-[var(--fg-faint)]">
                No source is attached to this record. If you know where it came
                from — a document, a photograph, an elder who told you — that is
                exactly the kind of correction worth sending.
              </p>
            )}

            {person.notes && (
              <p className="mt-3.5 border-t border-[var(--line)] pt-3.5 text-[0.85rem] italic leading-relaxed text-[var(--fg-soft)]">
                {person.notes}
              </p>
            )}

            <p className="mt-3.5 border-t border-[var(--line)] pt-3.5 text-[0.75rem] text-[var(--fg-faint)]">
              Contributed by {person.contributedBy ?? "an anonymous member"}
              {person.updatedAt && ` · last changed ${person.updatedAt}`}
              {person.sample && " · demonstration record"}
            </p>
          </Card>
        </div>

        {/* --------------------------------------------------- Sidebar */}
        <aside className="space-y-6">
          <div className="m3-card m3-card-filled">
            <div className="m3-card-head">
              <h2 className="m3-card-title">Details</h2>
            </div>
            <dl className="divide-y divide-[var(--line)] px-4 py-1">
              <Detail label="Recorded as" value={genderLabel(person.gender)} />
              <Detail label="Gotra" value={gotra?.name} />
              {gotra?.pravara && (
                <Detail label="Pravara" value={gotra.pravara.join(" · ")} />
              )}
              <Detail label="Veda" value={person.veda} />
              <Detail label="Sutra" value={person.sutra} />
              <Detail label="Matha" value={math?.name} />
              <Detail label="Kuladevata" value={kuladevata?.name} />
              {kuladevata?.temple && (
                <Detail label="Temple" value={kuladevata.temple} />
              )}
              <Detail label="Mool" value={mool?.name} />
              <Detail label="Community" value={community?.name} />
              <Detail
                label="Lived at"
                value={person.residences
                  ?.map((r) =>
                    r.id ? (archive.places.get(r.id)?.name ?? r.id) : r.label,
                  )
                  .filter(Boolean)
                  .join(" → ")}
              />
              <Detail label="Work" value={person.occupations?.join(", ")} />
            </dl>
          </div>

          {lineage && (
            <div className="m3-card">
              <div className="m3-card-head">
                <h2 className="m3-card-title">Lineage</h2>
              </div>
              <div className="m3-card-body">
                <Link
                  href={`/tree?lineage=${lineage.id}`}
                  className="inline-flex min-h-[24px] items-center font-display text-[1.15rem] font-medium hover:text-[var(--accent)]"
                >
                  {lineage.label}
                </Link>
                <p className="mt-1.5 text-[0.8rem] text-[var(--fg-soft)]">
                  {lineage.size} people · {lineage.generations} generations
                  {lineage.earliestYear && ` · from ${lineage.earliestYear}`}
                </p>
                {apex && toApex && (
                  <p className="mt-3.5 border-t border-[var(--line)] pt-3.5 text-[0.85rem] leading-relaxed text-[var(--fg-soft)]">
                    <Link
                      href={`/person/${apex.id}`}
                      className="link-underline inline-flex min-h-[24px] items-center font-medium"
                    >
                      {fullName(apex)}
                    </Link>{" "}
                    is this person&rsquo;s{" "}
                    <strong className="font-medium text-[var(--fg)]">
                      {toApex.term.english}
                    </strong>
                    {toApex.term.konkani && (
                      <span className="text-[var(--accent)]" lang="kok">
                        {" "}
                        ({toApex.term.konkani})
                      </span>
                    )}
                    .
                  </p>
                )}
              </div>
            </div>
          )}

          {gotra?.note && (
            <NoteCard title="On this gotra">{gotra.note}</NoteCard>
          )}

          {kuladevata?.note && (
            <NoteCard title="On this deity">{kuladevata.note}</NoteCard>
          )}
        </aside>
      </div>
    </div>
  );
}

/** An M3 outlined card with a marked header. */
function Card({
  title,
  facet,
  mark,
  children,
  bodyClass = "m3-card-body",
}: {
  title: string;
  facet: string;
  mark: React.ReactNode;
  children: React.ReactNode;
  bodyClass?: string;
}) {
  return (
    <section className="m3-card">
      <div className="m3-card-head">
        <span
          className="section-mark"
          style={{ ["--facet" as string]: facet }}
          aria-hidden
        >
          {mark}
        </span>
        <h2 className="m3-card-title">{title}</h2>
      </div>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

function NoteCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="m3-card m3-card-filled p-4">
      <h2 className="eyebrow mb-2">{title}</h2>
      <p className="text-[0.83rem] leading-relaxed text-[var(--fg-soft)]">
        {children}
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3 py-2.5">
      <dt className="fact-label pt-[3px]">{label}</dt>
      <dd className="text-[0.9rem] leading-snug text-[var(--fg)]">{value}</dd>
    </div>
  );
}

function FamilyGroup({
  title,
  people,
  empty,
}: {
  title: string;
  people: Person[];
  empty: string;
}) {
  return (
    <div>
      <h3 className="eyebrow mb-1.5 px-1">{title}</h3>
      {people.length === 0 ? (
        <p className="px-1 text-[0.82rem] text-[var(--fg-faint)]">{empty}</p>
      ) : (
        <ul>
          {people.map((p) => {
            const by = birthYear(p);
            const dy = deathYear(p);
            return (
              <li key={p.id}>
                <Link
                  href={`/person/${p.id}`}
                  className="list-item"
                  style={{ ["--tone" as string]: toneOf(p.gender) }}
                >
                  <span className="avatar [--avatar:30px]" aria-hidden>
                    {initials(p)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="list-item-headline">{fullName(p)}</span>
                    <span className="list-item-support">
                      {by
                        ? dy
                          ? `${by}–${dy}`
                          : p.status === "living"
                            ? `born ${by} · living`
                            : `born ${by}`
                        : "dates not recorded"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
