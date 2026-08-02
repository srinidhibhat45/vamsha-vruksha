import type { Archive } from "./archive.ts";
import {
  birthYear,
  fullName,
  parentIdsOf,
  spouseIdsOf,
} from "./archive.ts";
import type { Person } from "./types.ts";

/**
 * Relationship naming.
 *
 * English kinship is lossy in exactly the places Konkani is precise. "Uncle"
 * covers four distinct relations that a Konkani-speaking family would never
 * confuse: your father's elder brother, your father's younger brother, your
 * mother's brother, and your aunt's husband each get their own word, and the
 * word carries real social weight — who you defer to, who conducts which ritual,
 * who you can joke with. An archive of Saraswat families that only said "uncle"
 * would be throwing away the most interesting half of the information.
 *
 * So we compute the relation structurally (common ancestor, distances, which
 * parent the path runs through, relative age of the two siblings) and then name
 * it in both languages.
 *
 * Terms below are the forms most widely understood across Goan, Mangalorean and
 * Chitrapur Konkani speakers. Usage varies by region and by family; where a
 * common alternative exists it is listed in `alt`.
 */

export type RelationKind =
  | "self"
  | "ancestor"
  | "descendant"
  | "sibling"
  | "pibling" // parent's sibling — uncle/aunt
  | "nibling" // sibling's child — nephew/niece
  | "cousin"
  | "spouse"
  | "in-law"
  | "connected"
  | "unrelated";

export interface KinTerm {
  english: string;
  konkani?: string;
  /** Regional alternatives worth showing in a tooltip. */
  alt?: string[];
  /** Short gloss of what the Konkani term literally distinguishes. */
  gloss?: string;
}

export interface RelationStep {
  fromId: string;
  toId: string;
  /** How we moved: to a parent, a child, or a spouse. */
  via: "father" | "mother" | "child" | "spouse";
  label: string;
}

export interface Relation {
  kind: RelationKind;
  /** "B is A's ___" */
  term: KinTerm;
  /** The reciprocal: "A is B's ___" */
  reciprocal: KinTerm;
  /** Generational distance from each side to the common ancestor. */
  degrees?: { a: number; b: number };
  commonAncestorIds?: string[];
  /** Human-readable chain, e.g. father → his mother → her brother. */
  path: RelationStep[];
  /** How many links in the chain. */
  distance: number;
  /** Kinship coefficient — probability a random allele is shared by descent. */
  consanguinity?: number;
}

/* ------------------------------------------------------------------ */
/* Term tables                                                         */
/* ------------------------------------------------------------------ */

