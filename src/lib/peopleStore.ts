import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getArchive, invalidateArchive } from "./archive.ts";
import type { Person } from "./types.ts";

/**
 * Writes into the archive.
 *
 * lib/archive.ts is the read path: it loads data/people/*.json once and holds
 * the graph in memory. This is the other half — the only code in the app that
 * changes what is on disk. Everything it does obeys three rules:
 *
 * 1. A record is rewritten in the file it already lives in. The files are
 *    organised by lineage and a maintainer reads them; moving a person between
 *    files because they were edited would scramble that.
 *
 * 2. Writes are atomic — temp file, then rename. A power cut in the middle of
 *    saving one correction must not take a whole lineage with it.
 *
 * 3. Deleting a person repairs every reference to them first. A dangling
 *    fatherId is worse than a missing record: the tree renderer will happily
 *    draw an edge to a person who is not there, and the lineage silently
 *    splits in two.
 *
 * Every mutation ends by invalidating the in-memory archive, so the next page
 * render reads the change back rather than serving a stale graph.
 */

const PEOPLE_DIR = path.join(process.cwd(), "data", "people");

/** Where records created through the admin land. Kept out of the sample files. */
const COMMUNITY_FILE = path.join(PEOPLE_DIR, "community.json");

interface PeopleDoc {
  [key: string]: unknown;
  people?: Person[];
}

interface LoadedFile {
  path: string;
  /** The document as it sits on disk, so sibling keys survive a rewrite. */
  doc: PeopleDoc;
  /** True when the file was a bare array rather than { people: [...] }. */
  bare: boolean;
  people: Person[];
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

function loadFiles(): LoadedFile[] {
  if (!fs.existsSync(PEOPLE_DIR)) return [];
  const out: LoadedFile[] = [];
  for (const name of fs.readdirSync(PEOPLE_DIR).sort()) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(PEOPLE_DIR, name);
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(parsed)) {
        out.push({ path: file, doc: {}, bare: true, people: parsed as Person[] });
      } else {
        out.push({
          path: file,
          doc: parsed as PeopleDoc,
          bare: false,
          people: (parsed as PeopleDoc).people ?? [],
        });
      }
    } catch {
      // A file we cannot parse is left strictly alone. Rewriting it would
      // destroy whatever a human was in the middle of fixing by hand.
    }
  }
  return out;
}

function writeFile(loaded: LoadedFile): void {
  const body = loaded.bare
    ? loaded.people
    : { ...loaded.doc, people: loaded.people };
  const json = JSON.stringify(body, null, 2) + "\n";

  fs.mkdirSync(path.dirname(loaded.path), { recursive: true });
  const tmp = `${loaded.path}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, loaded.path);
}

function locate(files: LoadedFile[], id: string) {
  for (const file of files) {
    const index = file.people.findIndex((p) => p.id === id);
    if (index !== -1) return { file, index };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

function slug(value: string): string {
  return value
    .normalize("NFKD")
    // Drop combining marks, so "Vāsudēv" and "Vasudev" mint the same stem.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ids read like `kamath-kushasthali-0001` in the seeded data — surname, place,
 * sequence. New records follow the same shape so the two are indistinguishable
 * once a maintainer is reading raw JSON, with a counter to break ties.
 */
function mintId(name: { given: string; surname?: string }, taken: Set<string>): string {
  const stem =
    [slug(name.surname ?? ""), slug(name.given)].filter(Boolean).join("-") ||
    "person";
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${stem}-${String(n).padStart(4, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now().toString(36)}`;
}

function allIds(files: LoadedFile[]): Set<string> {
  const ids = new Set<string>();
  for (const file of files) for (const p of file.people) ids.add(p.id);
  return ids;
}

/* ------------------------------------------------------------------ */
/* Input validation                                                    */
/* ------------------------------------------------------------------ */

const FuzzyDateSchema = z
  .object({
    raw: z.string().max(120).optional(),
    year: z.number().int().min(-3000).max(2200).optional(),
    month: z.number().int().min(1).max(12).optional(),
    day: z.number().int().min(1).max(31).optional(),
    qualifier: z.enum(["exact", "circa", "before", "after", "between"]).optional(),
    toYear: z.number().int().min(-3000).max(2200).optional(),
    panchanga: z.string().max(200).optional(),
  })
  .optional();

