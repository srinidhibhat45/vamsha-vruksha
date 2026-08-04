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
        endYear: z.number().int().min(-3000).max(2200).optional(),
        status: z
          .enum(["married", "widowed", "separated", "unknown"])
          .optional(),
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
    const label = describeDraft(p, draft.people);

    if (!p.given?.trim()) {
      const partial = partialNameOf(p);
      problems.push({
        key: p.key,
        severity: "error",
        // Said in terms of who they are next to, because that is the only
        // thing anybody knows about them yet — and it is what lets three of
        // these read as three different people to go and name.
        message: partial
          ? `${sentence(label)} still needs a given name — the form filled in “${partial}” from the family, but nobody has said what they were called`
          : `${sentence(label)} still needs a given name`,
      });
    }

    if (p.existingId) {
      if (knownIds && !knownIds(p.existingId)) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${sentence(label)} is marked as an existing record (${p.existingId}) that is not in the archive`,
        });
      }
      const clash = seenExisting.get(p.existingId);
      if (clash) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${sentence(label)} and ${clash} both point at the same existing record`,
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
          message: `${sentence(label)} is listed as their own ${field.toLowerCase()}`,
        });
      } else if (!resolves(ref)) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${field} of ${label} points at nobody`,
        });
      }
    }

    const seenSpouse = new Set<string>();
    for (const s of p.spouseKeys ?? []) {
      if (s.key === p.key) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${sentence(label)} is listed as married to themselves`,
        });
        continue;
      }
      if (!resolves(s.key)) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `A marriage of ${label} points at nobody`,
        });
        continue;
      }
      if (seenSpouse.has(s.key)) {
        // Two rows for one marriage draw two junctions between the same pair
        // and split their children across both.
        const other = byKey.get(s.key);
        problems.push({
          key: p.key,
          severity: "error",
          message: `${sentence(label)} is married to ${
            other ? describeDraft(other, draft.people) : "the same person"
          } twice over — record it once`,
        });
      }
      seenSpouse.add(s.key);

      if (s.year && s.endYear && s.endYear < s.year) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `A marriage of ${label} is recorded as ending in ${s.endYear}, before it began in ${s.year}`,
        });
      }
      if (s.year && p.birthYear && s.year < p.birthYear) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${sentence(label)} is recorded as marrying in ${s.year}, before being born in ${p.birthYear}`,
        });
      }
      if (s.year && p.deathYear && s.year > p.deathYear) {
        problems.push({
          key: p.key,
          severity: "warning",
          message: `${sentence(label)} is recorded as marrying in ${s.year}, after dying in ${p.deathYear} — one of the two dates may be off a different calendar`,
        });
      }
    }

    /*
      Two marriages that overlap in time.

      A widower remarrying is ordinary and is most of what this archive holds;
      two live marriages at once is rarer, and both are things a family may
      genuinely be describing. What is nearly always a slip is a *second*
      marriage dated before the first one ended when an end year is recorded —
      so that is a warning naming both years, and never a refusal.
    */
    const dated = (p.spouseKeys ?? [])
      .filter((s) => s.year != null)
      .sort((a, b) => a.year! - b.year!);
    for (let i = 1; i < dated.length; i++) {
      const earlier = dated[i - 1];
      const later = dated[i];
      if (earlier.endYear == null || earlier.endYear <= later.year!) continue;
      problems.push({
        key: p.key,
        severity: "warning",
        message: `${sentence(label)} married again in ${later.year} while an earlier marriage is recorded as running to ${earlier.endYear}`,
      });
    }

    if (p.birthYear && p.deathYear && p.deathYear < p.birthYear) {
      problems.push({
        key: p.key,
        severity: "error",
        message: `${sentence(label)} is recorded as dying before being born`,
      });
    }

    for (const [role, ref] of [
      ["father", p.fatherKey],
      ["mother", p.motherKey],
    ] as const) {
      const parent = ref ? byKey.get(ref) : undefined;
      if (!parent) continue;
      const parentLabel = describeDraft(parent, draft.people);

      // A child born well after a parent's recorded death. Posthumous children
      // are real, so a few months' grace, and it stays a warning.
      if (parent.deathYear && p.birthYear && p.birthYear > parent.deathYear + 1) {
        problems.push({
          key: p.key,
          severity: "warning",
          message: `${sentence(label)} is recorded as born in ${p.birthYear}, after their ${role} ${parentLabel} died in ${parent.deathYear}`,
        });
      }

      if (!parent.birthYear || !p.birthYear) continue;
      const gap = p.birthYear - parent.birthYear;
      if (gap <= 0) {
        problems.push({
          key: p.key,
          severity: "error",
          message: `${sentence(label)} is born before their ${role}, ${parentLabel}`,
        });
      } else if (gap < 14 || gap > 65) {
        problems.push({
          key: p.key,
          severity: "warning",
          message: `${sentence(parentLabel)} would have been ${gap} at ${label}'s birth`,
        });
      }
    }
  }

  /*
    A couple with children where neither is recorded as a man.

    Which of the two is the father decides the children's middle name and
    their surname, and — once published — which of them each child's record
    points at as fatherId. With both sexes blank the builder has to put them
    in the two slots in *some* order, and that order is stable rather than
    right. Saying so is cheap and the fix is two dropdowns.
  */
  const flaggedCouple = new Set<string>();
  for (const p of draft.people) {
    const father = p.fatherKey ? byKey.get(p.fatherKey) : undefined;
    const mother = p.motherKey ? byKey.get(p.motherKey) : undefined;
    if (!father || !mother) continue;
    if (father.gender === "M" || mother.gender === "M") continue;
    if (father.gender === "F" && mother.gender === "F") continue;
    const pairKey = [father.key, mother.key].sort().join("+");
    if (flaggedCouple.has(pairKey)) continue;
    flaggedCouple.add(pairKey);
    problems.push({
      key: father.key,
      severity: "warning",
      message: `Neither ${describeDraft(father, draft.people)} nor ${describeDraft(mother, draft.people)} is recorded as a man, so which of them their children take a name from is a guess`,
    });
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
        message: `${sentence(describeDraft(p, draft.people))} ends up as their own ancestor`,
      });
      break;
    }
  }

  return problems;
}

