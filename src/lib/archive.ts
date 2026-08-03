import fs from "node:fs";
import path from "node:path";
import type {
  Community,
  Confidence,
  Gotra,
  Kuladevata,
  Lineage,
  Math as MathRef,
  Person,
  Place,
  Temple,
  Union,
} from "./types.ts";

/**
 * The archive is loaded once into module scope and held in memory.
 *
 * That is a deliberate choice rather than a shortcut. Genealogy is a graph
 * problem: every interesting question — "show me six generations of
 * descendants", "how is this person related to that one", "which lineages share
 * a kuladevata" — is a traversal, and traversals against a SQL database are
 * either N+1 round trips or recursive CTEs that nobody can maintain. A
 * community archive of even half a million people is a few hundred megabytes of
 * plain objects, and every traversal then costs microseconds.
 *
 * The corresponding cost is that writes do not go here. Submissions land in a
 * moderation queue; approved records are written back into data/people/*.json
 * and committed to git, which is what gives the archive an auditable history of
 * who claimed what and when. The running site reloads them on next boot.
 */

const DATA_DIR = path.join(process.cwd(), "data");

export interface SurnameNote {
  name: string;
  variants?: string[];
  communities?: string[];
  pattern?: string;
  note?: string;
}

export interface Archive {
  people: Map<string, Person>;
  /** Insertion-ordered list, for stable iteration. */
  personList: Person[];
  unions: Map<string, Union>;
  /** person id -> union ids they are a partner in */
  unionsOf: Map<string, string[]>;
  /** person id -> the union they were born into */
  parentUnionOf: Map<string, string>;
  /** person id -> child ids, in birth order where known */
  childrenOf: Map<string, string[]>;
  /** person id -> relative generation, 0 = oldest in their lineage */
  generationOf: Map<string, number>;
  /** person id -> lineage id */
  lineageOf: Map<string, string>;
  lineages: Map<string, Lineage>;
  lineageList: Lineage[];

  gotras: Map<string, Gotra>;
  maths: Map<string, MathRef>;
  communities: Map<string, Community>;
  kuladevatas: Map<string, Kuladevata>;
  places: Map<string, Place>;
  temples: Map<string, Temple>;
  /**
   * Indexed both ways round because the two are asked for from opposite
   * directions: the diaspora gallery walks the temples, while a person's
   * record and the kuladevata directory hold a deity id and want its picture.
   */
  templeByKuladevata: Map<string, Temple>;
  templeByMath: Map<string, Temple>;
  surnameNotes: Map<string, SurnameNote>;

  stats: ArchiveStats;
  /** True when the only records present are the generated demonstration set. */
  sampleOnly: boolean;
}

export interface ArchiveStats {
  people: number;
  unions: number;
  lineages: number;
  largestLineage: number;
  maxGenerations: number;
  earliestYear?: number;
  latestYear?: number;
  living: number;
  withPhoto: number;
  byCommunity: Facet[];
  byGotra: Facet[];
  byMath: Facet[];
  byMool: Facet[];
  bySurname: Facet[];
  byKuladevata: Facet[];
  byConfidence: Facet[];
  byBirthDecade: { decade: number; count: number }[];
  byCountry: Facet[];
}

export interface Facet {
  id: string;
  label: string;
  count: number;
}

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function readReference<T>(name: string): T[] {
  const file = path.join(DATA_DIR, "reference", `${name}.json`);
  const doc = readJson<{ items?: T[] }>(file, {});
  return doc.items ?? [];
}