const PlaceRefSchema = z
  .object({
    id: z.string().max(120).optional(),
    label: z.string().max(160).optional(),
  })
  .optional();

/**
 * What the admin form is allowed to set.
 *
 * Deliberately narrower than the Person type: derived fields (pravara),
 * provenance the app writes itself (createdAt, updatedAt) and the `sample`
 * flag are not settable from a form. `sample` especially — it marks the
 * generated demonstration set, and a real record must never be able to claim
 * it or be mistaken for one.
 */
export const PersonInputSchema = z.object({
  name: z.object({
    given: z.string().trim().min(1, "A given name is required").max(120),
    surname: z.string().max(120).optional(),
    patronymic: z.string().max(120).optional(),
    display: z.string().max(200).optional(),
    birthName: z.string().max(200).optional(),
    aka: z.array(z.string().max(120)).max(20).optional(),
    devanagari: z.string().max(200).optional(),
    kannada: z.string().max(200).optional(),
  }),
  gender: z.enum(["M", "F", "X", "?"]),
  status: z.enum(["living", "deceased", "unknown"]).optional(),

  birth: z.object({ date: FuzzyDateSchema, place: PlaceRefSchema }).optional(),
  death: z
    .object({
      date: FuzzyDateSchema,
      place: PlaceRefSchema,
      note: z.string().max(600).optional(),
    })
    .optional(),

  gotra: z.string().max(120).optional(),
  community: z.string().max(120).optional(),
  math: z.string().max(120).optional(),
  kuladevata: z.string().max(120).optional(),
  mool: z.string().max(120).optional(),
  veda: z.string().max(120).optional(),
  sutra: z.string().max(120).optional(),

  residences: z.array(z.object({ id: z.string().max(120).optional(), label: z.string().max(160).optional() })).max(30).optional(),
  occupations: z.array(z.string().max(120)).max(20).optional(),
  bio: z.string().max(8000).optional(),
  epithet: z.string().max(300).optional(),

  fatherId: z.string().max(120).optional(),
  motherId: z.string().max(120).optional(),
  spouses: z
    .array(
      z.object({
        personId: z.string().min(1).max(120),
        status: z.enum(["married", "widowed", "separated", "unknown"]).optional(),
        date: FuzzyDateSchema,
        place: PlaceRefSchema,
      }),
    )
    .max(10)
    .optional(),
  parentage: z.enum(["biological", "adopted", "step", "unknown"]).optional(),

  photo: z
    .object({
      url: z.string().max(2000),
      thumbUrl: z.string().max(2000).optional(),
      caption: z.string().max(300).optional(),
      credit: z.string().max(200).optional(),
      year: z.number().int().optional(),
      width: z.number().int().max(20000).optional(),
      height: z.number().int().max(20000).optional(),
      bytes: z.number().int().max(50_000_000).optional(),
    })
    .optional(),

  sources: z
    .array(
      z.object({
        kind: z.enum([
          "document",
          "oral",
          "photograph",
          "book",
          "temple-record",
          "matha-record",
          "gravestone",
          "web",
          "other",
        ]),
        title: z.string().min(1).max(300),
        detail: z.string().max(1000).optional(),
        url: z.string().max(2000).optional(),
        heldBy: z.string().max(200).optional(),
        year: z.number().int().optional(),
      }),
    )
    .max(20)
    .optional(),

  confidence: z.enum(["verified", "attested", "oral", "unverified"]),
  contributedBy: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
});

export type PersonInput = z.infer<typeof PersonInputSchema>;

/**
 * Strip empty strings, empty arrays and empty objects.
 *
 * A form posts `""` for every field the moderator left blank. Written through
 * unfiltered those become `"gotra": ""`, which reads as "we recorded that this
 * family has no gotra" rather than "nobody has told us yet" — the distinction
 * the whole archive turns on. Absent means unknown; present means claimed.
 */