/**
 * What to call this row, or nothing at all.
 *
 * The patronymic and the surname are filled in for you when a row is created —
 * a child inherits its father's given name as its middle name and its father's
 * surname, which is the Konkani convention and is right almost always. What
 * that produced, before this returned "", was a card reading "Shrikan Bhat"
 * for a person nobody had named yet: two thirds of a real name, indexed,
 * clickable, and completely invented by the form. A contributor scanning the
 * drawing for what is still missing could not see it, and the error list said
 * three people needed a given name while three cards appeared to have one.
 *
 * So a row has no name until somebody types the *given* name. Everything the
 * inheritance guessed is still there, still shown in its own field, and starts
 * counting the moment there is a person for it to belong to.
 */
export function displayOf(p: DraftPerson): string {
  if (!p.given?.trim()) return "";
  return [p.given, p.patronymic, p.surname].filter(Boolean).join(" ").trim();
}

/** The inherited parts of a name, for a row that has no given name yet. */
export function partialNameOf(p: DraftPerson): string {
  return [p.patronymic, p.surname].filter(Boolean).join(" ").trim();
}

/**
 * A phrase that identifies a row with no name — by whom it stands next to.
 *
 * An error list that says "Everyone needs at least a given name" three times
 * over is not a list of three problems, it is one problem printed three times:
 * nothing in it says *which* three people, and the three cards it refers to
 * are the three the contributor cannot identify either, because being nameless
 * is the whole complaint. Naming them by their relations — the only thing
 * known about them — is what turns the list back into three separate things to
 * go and fix.
 */
export function describeDraft(
  p: DraftPerson,
  people: DraftPerson[],
): string {
  const named = displayOf(p);
  if (named) return named;

  const byKey = new Map(people.map((q) => [q.key, q]));
  const nameOf = (key: string | undefined): string | undefined => {
    const q = key ? byKey.get(key) : undefined;
    return q ? displayOf(q) || undefined : undefined;
  };

  /*
    Where several rows would otherwise get the same phrase — four unnamed
    children of one couple, two unnamed wives of one man — they are numbered.
    Without it the error list says "the child of Shrikan Bhat" three times,
    which is the same failure as saying "Everyone needs a given name" three
    times, only further along.
  */
  const rank = (group: DraftPerson[]) =>
    group.length > 1 ? `${ordinalWord(group.indexOf(p) + 1)} ` : "";

  const father = nameOf(p.fatherKey);
  const mother = nameOf(p.motherKey);
  const parents = [father, mother].filter(Boolean).join(" and ");
  const child = p.gender === "F" ? "daughter" : p.gender === "M" ? "son" : "child";
  if (parents) {
    const siblings = people.filter(
      (q) =>
        q.fatherKey === p.fatherKey &&
        q.motherKey === p.motherKey &&
        !displayOf(q) &&
        (q.gender ?? "?") === (p.gender ?? "?"),
    );
    return `the ${rank(siblings)}${child} of ${parents}`;
  }

  const partner = partnerWord(p.gender);

  // Married to somebody named — the case the "+ Marriage" button creates.
  for (const s of p.spouseKeys ?? []) {
    const other = nameOf(s.key);
    if (other) return `${possessive(other)} ${partner}`;
  }
  // …or married *by* somebody named, since a marriage is only stored on one
  // of the two rows. A man with two wives has two rows that would otherwise
  // read alike, so they are numbered in the order he married them.
  for (const q of people) {
    if (!q.spouseKeys?.some((s) => s.key === p.key)) continue;
    const other = displayOf(q);
    if (!other) continue;
    const unnamedSpouses = (q.spouseKeys ?? [])
      .map((s) => byKey.get(s.key))
      .filter(
        (r): r is DraftPerson =>
          !!r && !displayOf(r) && (r.gender ?? "?") === (p.gender ?? "?"),
      );
    return `${possessive(other)} ${rank(unnamedSpouses)}${partner}`;
  }

  // A parent of somebody named, which is what "+ Father" creates.
  for (const q of people) {
    const role =
      q.fatherKey === p.key ? "father" : q.motherKey === p.key ? "mother" : null;
    if (!role) continue;
    const of = displayOf(q);
    if (of) return `the ${role} of ${of}`;
  }

  const partial = partialNameOf(p);
  return partial ? `the unnamed ${partial}` : "somebody with no name yet";
}

