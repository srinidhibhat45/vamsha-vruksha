import { z } from "zod";
import type { DraftPerson, FamilyDraft } from "./types.ts";
import type { TreePerson, TreeSource } from "./layout.ts";

/**
 * Whole-family drafts.
 *
 * Entering people one at a time is the wrong unit of work for the commonest
 * real contribution, which is not "here is my grandfather" but "here are my
 * grandparents, their six children, who each of them married, and where the
 * ones who left went". Sent one form at a time that is thirty submissions,
 * each of which has to wait for the one before it to be published before it
 * can name a parent — and a moderator reviewing number nineteen has no way to
 * see the shape of what is being described.
 *
 * A draft is that whole branch as one object. Relationships inside it point at
 * draft-local keys, so nothing depends on publication order, and the reviewer
 * sees the family drawn rather than a stack of unrelated names.
 *
 * This module owns three things: the shape a draft has to have, the checks
 * that a draft is internally coherent, and the conversion into the same
 * TreeSource the real tree viewer runs on — so the preview a contributor
 * builds against is drawn by exactly the code that will draw it afterwards,
 * rather than by a second layout engine that drifts.
 */

/** A draft bigger than this is a GEDCOM import, not a form submission. */
export const MAX_DRAFT_PEOPLE = 60;

const trimmed = (max: number) => z.string().trim().max(max);

export const DraftPersonSchema = z.object({
  key: trimmed(40).min(1),
  existingId: trimmed(120).optional(),

  given: trimmed(120),
  patronymic: trimmed(120).optional(),
  surname: trimmed(120).optional(),
  devanagari: trimmed(200).optional(),
  aka: z.array(trimmed(120)).max(20).optional(),
  gender: z.enum(["M", "F", "X", "?"]).optional(),
  status: z.enum(["living", "deceased", "unknown"]).optional(),

  birthYear: z.number().int().min(-3000).max(2200).optional(),
  birthNote: trimmed(200).optional(),
  birthPlace: trimmed(160).optional(),
  deathYear: z.number().int().min(-3000).max(2200).optional(),
  deathPlace: trimmed(160).optional(),

  gotra: trimmed(120).optional(),
  community: trimmed(120).optional(),
  math: trimmed(120).optional(),
  kuladevata: trimmed(120).optional(),
  mool: trimmed(120).optional(),
  veda: trimmed(120).optional(),
  sutra: trimmed(120).optional(),

  occupations: z.array(trimmed(120)).max(20).optional(),
  residences: z.array(trimmed(160)).max(30).optional(),
  epithet: trimmed(300).optional(),
  bio: trimmed(8000).optional(),
  photo: z
    .object({
      url: trimmed(2000),
      thumbUrl: trimmed(2000).optional(),
      caption: trimmed(300).optional(),
      credit: trimmed(200).optional(),
      year: z.number().int().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
      bytes: z.number().int().optional(),
    })
    .optional(),

  fatherKey: trimmed(120).optional(),
  motherKey: trimmed(120).optional(),
  spouseKeys: z
    .array(
      z.object({
        key: trimmed(120).min(1),
        year: z.number().int().min(-3000).max(2200).optional(),
      }),
    )
    .max(10)
    .optional(),

  confidence: z.enum(["verified", "attested", "oral", "unverified"]).optional(),
});

export const FamilyDraftSchema = z.object({
  people: z
    .array(DraftPersonSchema)
    .min(1, "A family needs at least one person")
    .max(MAX_DRAFT_PEOPLE, `A draft can hold at most ${MAX_DRAFT_PEOPLE} people`),
  note: trimmed(4000).optional(),
  /**
   * Sources for the branch as a whole, copied onto every person it creates.
   *
   * Per-person sources would be more precise and would not get filled in.
   * Family provenance genuinely is collective — "all of this is out of my
   * grandmother's notebook", "the four eldest are off the Kashi Math register
   * and the rest is what my uncle remembers" — and recording that once against
   * thirty people is both true and achievable. A record with no provenance at
   * all is the outcome this is competing against.
   */
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
        title: trimmed(300).min(1),
        detail: trimmed(1000).optional(),
      }),
    )
    .max(20)
    .optional(),
});

/* ------------------------------------------------------------------ */
/* Coherence                                                           */
/* ------------------------------------------------------------------ */

export interface DraftProblem {
  /** The draft key the problem belongs to, where there is one. */
  key?: string;
  message: string;
  severity: "error" | "warning";
}

/**
 * Whether a draft describes something possible.
 *
 * Errors block publication; warnings are shown to the contributor and to the
 * reviewer and then got on with. The split matters because real families
 * produce records that look wrong and are not — a mother of nineteen at her
 * first child, a marriage recorded a year after a death because the date came
 * off a different calendar. Refusing those loses true information; saying
 * nothing lets a typo through. So: contradictions are errors, improbabilities
 * are warnings.
 */