function prune<T>(value: T): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return (trimmed === "" ? undefined : trimmed) as T | undefined;
  }
  if (Array.isArray(value)) {
    const items = value.map(prune).filter((v) => v !== undefined);
    return (items.length ? items : undefined) as T | undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = prune(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return (Object.keys(out).length ? (out as T) : undefined) as T | undefined;
  }
  if (typeof value === "number" && Number.isNaN(value)) return undefined;
  return value;
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);

export function createPerson(input: PersonInput, by = "Archive maintainer"): Person {
  const files = loadFiles();
  const taken = allIds(files);

  const cleaned = (prune(input) ?? {}) as PersonInput;
  const person: Person = {
    ...cleaned,
    id: mintId(input.name, taken),
    name: {
      ...cleaned.name,
      display:
        cleaned.name?.display ??
        [input.name.given, input.name.surname].filter(Boolean).join(" "),
    },
    confidence: input.confidence,
    gender: input.gender,
    contributedBy: cleaned.contributedBy ?? by,
    createdAt: today(),
    updatedAt: today(),
  };

  const target =
    files.find((f) => f.path === COMMUNITY_FILE) ??
    ({
      path: COMMUNITY_FILE,
      bare: false,
      people: [],
      doc: {
        _note:
          "Records entered directly by archive maintainers, as opposed to the generated sample lineages.",
      },
    } satisfies LoadedFile);

  target.people.push(person);
  writeFile(target);
  invalidateArchive();
  return person;
}

/**
 * Write a whole family in one pass.
 *
 * Calling createPerson in a loop would be wrong twice over. It reloads and
 * rewrites the file on every person, so a forty-person branch is forty reads
 * and forty renames — but worse, it cannot express the thing a family draft is
 * for: the records refer to each other, and none of them has an id until it is
 * written. So ids are minted for every row up front against one snapshot of
 * what is taken, the relationship fields are rewritten from draft keys to
 * those ids, and the whole set lands in a single write.
 *
 * `link` is the second half. A draft usually hangs off somebody already in the
 * archive, and while a *child* pointing at an existing father needs nothing
 * from that father, a *marriage* does — the spouse link has to appear on both
 * records or the union renders once and the couple looks unmarried from one
 * side. Those existing records are patched here, in the same pass.
 */
export interface FamilyMember {
  /** The draft-local key this row came from. */
  key: string;
  /** An archive record this row *is*, rather than one to be created. */
  existingId?: string;
  input: PersonInput;
  fatherRef?: string;
  motherRef?: string;
  spouseRefs?: { ref: string; year?: number; status?: string }[];
}

export interface FamilyWriteResult {
  /** draft key -> archive id, for every row. */
  ids: Record<string, string>;
  created: string[];
  /** Existing records that gained a spouse link. */
  updated: string[];
}