/* ------------------------------------------------------------------ */
/* Whose name a woman carries                                          */
/* ------------------------------------------------------------------ */

/**
 * The Konkani convention, as a rule the form can apply rather than a thing
 * every contributor has to retype.
 *
 * A woman's middle name is a man's given name and her surname is his surname:
 * her father's before she marries, her husband's afterwards. Sunanda Vasudev
 * Kamath becomes Sunanda Narayan Pai on marrying Narayan Pai, and the same
 * woman appears under both names in records forty years apart — which is
 * exactly why the archive has to know that the two are one rule and not two
 * people. It is also why the *birth* name is worth keeping: her father's name
 * is how her own family's records list her.
 *
 * Applied automatically only where nothing can be lost — an empty field, or a
 * field still holding precisely what the previous rule put there. Everywhere
 * else it is offered as a button and the contributor decides, because plenty
 * of families do not follow it, and a woman who kept her father's name after
 * marrying is a fact, not a mistake to be corrected on her behalf.
 */
export function conventionalName(from: DraftPerson | undefined): {
  patronymic?: string;
  surname?: string;
} {
  return {
    patronymic: from?.given?.trim() || undefined,
    surname: from?.surname?.trim() || undefined,
  };
}

const sameText = (a?: string, b?: string) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * Whether moving this person onto a new name would overwrite something a
 * contributor typed. True when every part is either empty or exactly what the
 * old source would have produced.
 */
export function nameIsInherited(
  person: DraftPerson,
  from: DraftPerson | undefined,
): boolean {
  const derived = conventionalName(from);
  const p = person.patronymic?.trim();
  const s = person.surname?.trim();
  return (
    (!p || sameText(p, derived.patronymic)) && (!s || sameText(s, derived.surname))
  );
}

/** True when the person already carries exactly this name. */
export function nameMatches(
  person: DraftPerson,
  from: DraftPerson | undefined,
): boolean {
  const derived = conventionalName(from);
  return (
    sameText(person.patronymic, derived.patronymic) &&
    sameText(person.surname, derived.surname)
  );
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

const ORDINAL_WORDS = [
  "",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? `${n}th`;
}

function partnerWord(gender: DraftPerson["gender"]): string {
  if (gender === "F") return "wife";
  if (gender === "M") return "husband";
  return "spouse";
}

/** Capitalised for the start of a sentence. */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
      u.endYear ??= s.endYear;
      u.status ??= s.status ?? (s.endYear ? "unknown" : "married");
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

  // Marriages oldest first, so a remarriage is drawn as the second one and
  // reads that way. Same rule as the published archive uses (see
  // archive.buildUnions), so the preview and the finished tree agree.
  for (const [key, list] of Object.entries(personUnions)) {
    if (list.length < 2) continue;
    const rank = (unionId: string) => {
      const u = unions[unionId];
      if (!u) return Number.MAX_SAFE_INTEGER;
      if (u.year != null) return u.year;
      const births = u.childIds
        .map(yearOf)
        .filter((y) => y !== Number.MAX_SAFE_INTEGER);
      return births.length ? Math.min(...births) - 0.5 : Number.MAX_SAFE_INTEGER;
    };
    personUnions[key] = [...list].sort(
      (a, b) => rank(a) - rank(b) || a.localeCompare(b),
    );
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