export function checkDraft(
  draft: FamilyDraft,
  /** Ids that exist in the archive, so `existingId` can be verified. */
  knownIds?: (id: string) => boolean,
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const byKey = new Map<string, DraftPerson>();

  for (const p of draft.people) {
    if (byKey.has(p.key)) {
      problems.push({
        key: p.key,
        severity: "error",
        message: `Two people in this draft share the internal key "${p.key}"`,
      });
    }
    byKey.set(p.key, p);
  }

  /** A relationship target is either another draft row or an archive record. */
  const resolves = (ref: string) =>
    byKey.has(ref) || (knownIds ? knownIds(ref) : true);

  const seenExisting = new Map<string, string>();

  for (const p of draft.people) {
    const label = displayOf(p) || p.key;

    if (!p.given?.trim()) {
      problems.push({
        key: p.key,
        severity: "error",
        message: "Everyone needs at least a given name",
      });
    }

    if (p.existingId) {
      if (knownIds && !knownIds(p.existingId)) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${label} is marked as an existing record (${p.existingId}) that is not in the archive`,
        });
      }
      const clash = seenExisting.get(p.existingId);
      if (clash) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${label} and ${clash} both point at the same existing record`,
        });
      } else {
        seenExisting.set(p.existingId, label);
      }
    }

    for (const [field, ref] of [
      ["Father", p.fatherKey],
      ["Mother", p.motherKey],
    ] as const) {
      if (!ref) continue;
      if (ref === p.key) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${label} is listed as their own ${field.toLowerCase()}`,
        });
      } else if (!resolves(ref)) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${field} of ${label} points at nobody`,
        });
      }
    }

    for (const s of p.spouseKeys ?? []) {
      if (s.key === p.key) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${label} is listed as married to themselves`,
        });
      } else if (!resolves(s.key)) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `A marriage of ${label} points at nobody`,
        });
      }
    }

    if (p.birthYear && p.deathYear && p.deathYear < p.birthYear) {
      problems.push({
        key: p.key,
        severity: "error",
        message: `${label} is recorded as dying before being born`,
      });
    }

    for (const [role, ref] of [
      ["father", p.fatherKey],
      ["mother", p.motherKey],
    ] as const) {
      const parent = ref ? byKey.get(ref) : undefined;
      if (!parent?.birthYear || !p.birthYear) continue;
      const gap = p.birthYear - parent.birthYear;
      if (gap <= 0) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${label} is born before their ${role}, ${displayOf(parent)}`,
        });
      } else if (gap < 14) {
        problems.push({
          key: p.key,
          severity: "warning",
          message: `${displayOf(parent)} would have been ${gap} at ${label}'s birth`,
        });
      } else if (gap > 65) {
        problems.push({
          key: p.key,
          severity: "warning",
          message: `${displayOf(parent)} would have been ${gap} at ${label}'s birth`,
        });
      }
    }
  }

  // A cycle in the parent links is the one error that silently destroys a
  // tree: the layout recursion never terminates, and no single record looks
  // wrong when you read it.
  const state = new Map<string, 0 | 1 | 2>();
  const walk = (key: string): boolean => {
    const mark = state.get(key);
    if (mark === 1) return true;
    if (mark === 2) return false;
    state.set(key, 1);
    const p = byKey.get(key);
    for (const ref of [p?.fatherKey, p?.motherKey]) {
      if (ref && byKey.has(ref) && walk(ref)) return true;
    }
    state.set(key, 2);
    return false;
  };
  for (const p of draft.people) {
    if (walk(p.key)) {
      problems.push({
        key: p.key,
        severity: "error",
        message: `${displayOf(p) || p.key} ends up as their own ancestor`,
      });
      break;
    }
  }

  return problems;
}

export function displayOf(p: DraftPerson): string {
  return [p.given, p.patronymic, p.surname].filter(Boolean).join(" ").trim();
}

/**
 * Draft rows in an order where every parent precedes its children.
 *
 * Publication needs it: a child's record carries its father's id, so the
 * father has to have been minted one first. Rows whose parents are outside the
 * draft — the common case of hanging a new branch off somebody already in the
 * archive — sort to the front, and a cycle (already reported as an error)
 * degrades to the original order rather than looping.
 */
export function topoOrder(people: DraftPerson[]): DraftPerson[] {
  const byKey = new Map(people.map((p) => [p.key, p]));
  const out: DraftPerson[] = [];
  const state = new Map<string, 0 | 1 | 2>();

  const visit = (p: DraftPerson) => {
    if (state.get(p.key)) return;
    state.set(p.key, 1);
    for (const ref of [p.fatherKey, p.motherKey]) {
      const parent = ref ? byKey.get(ref) : undefined;
      if (parent && state.get(parent.key) !== 1) visit(parent);
    }
    state.set(p.key, 2);
    out.push(p);
  };

  for (const p of people) visit(p);
  return out;
}