export function createFamily(
  members: FamilyMember[],
  by = "Archive maintainer",
): FamilyWriteResult {
  const files = loadFiles();
  const taken = allIds(files);
  const stamp = today();

  // 1. Give every row an id. Existing rows keep theirs; new ones are minted
  //    against a set that grows as we go, so two brothers with identical
  //    names cannot collide.
  const ids: Record<string, string> = {};
  for (const m of members) {
    if (m.existingId) {
      ids[m.key] = m.existingId;
      continue;
    }
    const id = mintId(m.input.name, taken);
    taken.add(id);
    ids[m.key] = id;
  }

  /** A relationship target: a draft key if it names one, else an archive id. */
  const resolve = (ref: string | undefined) =>
    ref ? (ids[ref] ?? (taken.has(ref) ? ref : undefined)) : undefined;

  const created: string[] = [];
  const updated = new Set<string>();
  const touched = new Set<LoadedFile>();

  const target =
    files.find((f) => f.path === COMMUNITY_FILE) ??
    ({
      path: COMMUNITY_FILE,
      bare: false,
      people: [],
      doc: {
        _note:
          "Records entered directly by archive maintainers, as opposed to the generated sample lineages.",
      },
    } satisfies LoadedFile);

  // 2. Build the records, with relationships now pointing at real ids.
  for (const m of members) {
    const id = ids[m.key];
    const spouses = (m.spouseRefs ?? [])
      .map((s) => {
        const personId = resolve(s.ref);
        return personId && personId !== id
          ? {
              personId,
              status: (s.status ?? "married") as NonNullable<
                Person["spouses"]
              >[number]["status"],
              date: s.year ? { year: s.year } : undefined,
            }
          : null;
      })
      .filter((s): s is NonNullable<typeof s> => !!s);

    const fatherId = resolve(m.fatherRef);
    const motherId = resolve(m.motherRef);

    if (m.existingId) {
      // An existing record is not rebuilt from the draft — the draft knows
      // less about them than the archive already does. Only the links the
      // draft adds are merged in.
      const found = locate(files, m.existingId);
      if (!found) continue;
      const existing = found.file.people[found.index];
      const merged: Person = { ...existing };
      let changed = false;

      if (fatherId && fatherId !== existing.fatherId && fatherId !== existing.id) {
        merged.fatherId = fatherId;
        changed = true;
      }
      if (motherId && motherId !== existing.motherId && motherId !== existing.id) {
        merged.motherId = motherId;
        changed = true;
      }
      const fresh = spouses.filter(
        (s) => !existing.spouses?.some((e) => e.personId === s.personId),
      );
      if (fresh.length) {
        merged.spouses = [...(existing.spouses ?? []), ...fresh];
        changed = true;
      }
      if (changed) {
        merged.updatedAt = stamp;
        found.file.people[found.index] = merged;
        touched.add(found.file);
        updated.add(m.existingId);
      }
      continue;
    }

    const cleaned = (prune(m.input) ?? {}) as PersonInput;
    const person: Person = {
      ...cleaned,
      id,
      name: {
        ...cleaned.name,
        display:
          cleaned.name?.display ??
          [m.input.name.given, m.input.name.surname].filter(Boolean).join(" "),
      },
      gender: m.input.gender,
      confidence: m.input.confidence,
      contributedBy: cleaned.contributedBy ?? by,
      createdAt: stamp,
      updatedAt: stamp,
    };

    if (fatherId) person.fatherId = fatherId;
    else delete person.fatherId;
    if (motherId) person.motherId = motherId;
    else delete person.motherId;
    if (spouses.length) person.spouses = spouses;
    else delete person.spouses;

    target.people.push(person);
    created.push(id);
  }

  // 3. A marriage stated on one side has to exist on the other, or the couple
  //    reads as married from one record and single from the other.
  const createdSet = new Set(created);
  // The target file is not necessarily in `files` — it is newly minted the
  // first time a maintainer saves anything — so a partner living in it has to
  // be found here rather than through locate().
  const inTarget = new Map(target.people.map((p) => [p.id, p]));

  for (const m of members) {
    const id = ids[m.key];
    for (const s of m.spouseRefs ?? []) {
      const partnerId = resolve(s.ref);
      if (!partnerId || partnerId === id) continue;

      const link = {
        personId: id,
        status: (s.status ?? "married") as NonNullable<
          Person["spouses"]
        >[number]["status"],
        date: s.year ? { year: s.year } : undefined,
      };

      const local = inTarget.get(partnerId);
      if (local) {
        if (local.spouses?.some((x) => x.personId === id)) continue;
        local.spouses = [...(local.spouses ?? []), link];
        touched.add(target);
        // Only worth reporting when it was already published — a link between
        // two people created by this same draft is not an edit to anything.
        if (!createdSet.has(partnerId)) {
          local.updatedAt = stamp;
          updated.add(partnerId);
        }
        continue;
      }

      const found = locate(files, partnerId);
      if (!found) continue;
      const existing = found.file.people[found.index];
      if (existing.spouses?.some((x) => x.personId === id)) continue;
      found.file.people[found.index] = {
        ...existing,
        spouses: [...(existing.spouses ?? []), link],
        updatedAt: stamp,
      };
      touched.add(found.file);
      updated.add(partnerId);
    }
  }

  if (created.length) touched.add(target);
  for (const file of touched) writeFile(file);
  invalidateArchive();

  return { ids, created, updated: [...updated] };
}

