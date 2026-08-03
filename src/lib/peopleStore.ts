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
      caption: z.string().max(300).optional(),
      credit: z.string().max(200).optional(),
      year: z.number().int().optional(),
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