/* ------------------------------------------------------------------ */
/* Preview                                                             */
/* ------------------------------------------------------------------ */

/**
 * Turn a draft into the payload the real tree renderer takes.
 *
 * Unions are derived here exactly as archive.ts derives them for published
 * records — an explicit marriage first, then a synthetic union for any couple
 * who share a child — because a preview that groups children differently from
 * the finished tree teaches the contributor the wrong thing about what they
 * are building.
 */
export function draftToTreeSource(
  draft: FamilyDraft,
  /** Labels for reference ids, so the preview cards read in words. */
  label?: (kind: "gotra" | "mool" | "kuladevata", id: string) => string | undefined,
): TreeSource {
  const people: Record<string, TreePerson> = {};
  const unions: TreeSource["unions"] = {};
  const childUnion: Record<string, string> = {};
  const personUnions: Record<string, string[]> = {};
  const parents: Record<string, string[]> = {};

  const present = new Set(draft.people.map((p) => p.key));
  const inDraft = (ref: string | undefined): ref is string =>
    !!ref && present.has(ref);

  for (const p of draft.people) {
    people[p.key] = {
      id: p.key,
      name: displayOf(p) || "Unnamed",
      given: p.given,
      surname: p.surname,
      gender: p.gender ?? "?",
      birthYear: p.birthYear,
      deathYear: p.deathYear,
      living: p.status === "living",
      epithet: p.epithet,
      gotra: p.gotra,
      gotraLabel: p.gotra ? label?.("gotra", p.gotra) : undefined,
      math: p.math,
      mool: p.mool,
      moolLabel: p.mool ? label?.("mool", p.mool) : undefined,
      kuladevata: p.kuladevata,
      kuladevataLabel: p.kuladevata
        ? label?.("kuladevata", p.kuladevata)
        : undefined,
      photo: p.photo?.thumbUrl ?? p.photo?.url,
      confidence: p.confidence,
      childCount: 0,
    };

    const ps = [p.fatherKey, p.motherKey].filter(inDraft);
    if (ps.length) parents[p.key] = ps;
  }

  const unionIdFor = (partners: string[]) =>
    "u:" + [...partners].sort().join("+");

  const register = (id: string, partners: string[]) => {
    if (!unions[id]) unions[id] = { id, partners: [...partners].sort(), childIds: [] };
    for (const partner of partners) {
      const list = (personUnions[partner] ??= []);
      if (!list.includes(id)) list.push(id);
    }
    return unions[id];
  };

  // Pass 1 — marriages the contributor stated, which carry a year.
  for (const p of draft.people) {
    for (const s of p.spouseKeys ?? []) {
      if (!inDraft(s.key)) continue;
      const u = register(unionIdFor([p.key, s.key]), [p.key, s.key]);
      u.year ??= s.year;
      u.status ??= "married";
    }
  }

  // Pass 2 — the couple implied by each child's parentage.
  for (const p of draft.people) {
    const father = inDraft(p.fatherKey) ? p.fatherKey : undefined;
    const mother = inDraft(p.motherKey) ? p.motherKey : undefined;
    if (!father && !mother) continue;

    const partners = [father, mother].filter((x): x is string => !!x);
    const u = register(unionIdFor(partners), partners);
    if (!u.childIds.includes(p.key)) u.childIds.push(p.key);
    childUnion[p.key] = u.id;
  }

  // Birth order where it is known, so the preview reads left to right the way
  // a family lists its children.
  const yearOf = (key: string) => people[key]?.birthYear ?? Number.MAX_SAFE_INTEGER;
  for (const u of Object.values(unions)) {
    u.childIds.sort((a, b) => yearOf(a) - yearOf(b));
    for (const partner of u.partners) {
      const card = people[partner];
      if (card) card.childCount = (card.childCount ?? 0) + u.childIds.length;
    }
  }

  return { people, unions, childUnion, personUnions, parents };
}

/**
 * The row a tree should open on: the earliest-born person with no parents in
 * the draft, falling back to the first row. Rooting on whoever happens to be
 * first draws most families upside down.
 */
export function draftApex(draft: FamilyDraft): string | undefined {
  const present = new Set(draft.people.map((p) => p.key));
  const rootless = draft.people.filter(
    (p) =>
      !(p.fatherKey && present.has(p.fatherKey)) &&
      !(p.motherKey && present.has(p.motherKey)),
  );
  const pool = rootless.length ? rootless : draft.people;
  return [...pool].sort(
    (a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
  )[0]?.key;
}