export function updatePerson(id: string, input: PersonInput): Person | null {
  const files = loadFiles();
  const found = locate(files, id);
  if (!found) return null;

  const existing = found.file.people[found.index];
  const cleaned = (prune(input) ?? {}) as PersonInput;

  // Rebuilt rather than merged. A blank field in the form has to be able to
  // clear a value — merging would make every edit additive and leave no way to
  // retract a wrong gotra once it had been saved. The fields the form does not
  // own are carried across explicitly, below.
  const updated: Person = {
    ...cleaned,
    id: existing.id,
    gender: input.gender,
    confidence: input.confidence,
    name: {
      ...cleaned.name,
      display:
        cleaned.name?.display ??
        [input.name.given, input.name.surname].filter(Boolean).join(" "),
    },
    media: existing.media,
    pravara: existing.pravara,
    sample: existing.sample,
    createdAt: existing.createdAt ?? today(),
    updatedAt: today(),
  };

  found.file.people[found.index] = updated;
  writeFile(found.file);
  invalidateArchive();
  return updated;
}

/**
 * Record a death without opening the full editor.
 *
 * This is the single most common edit an archive of living people receives,
 * and it is the one most likely to arrive as a phone call rather than a form.
 * It deserves to be one action.
 */
export function markDeceased(
  id: string,
  death: { year?: number; raw?: string; placeLabel?: string; note?: string } = {},
): Person | null {
  const files = loadFiles();
  const found = locate(files, id);
  if (!found) return null;

  const existing = found.file.people[found.index];
  const date = prune({
    ...existing.death?.date,
    year: death.year ?? existing.death?.date?.year,
    raw: death.raw ?? existing.death?.date?.raw,
  });

  const updated: Person = {
    ...existing,
    status: "deceased",
    updatedAt: today(),
  };

  // A death with nothing known about it is still worth recording — the status
  // carries the fact on its own — so an empty detail block is dropped rather
  // than written as `"death": {}`.
  const detail = prune({
    ...existing.death,
    date,
    place: death.placeLabel ? { label: death.placeLabel } : existing.death?.place,
    note: death.note ?? existing.death?.note,
  });
  if (detail) updated.death = detail;
  else delete updated.death;

  found.file.people[found.index] = updated;
  writeFile(found.file);
  invalidateArchive();
  return updated;
}

/** Undo of the above, for the case where the wrong row was clicked. */
export function markLiving(id: string): Person | null {
  const files = loadFiles();
  const found = locate(files, id);
  if (!found) return null;

  const existing = found.file.people[found.index];
  const updated: Person = { ...existing, status: "living", updatedAt: today() };
  delete updated.death;

  found.file.people[found.index] = updated;
  writeFile(found.file);
  invalidateArchive();
  return updated;
}

export interface DeletionImpact {
  id: string;
  name: string;
  /** People whose parent link points at this record. */
  children: { id: string; name: string }[];
  /** People married to this record. */
  spouses: { id: string; name: string }[];
}

/**
 * What removing a record would break, so the moderator is told before they
 * click and not after. Deleting a person mid-tree is the one admin action
 * with consequences that reach beyond the row being acted on.
 */
export function deletionImpact(id: string): DeletionImpact | null {
  const archive = getArchive();
  const person = archive.people.get(id);
  if (!person) return null;

  const label = (p: Person) => p.name.display ?? [p.name.given, p.name.surname].filter(Boolean).join(" ");
  const children: { id: string; name: string }[] = [];
  const spouses: { id: string; name: string }[] = [];

  for (const other of archive.personList) {
    if (other.id === id) continue;
    if (other.fatherId === id || other.motherId === id) {
      children.push({ id: other.id, name: label(other) });
    }
    if (other.spouses?.some((s) => s.personId === id)) {
      spouses.push({ id: other.id, name: label(other) });
    }
  }

  return { id, name: label(person), children, spouses };
}

export interface DeletionResult {
  deleted: Person;
  /** Ids whose parent or spouse links were repaired as a consequence. */
  detached: string[];
}