const ORDINALS = [
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

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`;
}

function greats(n: number, base: string): string {
  if (n <= 0) return base;
  if (n === 1) return `great-${base}`;
  return `${n}× great-${base}`;
}

function isFemale(p?: Person) {
  return p?.gender === "F";
}
function isMale(p?: Person) {
  return p?.gender === "M";
}

/** Ancestor term at `d` generations up. */
function ancestorTerm(d: number, p?: Person): KinTerm {
  const male = isMale(p);
  const female = isFemale(p);
  if (d === 1) {
    if (male)
      return {
        english: "father",
        konkani: "Bapui",
        alt: ["Anna", "Baba", "Pappa"],
      };
    if (female)
      return { english: "mother", konkani: "Avoy", alt: ["Amma", "Aai"] };
    return { english: "parent", konkani: "Vaddil" };
  }
  if (d === 2) {
    if (female) return { english: "grandmother", konkani: "Ajji" };
    return { english: "grandfather", konkani: "Ajjo", alt: ["Ajja", "Aba"] };
  }
  if (d === 3) {
    if (female) return { english: "great-grandmother", konkani: "Panji" };
    return { english: "great-grandfather", konkani: "Panjo", alt: ["Panjja"] };
  }
  const base = female ? "grandmother" : "grandfather";
  return {
    english: greats(d - 2, base),
    konkani: female ? "Khapar-panji" : "Khapar-panjo",
    gloss: `${d} generations above`,
  };
}

/** Descendant term at `d` generations down. */
function descendantTerm(d: number, p?: Person): KinTerm {
  const female = isFemale(p);
  if (d === 1) {
    if (female) return { english: "daughter", konkani: "Dhuv", alt: ["Cheddum"] };
    if (isMale(p)) return { english: "son", konkani: "Put", alt: ["Cheddo"] };
    return { english: "child", konkani: "Bhurgem" };
  }
  if (d === 2)
    return female
      ? { english: "granddaughter", konkani: "Natin" }
      : { english: "grandson", konkani: "Natu" };
  if (d === 3)
    return female
      ? { english: "great-granddaughter", konkani: "Panatin" }
      : { english: "great-grandson", konkani: "Panatu" };
  const base = female ? "granddaughter" : "grandson";
  return { english: greats(d - 2, base), gloss: `${d} generations below` };
}

function siblingTerm(subject?: Person, relativeTo?: Person): KinTerm {
  const female = isFemale(subject);
  const ys = birthYear(subject);
  const yr = birthYear(relativeTo);
  const elder = ys != null && yr != null ? ys < yr : undefined;

  if (female) {
    if (elder === true)
      return {
        english: "elder sister",
        konkani: "Akka",
        alt: ["Tai"],
        gloss: "Konkani marks birth order among siblings",
      };
    if (elder === false)
      return { english: "younger sister", konkani: "Bhoin", alt: ["Dhaki bhoin"] };
    return { english: "sister", konkani: "Bhoin" };
  }
  if (isMale(subject)) {
    if (elder === true)
      return {
        english: "elder brother",
        konkani: "Anna",
        alt: ["Vhodlo bhav", "Dada"],
        gloss: "Konkani marks birth order among siblings",
      };
    if (elder === false)
      return { english: "younger brother", konkani: "Bhav", alt: ["Dhakto bhav"] };
    return { english: "brother", konkani: "Bhav" };
  }
  return { english: "sibling", konkani: "Bhav-bhoin" };
}

/**
 * Parent's sibling. This is where Konkani earns its keep: the term depends on
 * which parent the link runs through, and — for the father's brothers — on
 * whether he is older or younger than your father.
 */
function piblingTerm(
  subject: Person | undefined,
  throughParent: "father" | "mother" | undefined,
  parent: Person | undefined,
): KinTerm {
  const female = isFemale(subject);
  const ys = birthYear(subject);
  const yp = birthYear(parent);
  const elder = ys != null && yp != null ? ys < yp : undefined;

  if (throughParent === "father") {
    if (female)
      return {
        english: "paternal aunt",
        konkani: "Atte",
        gloss: "father's sister",
      };
    if (elder === true)
      return {
        english: "paternal uncle (father's elder brother)",
        konkani: "Vhodlo Bapui",
        alt: ["Doddappa", "Vhodda"],
        gloss: "father's elder brother — addressed with the deference owed a father",
      };
    if (elder === false)
      return {
        english: "paternal uncle (father's younger brother)",
        konkani: "Kaka",
        alt: ["Chikkappa", "Dhakto Bapui"],
        gloss: "father's younger brother",
      };
    return { english: "paternal uncle", konkani: "Kaka", gloss: "father's brother" };
  }
  if (throughParent === "mother") {
    if (female)
      return {
        english: "maternal aunt",
        konkani: "Mavshi",
        alt: ["Maushi"],
        gloss: "mother's sister — literally 'little mother'",
      };
    return {
      english: "maternal uncle",
      konkani: "Mama",
      alt: ["Maam"],
      gloss: "mother's brother — the uncle with ritual duties at a wedding",
    };
  }
  return female
    ? { english: "aunt", konkani: "Atte / Mavshi" }
    : { english: "uncle", konkani: "Kaka / Mama" };
}

function niblingTerm(subject?: Person): KinTerm {
  if (isFemale(subject)) return { english: "niece", konkani: "Bhachi" };
  if (isMale(subject)) return { english: "nephew", konkani: "Bhaso", alt: ["Putanyo"] };
  return { english: "sibling's child", konkani: "Bhaso / Bhachi" };
}

function cousinTerm(degree: number, removed: number, subject?: Person): KinTerm {
  const base =
    removed === 0
      ? `${ordinal(degree)} cousin`
      : `${ordinal(degree)} cousin ${removed === 1 ? "once" : removed === 2 ? "twice" : `${removed}×`} removed`;
  return {
    english: base,
    konkani: isFemale(subject) ? "Bhoin" : isMale(subject) ? "Bhav" : "Bhav-bhoin",
    gloss:
      "Konkani families do not distinguish cousins from siblings — a first cousin is simply a brother or sister",
  };
}

function spouseTerm(subject?: Person): KinTerm {
  if (isFemale(subject)) return { english: "wife", konkani: "Bail", alt: ["Baayil"] };
  if (isMale(subject)) return { english: "husband", konkani: "Ghov" };
  return { english: "spouse", konkani: "Jodem" };
}

/* ------------------------------------------------------------------ */
/* Ancestor maps                                                       */
/* ------------------------------------------------------------------ */

/** Map of ancestorId -> shortest generational distance, including self at 0. */
function ancestorDistances(
  archive: Archive,
  id: string,
  limit = 25,
): Map<string, number> {
  const dist = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  let d = 0;
  while (frontier.length && d < limit) {
    d++;
    const next: string[] = [];
    for (const cur of frontier) {
      for (const parent of parentIdsOf(archive, cur)) {
        if (dist.has(parent)) continue;
        dist.set(parent, d);
        next.push(parent);
      }
    }
    frontier = next;
  }
  return dist;
}

/** Which of A's parents does the path to `ancestorId` run through? */
function parentSideOf(
  archive: Archive,
  id: string,
  ancestorId: string,
): "father" | "mother" | undefined {
  const person = archive.people.get(id);
  if (!person) return undefined;
  if (person.fatherId) {
    const up = ancestorDistances(archive, person.fatherId);
    if (up.has(ancestorId)) return "father";
  }
  if (person.motherId) {
    const up = ancestorDistances(archive, person.motherId);
    if (up.has(ancestorId)) return "mother";
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Path reconstruction                                                 */
/* ------------------------------------------------------------------ */

type Edge = { to: string; via: RelationStep["via"] };

function neighbours(archive: Archive, id: string): Edge[] {
  const out: Edge[] = [];
  const p = archive.people.get(id);
  if (!p) return out;
  if (p.fatherId && archive.people.has(p.fatherId))
    out.push({ to: p.fatherId, via: "father" });
  if (p.motherId && archive.people.has(p.motherId))
    out.push({ to: p.motherId, via: "mother" });
  for (const c of archive.childrenOf.get(id) ?? []) out.push({ to: c, via: "child" });
  for (const s of spouseIdsOf(archive, id)) out.push({ to: s, via: "spouse" });
  return out;
}

/**
 * Bidirectional BFS. Genealogy graphs are shallow and very wide — a plain BFS
 * from one side explodes to tens of thousands of nodes by the sixth hop, while
 * meeting in the middle keeps both frontiers small.
 */
export function findPath(
  archive: Archive,
  fromId: string,
  toId: string,
  maxDepth = 14,
): RelationStep[] | null {
  if (fromId === toId) return [];
  if (!archive.people.has(fromId) || !archive.people.has(toId)) return null;

  const forwardPrev = new Map<string, { id: string; via: RelationStep["via"] }>();
  const backwardPrev = new Map<string, { id: string; via: RelationStep["via"] }>();
  const forwardSeen = new Set([fromId]);
  const backwardSeen = new Set([toId]);
  let fFrontier = [fromId];
  let bFrontier = [toId];
  let meeting: string | null = null;
  let depth = 0;

  const expand = (
    frontier: string[],
    seen: Set<string>,
    prev: Map<string, { id: string; via: RelationStep["via"] }>,
    otherSeen: Set<string>,
  ): { next: string[]; met: string | null } => {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const edge of neighbours(archive, cur)) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        prev.set(edge.to, { id: cur, via: edge.via });
        if (otherSeen.has(edge.to)) return { next, met: edge.to };
        next.push(edge.to);
      }
    }
    return { next, met: null };
  };

  while (fFrontier.length && bFrontier.length && depth < maxDepth) {
    depth++;
    const smallerFirst = fFrontier.length <= bFrontier.length;
    if (smallerFirst) {
      const r = expand(fFrontier, forwardSeen, forwardPrev, backwardSeen);
      fFrontier = r.next;
      if (r.met) {
        meeting = r.met;
        break;
      }
    } else {
      const r = expand(bFrontier, backwardSeen, backwardPrev, forwardSeen);
      bFrontier = r.next;
      if (r.met) {
        meeting = r.met;
        break;
      }
    }
  }

  if (!meeting) return null;

  // Walk out to both ends and stitch, flipping the direction of the back half.
  const head: RelationStep[] = [];
  let cur = meeting;
  while (cur !== fromId) {
    const prev = forwardPrev.get(cur);
    if (!prev) break;
    head.unshift({
      fromId: prev.id,
      toId: cur,
      via: prev.via,
      label: stepLabel(archive, prev.id, cur, prev.via),
    });
    cur = prev.id;
  }

  const tail: RelationStep[] = [];
  cur = meeting;
  while (cur !== toId) {
    const prev = backwardPrev.get(cur);
    if (!prev) break;
    const via = invertVia(archive, cur, prev.id, prev.via);
    tail.push({
      fromId: cur,
      toId: prev.id,
      via,
      label: stepLabel(archive, cur, prev.id, via),
    });
    cur = prev.id;
  }

  return [...head, ...tail];
}

function invertVia(
  archive: Archive,
  fromId: string,
  toId: string,
  originalVia: RelationStep["via"],
): RelationStep["via"] {
  if (originalVia === "spouse") return "spouse";
  if (originalVia === "child") {
    const target = archive.people.get(toId);
    if (target?.gender === "F") return "mother";
    return "father";
  }
  return "child";
}

function stepLabel(
  archive: Archive,
  fromId: string,
  toId: string,
  via: RelationStep["via"],
): string {
  const target = archive.people.get(toId);
  const name = target ? fullName(target) : toId;
  switch (via) {
    case "father":
      return `father, ${name}`;
    case "mother":
      return `mother, ${name}`;
    case "spouse":
      return `${target?.gender === "F" ? "wife" : target?.gender === "M" ? "husband" : "spouse"}, ${name}`;
    case "child":
      return `${target?.gender === "F" ? "daughter" : target?.gender === "M" ? "son" : "child"}, ${name}`;
  }
}

/* ------------------------------------------------------------------ */
/* The main entry point                                                */
/* ------------------------------------------------------------------ */

/**
 * How is `bId` related to `aId`? Read the result as "B is A's <term>".
 */
export function relate(archive: Archive, aId: string, bId: string): Relation {
  const a = archive.people.get(aId);
  const b = archive.people.get(bId);
  const empty: Relation = {
    kind: "unrelated",
    term: { english: "no recorded connection" },
    reciprocal: { english: "no recorded connection" },
    path: [],
    distance: Infinity,
  };
  if (!a || !b) return empty;

  if (aId === bId) {
    return {
      kind: "self",
      term: { english: "the same person" },
      reciprocal: { english: "the same person" },
      path: [],
      distance: 0,
    };
  }

  // Direct marriage first — it outranks any blood path a couple might also have.
  if (spouseIdsOf(archive, aId).includes(bId)) {
    return {
      kind: "spouse",
      term: spouseTerm(b),
      reciprocal: spouseTerm(a),
      path: findPath(archive, aId, bId) ?? [],
      distance: 1,
    };
  }

  const upA = ancestorDistances(archive, aId);
  const upB = ancestorDistances(archive, bId);

  // Best common ancestor = the one minimising total generational distance.
  let best: { id: string; dA: number; dB: number } | null = null;
  const shared: string[] = [];
  for (const [id, dA] of upA) {
    const dB = upB.get(id);
    if (dB === undefined) continue;
    shared.push(id);
    if (!best || dA + dB < best.dA + best.dB) best = { id, dA, dB };
  }

  if (best) {
    const { dA, dB } = best;
    // Everyone at the minimal total distance — a couple usually gives two.
    const commonAncestorIds = shared.filter((id) => {
      const x = upA.get(id)!;
      const y = upB.get(id)!;
      return x + y === dA + dB;
    });

    const path = findPath(archive, aId, bId) ?? [];
    const consanguinity = commonAncestorIds.reduce(
      (sum) => sum + Math.pow(0.5, dA + dB),
      0,
    );
    const base = {
      degrees: { a: dA, b: dB },
      commonAncestorIds,
      path,
      distance: path.length,
      consanguinity,
    };

    if (dA === 0) {
      return {
        kind: "descendant",
        term: descendantTerm(dB, b),
        reciprocal: ancestorTerm(dB, a),
        ...base,
      };
    }
    if (dB === 0) {
      return {
        kind: "ancestor",
        term: ancestorTerm(dA, b),
        reciprocal: descendantTerm(dA, a),
        ...base,
      };
    }
    if (dA === 1 && dB === 1) {
      return {
        kind: "sibling",
        term: siblingTerm(b, a),
        reciprocal: siblingTerm(a, b),
        ...base,
      };
    }
    if (dB === 1) {
      // B is a sibling of one of A's ancestors — uncle/aunt and up.
      const side = parentSideOf(archive, aId, best.id);
      if (dA === 2) {
        const parent = side
          ? archive.people.get(
              side === "father" ? a.fatherId! : a.motherId!,
            )
          : undefined;
        return {
          kind: "pibling",
          term: piblingTerm(b, side, parent),
          reciprocal: niblingTerm(a),
          ...base,
        };
      }
      const female = isFemale(b);
      return {
        kind: "pibling",
        term: {
          english: greats(dA - 2, female ? "grand-aunt" : "grand-uncle"),
          konkani: female ? "Vhodli Atte" : "Vhodlo Ajjo-bhav",
        },
        reciprocal: {
          english: greats(dA - 2, isFemale(a) ? "grand-niece" : "grand-nephew"),
        },
        ...base,
      };
    }
    if (dA === 1) {
      if (dB === 2) {
        return {
          kind: "nibling",
          term: niblingTerm(b),
          reciprocal: piblingTerm(a, parentSideOf(archive, bId, best.id), undefined),
          ...base,
        };
      }
      const female = isFemale(b);
      return {
        kind: "nibling",
        term: {
          english: greats(dB - 2, female ? "grand-niece" : "grand-nephew"),
        },
        reciprocal: {
          english: greats(dB - 2, isFemale(a) ? "grand-aunt" : "grand-uncle"),
        },
        ...base,
      };
    }

    const degree = Math.min(dA, dB) - 1;
    const removed = Math.abs(dA - dB);
    return {
      kind: "cousin",
      term: cousinTerm(degree, removed, b),
      reciprocal: cousinTerm(degree, removed, a),
      ...base,
    };
  }

  // No blood link. Fall back to the full graph, which will route through
  // marriages — "your brother's wife's father" and the like.
  const path = findPath(archive, aId, bId);
  if (!path) return empty;

  const marriages = path.filter((s) => s.via === "spouse").length;
  if (marriages === 1) {
    const term = inLawTerm(archive, path, b);
    return {
      kind: "in-law",
      term,
      reciprocal: { english: "related by marriage" },
      path,
      distance: path.length,
    };
  }

  return {
    kind: "connected",
    term: {
      english: `connected by marriage across ${path.length} steps`,
      gloss: "No shared ancestor is recorded — the link runs through marriages",
    },
    reciprocal: { english: `connected by marriage across ${path.length} steps` },
    path,
    distance: path.length,
  };
}

/** Name the common single-marriage in-law relations properly. */
function inLawTerm(
  archive: Archive,
  path: RelationStep[],
  b: Person,
): KinTerm {
  const female = isFemale(b);
  const shape = path.map((s) => s.via).join(">");

  const table: Record<string, KinTerm> = {
    "spouse>father": {
      english: "father-in-law",
      konkani: "Sasro",
      alt: ["Maam"],
    },
    "spouse>mother": { english: "mother-in-law", konkani: "Sasu", alt: ["Atte"] },
    "child>spouse": female
      ? { english: "daughter-in-law", konkani: "Sun" }
      : { english: "son-in-law", konkani: "Zavai", alt: ["Jamai"] },
    "father>child>spouse": female
      ? { english: "sister-in-law", konkani: "Vahini", gloss: "brother's wife" }
      : { english: "brother-in-law", konkani: "Mevhno" },
    "mother>child>spouse": female
      ? { english: "sister-in-law", konkani: "Vahini", gloss: "brother's wife" }
      : { english: "brother-in-law", konkani: "Mevhno" },
    "spouse>father>child": female
      ? { english: "sister-in-law", konkani: "Nanand", gloss: "husband's sister" }
      : { english: "brother-in-law", konkani: "Der", gloss: "husband's brother" },
    "spouse>mother>child": female
      ? { english: "sister-in-law", konkani: "Nanand", gloss: "husband's sister" }
      : { english: "brother-in-law", konkani: "Der", gloss: "husband's brother" },
  };

  if (table[shape]) return table[shape];

  // Generic: describe the chain in words.
  return {
    english: `${female ? "kinswoman" : "kinsman"} by marriage`,
    gloss: path.map((s) => s.label.split(",")[0]).join(" → "),
  };
}

/**
 * Sagotra check — two people of the same gotra are held to descend from the same
 * rishi and are traditionally treated as siblings for the purpose of marriage.
 * Presented as information about custom, not as advice.
 */
export function sameGotra(a: Person, b: Person): boolean {
  return !!a.gotra && !!b.gotra && a.gotra === b.gotra;
}