function readPeople(): Person[] {
  const dir = path.join(DATA_DIR, "people");
  if (!fs.existsSync(dir)) return [];
  const out: Person[] = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const doc = readJson<{ people?: Person[] } | Person[]>(
      path.join(dir, file),
      [],
    );
    const list = Array.isArray(doc) ? doc : (doc.people ?? []);
    out.push(...list);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Derivation                                                          */
/* ------------------------------------------------------------------ */

function unionIdFor(partners: string[]): string {
  return "u:" + [...partners].sort().join("+");
}

export function birthYear(p: Person | undefined): number | undefined {
  return p?.birth?.date?.year;
}

export function deathYear(p: Person | undefined): number | undefined {
  return p?.death?.date?.year;
}

/**
 * Build unions from the parentage and spouse fields authored on people.
 *
 * Contributors never write union records — they write "my father was X". The
 * renderer, though, needs a node between a couple and their children, or
 * siblings from two marriages get drawn as one undifferentiated row.
 */
function buildUnions(people: Person[], byId: Map<string, Person>) {
  const unions = new Map<string, Union>();
  const unionsOf = new Map<string, string[]>();
  const parentUnionOf = new Map<string, string>();

  const register = (u: Union) => {
    unions.set(u.id, u);
    for (const partner of u.partners) {
      const list = unionsOf.get(partner) ?? [];
      if (!list.includes(u.id)) list.push(u.id);
      unionsOf.set(partner, list);
    }
    return u;
  };

  // Pass 1 — explicit marriages. These carry date/place metadata worth keeping.
  for (const p of people) {
    for (const link of p.spouses ?? []) {
      if (!byId.has(link.personId)) continue;
      const id = unionIdFor([p.id, link.personId]);
      const existing = unions.get(id);
      if (existing) {
        existing.status ??= link.status;
        existing.date ??= link.date;
        existing.place ??= link.place;
        continue;
      }
      register({
        id,
        partners: [p.id, link.personId].sort(),
        childIds: [],
        status: link.status,
        date: link.date,
        place: link.place,
      });
    }
  }

  // Pass 2 — attach children.
  for (const p of people) {
    const father = p.fatherId && byId.has(p.fatherId) ? p.fatherId : undefined;
    const mother = p.motherId && byId.has(p.motherId) ? p.motherId : undefined;
    if (!father && !mother) continue;

    let unionId: string;
    if (father && mother) {
      unionId = unionIdFor([father, mother]);
      if (!unions.has(unionId)) {
        register({ id: unionId, partners: [father, mother].sort(), childIds: [] });
      }
    } else {
      // Only one parent is recorded. If that parent has exactly one marriage,
      // the child almost certainly belongs to it — attaching them there keeps
      // half-recorded families from splitting into two phantom households.
      const lone = (father ?? mother)!;
      const candidates = unionsOf.get(lone) ?? [];
      if (candidates.length === 1) {
        unionId = candidates[0];
      } else {
        unionId = unionIdFor([lone]);
        if (!unions.has(unionId)) {
          register({ id: unionId, partners: [lone], childIds: [] });
        }
      }
    }

    unions.get(unionId)!.childIds.push(p.id);
    parentUnionOf.set(p.id, unionId);
  }

  // Birth order where we know it; unknown births sink to the end but keep their
  // relative input order, which is usually the order the contributor listed them.
  for (const u of unions.values()) {
    u.childIds.sort((a, b) => {
      const ya = birthYear(byId.get(a));
      const yb = birthYear(byId.get(b));
      if (ya != null && yb != null) return ya - yb;
      if (ya != null) return -1;
      if (yb != null) return 1;
      return 0;
    });
  }

  return { unions, unionsOf, parentUnionOf };
}

/**
 * Assign each person a generation number within their lineage.
 *
 * BFS over parent/child/spouse edges, propagating a relative depth. Spouses are
 * pulled to the same generation as their partner, which is what makes a couple
 * render on one line even when one of them married in from a family we know
 * nothing about.
 */
function assignGenerations(
  people: Person[],
  byId: Map<string, Person>,
  childrenOf: Map<string, string[]>,
  unionsOf: Map<string, string[]>,
  unions: Map<string, Union>,
) {
  const generation = new Map<string, number>();
  const lineageOf = new Map<string, string>();
  const components: string[][] = [];

  for (const seed of people) {
    if (generation.has(seed.id)) continue;

    const component: string[] = [];
    const queue: string[] = [seed.id];
    generation.set(seed.id, 0);

    while (queue.length) {
      const id = queue.shift()!;
      component.push(id);
      const g = generation.get(id)!;
      const person = byId.get(id);
      if (!person) continue;

      const visit = (other: string | undefined, gen: number) => {
        if (!other || !byId.has(other)) return;
        if (generation.has(other)) return;
        generation.set(other, gen);
        queue.push(other);
      };

      visit(person.fatherId, g - 1);
      visit(person.motherId, g - 1);
      for (const child of childrenOf.get(id) ?? []) visit(child, g + 1);
      for (const unionId of unionsOf.get(id) ?? []) {
        for (const partner of unions.get(unionId)?.partners ?? []) {
          visit(partner, g);
        }
      }
    }

    // Normalise so the oldest known generation in this family is 0.
    const min = Math.min(...component.map((id) => generation.get(id)!));
    for (const id of component) generation.set(id, generation.get(id)! - min);
    components.push(component);
  }

  return { generation, lineageOf, components };
}

function displayName(p: Person): string {
  if (p.name.display) return p.name.display;
  return [p.name.given, p.name.patronymic, p.name.surname]
    .filter(Boolean)
    .join(" ");
}

function buildLineages(
  components: string[][],
  byId: Map<string, Person>,
  generation: Map<string, number>,
  lineageOf: Map<string, string>,
  places: Map<string, Place>,
): Map<string, Lineage> {
  const lineages = new Map<string, Lineage>();

  components.forEach((memberIds, index) => {
    const members = memberIds.map((id) => byId.get(id)!).filter(Boolean);
    if (!members.length) return;

    // The apex is the earliest-generation member; ties broken by birth year and
    // then by descendant count, so the person a family actually names as its
    // founder wins over their unrecorded sibling.
    let apex = members[0];
    for (const m of members) {
      const gm = generation.get(m.id)!;
      const ga = generation.get(apex.id)!;
      if (gm < ga) apex = m;
      else if (gm === ga) {
        const ym = birthYear(m) ?? 9999;
        const ya = birthYear(apex) ?? 9999;
        if (ym < ya) apex = m;
      }
    }

    const surnames = countDistinct(members.map((m) => m.name.surname));
    const gotras = countDistinct(members.map((m) => m.gotra));
    const maths = countDistinct(members.map((m) => m.math));
    const years = members.map(birthYear).filter((y): y is number => y != null);

    // Once two families intermarry their records become one connected
    // component, and naming it after the single commonest surname is
    // misleading — the archive would show "Pai of Kushasthali" for a lineage
    // whose earliest ancestor is a Kamath. Where a second surname is
    // substantial, both are named.
    // Characterise the lineage from the people *born* into it. Spouses who
    // married in bring their own surname, gotra and mool village, and there are
    // enough of them that counting everyone can name a Chitrapur lineage after
    // a Goan village none of its own members came from.
    const born = members.filter(
      (m) => m.fatherId || m.motherId || m.id === apex.id,
    );
    const core = born.length >= 3 ? born : members;
    const surnameCounts = tally(core.map((m) => m.name.surname));
    const topSurname = surnameCounts[0]?.[0];
    const runnerUp =
      surnameCounts[1] && surnameCounts[1][1] >= surnameCounts[0][1] * 0.3
        ? surnameCounts[1][0]
        : undefined;
    const apexSurname = apex.name.surname;
    const named = [topSurname, runnerUp].filter(Boolean) as string[];
    if (apexSurname && !named.includes(apexSurname)) named.unshift(apexSurname);

    const mools = countDistinct(core.map((m) => m.mool));
    // Name the lineage for its apex's village, not the commonest one. Because
    // mool descends in the male line, a daughter's descendants carry their
    // father's village, so a long-lived lineage genuinely holds several — and
    // the one that identifies it is where its earliest known ancestor was from.
    const topMool = apex.mool ?? mools[0];
    const moolLabel = topMool ? places.get(topMool)?.name : undefined;
    const label = named.length
      ? moolLabel
        ? `${named.slice(0, 2).join(" & ")} of ${moolLabel}`
        : `${named.slice(0, 2).join(" & ")} family`
      : `${displayName(apex)} lineage`;

    const id = `L${String(index + 1).padStart(4, "0")}`;
    const maxGen = Math.max(...memberIds.map((m) => generation.get(m)!));

    for (const memberId of memberIds) lineageOf.set(memberId, id);

    lineages.set(id, {
      id,
      apexId: apex.id,
      label,
      memberIds,
      size: memberIds.length,
      generations: maxGen + 1,
      surnames,
      gotras,
      maths,
      mools,
      earliestYear: years.length ? Math.min(...years) : undefined,
      latestYear: years.length ? Math.max(...years) : undefined,
    });
  });

  return lineages;
}

/** Distinct values with counts, commonest first. */
function tally(values: (string | undefined)[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}

function countDistinct(values: (string | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}

/* ------------------------------------------------------------------ */
/* Statistics                                                          */
/* ------------------------------------------------------------------ */

function facet(
  people: Person[],
  pick: (p: Person) => string | undefined,
  label: (id: string) => string,
): Facet[] {
  const counts = new Map<string, number>();
  for (const p of people) {
    const key = pick(p);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: label(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function computeStats(
  people: Person[],
  unions: Map<string, Union>,
  lineages: Map<string, Lineage>,
  refs: {
    gotras: Map<string, Gotra>;
    maths: Map<string, MathRef>;
    communities: Map<string, Community>;
    kuladevatas: Map<string, Kuladevata>;
    places: Map<string, Place>;
  },
): ArchiveStats {
  const years = people.map(birthYear).filter((y): y is number => y != null);
  const lineageList = [...lineages.values()];

  const decades = new Map<number, number>();
  for (const y of years) {
    const d = Math.floor(y / 10) * 10;
    decades.set(d, (decades.get(d) ?? 0) + 1);
  }

  const countries = new Map<string, number>();
  for (const p of people) {
    const last = p.residences?.[p.residences.length - 1];
    const place = last?.id ? refs.places.get(last.id) : undefined;
    const country = place?.country;
    if (country) countries.set(country, (countries.get(country) ?? 0) + 1);
  }

  return {
    people: people.length,
    unions: unions.size,
    lineages: lineages.size,
    largestLineage: lineageList.length
      ? Math.max(...lineageList.map((l) => l.size))
      : 0,
    maxGenerations: lineageList.length
      ? Math.max(...lineageList.map((l) => l.generations))
      : 0,
    earliestYear: years.length ? Math.min(...years) : undefined,
    latestYear: years.length ? Math.max(...years) : undefined,
    living: people.filter((p) => p.status === "living").length,
    withPhoto: people.filter((p) => p.photo?.url).length,
    byCommunity: facet(
      people,
      (p) => p.community,
      (id) => refs.communities.get(id)?.name ?? id,
    ),
    byGotra: facet(people, (p) => p.gotra, (id) => refs.gotras.get(id)?.name ?? id),
    byMath: facet(people, (p) => p.math, (id) => refs.maths.get(id)?.name ?? id),
    byMool: facet(people, (p) => p.mool, (id) => refs.places.get(id)?.name ?? id),
    bySurname: facet(people, (p) => p.name.surname, (id) => id),
    byKuladevata: facet(
      people,
      (p) => p.kuladevata,
      (id) => refs.kuladevatas.get(id)?.name ?? id,
    ),
    byConfidence: facet(people, (p) => p.confidence, (id) => id),
    byBirthDecade: [...decades.entries()]
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => a.decade - b.decade),
    byCountry: [...countries.entries()]
      .map(([id, count]) => ({ id, label: id, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

function indexBy<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

function build(): Archive {
  const personList = readPeople();
  const people = new Map(personList.map((p) => [p.id, p]));

  const gotras = indexBy(readReference<Gotra>("gotras"));
  const maths = indexBy(readReference<MathRef>("maths"));
  const communities = indexBy(readReference<Community>("communities"));
  const kuladevatas = indexBy(readReference<Kuladevata>("kuladevatas"));
  const places = indexBy(readReference<Place>("places"));
  const temples = indexBy(readReference<Temple>("temples"));
  const surnameNotes = new Map(
    readReference<SurnameNote>("surnames").map((s) => [
      s.name.toLowerCase(),
      s,
    ]),
  );

  const { unions, unionsOf, parentUnionOf } = buildUnions(personList, people);

  const childrenOf = new Map<string, string[]>();
  for (const u of unions.values()) {
    for (const partner of u.partners) {
      const list = childrenOf.get(partner) ?? [];
      for (const child of u.childIds) if (!list.includes(child)) list.push(child);
      childrenOf.set(partner, list);
    }
  }

  const { generation, lineageOf, components } = assignGenerations(
    personList,
    people,
    childrenOf,
    unionsOf,
    unions,
  );

  // Largest families first — the lineage index should open on something worth
  // looking at, not on a two-person fragment.
  components.sort((a, b) => b.length - a.length);

  const lineages = buildLineages(
    components,
    people,
    generation,
    lineageOf,
    places,
  );

  const stats = computeStats(personList, unions, lineages, {
    gotras,
    maths,
    communities,
    kuladevatas,
    places,
  });

  return {
    people,
    personList,
    unions,
    unionsOf,
    parentUnionOf,
    childrenOf,
    generationOf: generation,
    lineageOf,
    lineages,
    lineageList: [...lineages.values()].sort((a, b) => b.size - a.size),
    gotras,
    maths,
    communities,
    kuladevatas,
    places,
    temples,
    templeByKuladevata: new Map(
      [...temples.values()]
        .filter((t) => t.kuladevataId)
        .map((t) => [t.kuladevataId!, t]),
    ),
    templeByMath: new Map(
      [...temples.values()].filter((t) => t.mathId).map((t) => [t.mathId!, t]),
    ),
    surnameNotes,
    stats,
    sampleOnly: personList.length > 0 && personList.every((p) => p.sample),
  };
}

let cached: Archive | null = null;
let cachedStamp = "";

/**
 * A cheap fingerprint of what is on disk: the size and mtime of every file the
 * archive is built from. Two dozen stat calls, well under a millisecond.
 */
function dataStamp(): string {
  const parts: string[] = [];
  for (const sub of ["people", "reference"]) {
    const dir = path.join(DATA_DIR, sub);
    let names: string[];
    try {
      names = fs.readdirSync(dir).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      try {
        const s = fs.statSync(path.join(dir, name));
        parts.push(`${name}:${s.size}:${s.mtimeMs}`);
      } catch {
        /* removed between readdir and stat — the next call will notice */
      }
    }
  }
  return parts.join("|");
}

export function getArchive(): Archive {
  // Development used to rebuild the whole graph on every call so that edits to
  // data/ showed up without a restart. That is the right behaviour and the
  // wrong implementation: getArchive() is called from forty places, including
  // PersonRow — once per row — so a fifty-result page reparsed two megabytes
  // of JSON fifty times and spent seconds doing it.
  //
  // Stat the files instead and rebuild only when one of them has actually
  // changed. Same freshness, none of the cost.
  if (process.env.NODE_ENV === "development") {
    const stamp = dataStamp();
    if (!cached || stamp !== cachedStamp) {
      cached = build();
      cachedStamp = stamp;
    }
    return cached;
  }

  cached ??= build();
  return cached;
}

/**
 * Drop the in-memory archive so the next read rebuilds it from disk.
 *
 * The admin tools write straight into data/people/*.json. Without this, an
 * approved correction would sit on disk unread until the process restarted,
 * and the moderator would be told the edit had saved while the site went on
 * showing the old record.
 */
export function invalidateArchive(): void {
  cached = null;
  cachedStamp = "";
}

/* ------------------------------------------------------------------ */
/* Convenience accessors used across the app                           */
/* ------------------------------------------------------------------ */

export function getPerson(id: string): Person | undefined {
  return getArchive().people.get(id);
}

export function fullName(p: Person): string {
  return displayName(p);
}

export function initials(p: Person): string {
  const given = p.name.given?.[0] ?? "";
  const sur = p.name.surname?.[0] ?? "";
  return (given + sur).toUpperCase() || "?";
}

export function lifespan(p: Person): string {
  const b = birthYear(p);
  const d = deathYear(p);
  if (b && d) return `${b}–${d}`;
  if (b && p.status === "living") return `b. ${b}`;
  if (b) return `b. ${b}`;
  if (d) return `d. ${d}`;
  return "";
}

export function childrenIdsOf(archive: Archive, id: string): string[] {
  return archive.childrenOf.get(id) ?? [];
}

export function spouseIdsOf(archive: Archive, id: string): string[] {
  const out: string[] = [];
  for (const unionId of archive.unionsOf.get(id) ?? []) {
    for (const partner of archive.unions.get(unionId)?.partners ?? []) {
      if (partner !== id) out.push(partner);
    }
  }
  return out;
}

export function siblingIdsOf(archive: Archive, id: string): string[] {
  const unionId = archive.parentUnionOf.get(id);
  if (!unionId) return [];
  return (archive.unions.get(unionId)?.childIds ?? []).filter((c) => c !== id);
}

export function parentIdsOf(archive: Archive, id: string): string[] {
  const p = archive.people.get(id);
  if (!p) return [];
  return [p.fatherId, p.motherId].filter(
    (x): x is string => !!x && archive.people.has(x),
  );
}

/** All ancestors within `depth` generations, nearest first. */
export function ancestorsOf(
  archive: Archive,
  id: string,
  depth = Infinity,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let frontier = parentIdsOf(archive, id);
  let level = 1;
  while (frontier.length && level <= depth) {
    const next: string[] = [];
    for (const p of frontier) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      next.push(...parentIdsOf(archive, p));
    }
    frontier = next;
    level++;
  }
  return out;
}

/** All descendants within `depth` generations. */
export function descendantsOf(
  archive: Archive,
  id: string,
  depth = Infinity,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let frontier = childrenIdsOf(archive, id);
  let level = 1;
  while (frontier.length && level <= depth) {
    const next: string[] = [];
    for (const c of frontier) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
      next.push(...childrenIdsOf(archive, c));
    }
    frontier = next;
    level++;
  }
  return out;
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  verified: "Documented",
  attested: "Corroborated",
  oral: "Family memory",
  unverified: "Unverified",
};

export const CONFIDENCE_NOTE: Record<Confidence, string> = {
  verified: "Backed by a document — a register, certificate, gazette or horoscope.",
  attested: "Independently confirmed by more than one family member.",
  oral: "A single oral account. Likely true in outline, loose on dates.",
  unverified: "Submitted but not yet corroborated. Treat with care.",
};
