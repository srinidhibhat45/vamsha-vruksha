import { getArchive } from "./archive.ts";
import {
  PersonInputSchema,
  createPerson,
  readPersonRaw,
  updatePerson,
  type PersonInput,
} from "./peopleStore.ts";
import type { Person, Submission } from "./types.ts";

/**
 * Turning a submission into a record.
 *
 * The contribute form and the archive do not share a shape, and they should
 * not. A contributor writes "born 1897 at Keloshi, father was Vasudev"; the
 * archive stores a FuzzyDate, a PlaceRef and an id. This module is the seam
 * between the two vocabularies.
 *
 * It is deliberately conservative about corrections. A correction carries only
 * the fields the contributor actually filled in, so applying it must leave
 * every other field of the existing record untouched — someone fixing a death
 * year must not silently blank out a gotra by not retyping it. That is the
 * opposite of the rule in the editor, where a cleared field means "retract
 * this", and the difference is the whole reason the two paths are separate.
 */

function str(payload: Record<string, unknown>, key: string): string | undefined {
  const v = payload[key];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed === "" ? undefined : trimmed;
}

function num(payload: Record<string, unknown>, key: string): number | undefined {
  const v = payload[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function strList(payload: Record<string, unknown>, key: string): string[] | undefined {
  const v = payload[key];
  if (!Array.isArray(v)) return undefined;
  const items = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return items.length ? items.map((s) => s.trim()) : undefined;
}

/**
 * A place arrives as either a reference id chosen from the dropdown or a name
 * typed by hand. Checking it against the vocabulary is what keeps "Keloshi"
 * and "Quelossim" — the same village under two administrations — from
 * becoming two entries in the directory.
 */
function place(value: string | undefined) {
  if (!value) return undefined;
  return getArchive().places.has(value) ? { id: value } : { label: value };
}

function enumOr<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/** The subset of a Person a submission payload can describe. */
export function payloadToPersonInput(
  payload: Record<string, unknown>,
): Partial<PersonInput> {
  const birthYear = num(payload, "birthYear");
  const birthNote = str(payload, "birthNote");
  const deathYear = num(payload, "deathYear");

  const birthDate =
    birthYear || birthNote
      ? {
          year: birthYear,
          raw: birthNote,
          // "c. 1890" in the note is the contributor telling us the year is an
          // estimate. Recording it as exact would launder a guess into a fact.
          qualifier: /\bc\.?\s|circa|approx|about|around/i.test(birthNote ?? "")
            ? ("circa" as const)
            : undefined,
        }
      : undefined;

  const spouseId = str(payload, "spouseId");
  const marriageYear = num(payload, "marriageYear");

  const sources = Array.isArray(payload.sources)
    ? (payload.sources as Record<string, unknown>[])
        .filter((s) => typeof s?.title === "string" && s.title.trim() !== "")
        .map((s) => ({
          kind:
            enumOr(typeof s.kind === "string" ? s.kind : undefined, [
              "document",
              "oral",
              "photograph",
              "book",
              "temple-record",
              "matha-record",
              "gravestone",
              "web",
              "other",
            ] as const) ?? ("other" as const),
          title: String(s.title).trim(),
          detail: typeof s.detail === "string" ? s.detail : undefined,
          url: typeof s.url === "string" ? s.url : undefined,
          heldBy: typeof s.heldBy === "string" ? s.heldBy : undefined,
        }))
    : undefined;

  const input: Partial<PersonInput> = {
    name: {
      // Left undefined rather than "" when the contributor did not supply
      // one — a correction submission legitimately omits it (the target is
      // already named). "" would still be a defined value to the `defined()`
      // filter below and would blank out the existing person's name on
      // every correction that does not retype it. A genuinely new person
      // with no name at all is still caught, because PersonInputSchema
      // requires `given` and treats a missing key the same as an empty one.
      given: (str(payload, "given") ?? str(payload, "displayName")) as string,
      surname: str(payload, "surname"),
      patronymic: str(payload, "patronymic"),
      display: str(payload, "displayName"),
      devanagari: str(payload, "devanagari"),
      aka: strList(payload, "aka"),
    },
    gender: enumOr(str(payload, "gender"), ["M", "F", "X", "?"] as const) ?? "?",
    status: enumOr(str(payload, "status"), [
      "living",
      "deceased",
      "unknown",
    ] as const),

    birth:
      birthDate || str(payload, "birthPlace")
        ? { date: birthDate, place: place(str(payload, "birthPlace")) }
        : undefined,
    death:
      deathYear || str(payload, "deathPlace")
        ? {
            date: deathYear ? { year: deathYear } : undefined,
            place: place(str(payload, "deathPlace")),
          }
        : undefined,

    gotra: str(payload, "gotra"),
    community: str(payload, "community"),
    math: str(payload, "math"),
    kuladevata: str(payload, "kuladevata"),
    mool: str(payload, "mool"),
    veda: str(payload, "veda"),
    sutra: str(payload, "sutra"),

    residences: strList(payload, "residences")
      ?.map((r) => place(r))
      .filter((r): r is NonNullable<typeof r> => !!r),
    occupations: strList(payload, "occupations"),
    epithet: str(payload, "epithet"),
    bio: str(payload, "bio"),

    fatherId: str(payload, "fatherId"),
    motherId: str(payload, "motherId"),
    spouses: spouseId
      ? [
          {
            personId: spouseId,
            status: "married" as const,
            date: marriageYear ? { year: marriageYear } : undefined,
          },
        ]
      : undefined,

    sources,
    confidence:
      enumOr(str(payload, "confidence"), [
        "verified",
        "attested",
        "oral",
        "unverified",
      ] as const) ?? "unverified",
  };

  return input;
}

/** Drop undefined keys so a spread merge does not overwrite with nothing. */
function defined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export type PublishResult =
  | { ok: true; person: Person; created: boolean }
  | { ok: false; error: string };

/**
 * Write an approved submission into the archive.
 *
 * A new-person submission creates a record. Anything with a target — a
 * correction, an added relationship, a story, a photograph — is layered onto
 * the record it names, keeping whatever the submission did not mention.
 */
export function publishSubmission(submission: Submission): PublishResult {
  const draft = payloadToPersonInput(submission.payload);
  const credit = submission.submitter.name || "Community archive";

  if (submission.targetId) {
    const existing = readPersonRaw(submission.targetId);
    if (!existing) {
      return { ok: false, error: "The record this refers to no longer exists" };
    }

    // Start from what is on disk, layer on only what the contributor supplied.
    const merged = {
      ...existing,
      ...defined(draft),
      name: { ...existing.name, ...defined(draft.name ?? {}) },
      birth: draft.birth
        ? { ...existing.birth, ...defined(draft.birth) }
        : existing.birth,
      death: draft.death
        ? { ...existing.death, ...defined(draft.death) }
        : existing.death,
      // Stories and sources accumulate; a second account of a life does not
      // replace the first one.
      sources: [...(existing.sources ?? []), ...(draft.sources ?? [])],
      spouses: draft.spouses
        ? [
            ...(existing.spouses ?? []).filter(
              (s) => !draft.spouses?.some((d) => d.personId === s.personId),
            ),
            ...draft.spouses,
          ]
        : existing.spouses,
      confidence: draft.confidence ?? existing.confidence,
      gender: draft.gender ?? existing.gender,
    };

    const parsed = PersonInputSchema.safeParse(merged);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error.issues) };
    }

    const person = updatePerson(submission.targetId, parsed.data);
    return person
      ? { ok: true, person, created: false }
      : { ok: false, error: "Could not write the record" };
  }

  const parsed = PersonInputSchema.safeParse({
    ...draft,
    contributedBy: credit,
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error.issues) };
  }

  return { ok: true, person: createPerson(parsed.data, credit), created: true };
}

function firstIssue(issues: { path: (string | number)[]; message: string }[]) {
  const issue = issues[0];
  if (!issue) return "The submission could not be turned into a record";
  const where = issue.path.join(".");
  return where ? `${where}: ${issue.message}` : issue.message;
}