export function deletePerson(id: string): DeletionResult | null {
  const files = loadFiles();
  const found = locate(files, id);
  if (!found) return null;

  const [deleted] = found.file.people.splice(found.index, 1);

  // Repair before the record goes, across every file — a child of this person
  // very often lives in a different one.
  const detached = new Set<string>();
  const touched = new Set<LoadedFile>([found.file]);

  for (const file of files) {
    for (let i = 0; i < file.people.length; i++) {
      const p = file.people[i];
      let changed = false;
      const next: Person = { ...p };

      if (next.fatherId === id) {
        delete next.fatherId;
        changed = true;
      }
      if (next.motherId === id) {
        delete next.motherId;
        changed = true;
      }
      if (next.spouses?.some((s) => s.personId === id)) {
        const kept = next.spouses.filter((s) => s.personId !== id);
        if (kept.length) next.spouses = kept;
        else delete next.spouses;
        changed = true;
      }

      if (changed) {
        next.updatedAt = today();
        file.people[i] = next;
        detached.add(next.id);
        touched.add(file);
      }
    }
  }

  for (const file of touched) writeFile(file);
  invalidateArchive();
  return { deleted, detached: [...detached] };
}

/** Read a record straight from disk, bypassing the cached graph. */
export function readPersonRaw(id: string): Person | null {
  const found = locate(loadFiles(), id);
  return found ? found.file.people[found.index] : null;
}

/* ------------------------------------------------------------------ */
/* Reference values across every record                                */
/* ------------------------------------------------------------------ */

/** Which person fields draw on which vocabulary. */
const VOCABULARY_FIELDS = {
  gotras: ["gotra"],
  maths: ["math"],
  communities: ["community"],
  kuladevatas: ["kuladevata"],
  places: ["mool"],
} as const;

export type RetargetVocabulary = keyof typeof VOCABULARY_FIELDS;

/**
 * Point every record that uses one reference id at another, or at nothing.
 *
 * This is what makes a vocabulary decision reversible. A maintainer looking at
 * a pending "Bhardwaj" that should have been "Bharadwaja" needs the four
 * records already carrying it to move too, or approving the merge would leave
 * those four pointing at an id that no longer exists — a record whose gotra
 * silently stops resolving, which is exactly the rot the controlled
 * vocabulary is there to prevent.
 *
 * Passing `null` for `toId` clears the field instead, for a value that was
 * simply wrong.
 */
export function retargetRef(
  vocabulary: RetargetVocabulary,
  fromId: string,
  toId: string | null,
): { changed: string[] } {
  const files = loadFiles();
  const changed: string[] = [];
  const touched = new Set<LoadedFile>();
  const stamp = today();

  for (const file of files) {
    file.people.forEach((person, index) => {
      let hit = false;
      const next: Person = { ...person };

      for (const field of VOCABULARY_FIELDS[vocabulary]) {
        if (person[field] === fromId) {
          const replacement = toId ?? undefined;
          if (replacement === undefined) delete next[field];
          else next[field] = replacement;
          hit = true;
        }
      }

      // Places are also named from inside birth, death, residences and the
      // place a marriage was held, so a place merge has to reach all of them.
      if (vocabulary === "places") {
        if (person.birth?.place?.id === fromId) {
          next.birth = { ...person.birth, place: placeAfter(person.birth.place, toId) };
          hit = true;
        }
        if (person.death?.place?.id === fromId) {
          next.death = { ...person.death, place: placeAfter(person.death.place, toId) };
          hit = true;
        }
        if (person.residences?.some((r) => r.id === fromId)) {
          next.residences = person.residences
            .map((r) => (r.id === fromId ? placeAfter(r, toId) : r))
            .filter((r): r is NonNullable<typeof r> => !!r);
          hit = true;
        }
        if (person.spouses?.some((s) => s.place?.id === fromId)) {
          next.spouses = person.spouses.map((s) =>
            s.place?.id === fromId ? { ...s, place: placeAfter(s.place, toId) } : s,
          );
          hit = true;
        }
      }

      if (!hit) return;
      next.updatedAt = stamp;
      file.people[index] = next;
      changed.push(person.id);
      touched.add(file);
    });
  }

  for (const file of touched) writeFile(file);
  if (touched.size) invalidateArchive();
  return { changed };
}

/**
 * What a place reference becomes when its entry is merged away. Keeping the
 * label when there is nowhere to point means a village the archive no longer
 * has an entry for still reads as a village rather than vanishing.
 */
function placeAfter(
  ref: { id?: string; label?: string } | undefined,
  toId: string | null,
) {
  if (!ref) return ref;
  if (toId) return { ...ref, id: toId };
  const label = ref.label;
  return label ? { label } : undefined;
}
