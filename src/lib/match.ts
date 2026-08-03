import { birthYear, deathYear, fullName, getArchive, lifespan } from "./archive.ts";
import { nameSimilarity, phoneticKey, spellingFamily } from "./translit.ts";
import type { Person } from "./types.ts";

/**
 * "Is this person already here?"
 *
 * Search answers a different question. Search is asked by a reader who wants a
 * record and will recognise it when they see it; this is asked on the
 * contributor's behalf, about somebody they are in the middle of typing in,
 * and the cost of a wrong answer runs the other way. A missed match creates a
 * second Vasudev Kamath, and from then on half his descendants hang off one
 * copy and half off the other — the single most damaging thing that happens to
 * a community archive, and the hardest to unpick years later.
 *
 * Three things make this harder than string matching, and all three are the
 * point of this module:
 *
 * 1. **The name in the archive may not be the name being typed.** Ancestors
 *    are recorded under nicknames, under anglicised spellings, under the name
 *    a grandchild knew them by. So every name surface a record carries — the
 *    display name, the aka list, the birth name, the native script — is
 *    matched against, and the one that won is reported back, because
 *    "recorded here as Nanu" is what tells the contributor this is their man.
 *
 * 2. **Spelling variation is systematic.** translit.ts already folds
 *    Shreenivas onto Srinivasa; the surname families bridge the pairs folding
 *    cannot reach, where two spellings diverged through Portuguese and English
 *    rather than through sound — Shenoy and Sinai, Kamath and Camotim.
 *
 * 3. **A name alone is weak and the lineage fields are strong.** Two men named
 *    Narayan Kamath born forty years apart are not the same person; two men of
 *    the same gotra, the same mool and the same kuladevata very often are,
 *    even when one is written Narain. Gotra especially cuts both ways — it is
 *    patrilineal and does not change, so a mismatch is real evidence *against*
 *    a match rather than merely absent evidence for one.
 *
 * Everything is scored into a single number, but the number is not what is
 * shown. The reasons are. A contributor cannot act on "87% match" and can act
 * on "same gotra and mool, and her father's name matches".
 */

export interface MatchDescriptor {
  given?: string;
  patronymic?: string;
  surname?: string;
  aka?: string[];
  devanagari?: string;

  birthYear?: number;
  deathYear?: number;

  gotra?: string;
  mool?: string;
  kuladevata?: string;
  math?: string;
  community?: string;

  /** Names as typed, not ids — the relatives may not be in the archive yet. */
  fatherName?: string;
  motherName?: string;
  spouseName?: string;

  /** Records to leave out: the row being edited, rows already linked. */
  exclude?: string[];
}

export interface MatchCandidate {
  id: string;
  name: string;
  /** Years and family line, for the second row of the suggestion. */
  detail: string;
  /** 0–100, for ordering and for the reviewer. Never the whole story. */
  score: number;
  /** Why, in words a contributor can check against what they know. */
  reasons: string[];
  strength: "strong" | "possible";
  href: string;
}

/** Below this the names are simply not the same name, whatever else agrees. */
const NAME_FLOOR = 0.52;
/** Below this a candidate is not worth interrupting anybody about. */
const REPORT_FLOOR = 0.6;
/** At or above this the suggestion is stated rather than offered. */
const STRONG = 0.84;

function nameSurfaces(p: Person): { text: string; kind: string }[] {
  const out: { text: string; kind: string }[] = [];
  const push = (text: string | undefined, kind: string) => {
    if (text && text.trim()) out.push({ text: text.trim(), kind });
  };

  push(fullName(p), "name");
  push([p.name.given, p.name.surname].filter(Boolean).join(" "), "name");
  push(p.name.birthName, "birth name");
  for (const alias of p.name.aka ?? []) push(alias, "alias");
  return out;
}

/**
 * Surname agreement, including the pairs phonetic folding cannot reach.
 * Returns null when either side has no surname — most older records do not,
 * and treating absence as disagreement would bury every real ancestor.
 */
function surnameAgreement(a?: string, b?: string): boolean | null {
  if (!a?.trim() || !b?.trim()) return null;
  if (phoneticKey(a) === phoneticKey(b)) return true;
  const fa = spellingFamily(a);
  const fb = spellingFamily(b);
  if (fa !== null && fa === fb) return true;
  return false;
}

function relativeName(p: Person | undefined): string | undefined {
  return p ? fullName(p) : undefined;
}

export function scorePerson(
  desc: MatchDescriptor,
  person: Person,
): { score: number; reasons: string[] } | null {
  const archive = getArchive();
  const reasons: string[] = [];

  const typed = [desc.given, desc.patronymic, desc.surname]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!typed) return null;

  /* ------------------------------------------------------- the name */

  let best = 0;
  let bestSurface: { text: string; kind: string } | undefined;

  const candidateNames = [typed, ...(desc.aka ?? [])].filter(Boolean);
  for (const surface of nameSurfaces(person)) {
    for (const mine of candidateNames) {
      const s = nameSimilarity(mine, surface.text);
      if (s > best) {
        best = s;
        bestSurface = surface;
      }
    }
  }

  // Native script is unambiguous — no folding, no edit distance. When it
  // matches it is the strongest single signal available.
  let devanagariHit = false;
  if (desc.devanagari?.trim()) {
    const mine = desc.devanagari.trim();
    for (const script of [person.name.devanagari, person.name.kannada]) {
      if (script && script.trim() === mine) {
        devanagariHit = true;
        best = Math.max(best, 0.95);
      }
    }
  }

  if (best < NAME_FLOOR) return null;

  /*
   * The given name has to agree, and this check carries more weight than
   * everything below it put together.
   *
   * Konkani names are built *given · father's given · surname*, so a set of
   * siblings shares two of their three tokens by construction. Scoring the
   * whole string, "Gangabai Waman Kamath" comes out two-thirds similar to
   * "Mahadev Waman Kamath" — and then the same mool and the same patronymic,
   * which every one of those siblings also shares, push it to a confident
   * match. The archive would suggest a man's sister as a duplicate of him,
   * which is worse than suggesting nothing: it teaches contributors that the
   * warnings are noise, and the true duplicate three rows down goes unread.
   *
   * The given name is the only token that distinguishes people within a
   * sibling group, so a clear disagreement there ends it, whatever else lines
   * up. An alias hit is exempt — that is precisely the case where the given
   * name on the record legitimately is not the one being typed.
   */
  let score = best;

  const mineGiven = desc.given?.trim();
  const theirsGiven = person.name.given?.trim();
  if (
    mineGiven &&
    theirsGiven &&
    !devanagariHit &&
    (!bestSurface || bestSurface.kind === "name")
  ) {
    const givenScore = nameSimilarity(mineGiven, theirsGiven);
    if (givenScore < 0.5) return null;
    // Close but not equal — Madhav against Mahadev. Worth showing, not worth
    // stating, so the context bonuses below start from a much lower base.
    if (givenScore < 0.75) score = Math.min(score, 0.58);
  }

  if (devanagariHit) {
    reasons.push("the same name in Devanagari");
  } else if (bestSurface && bestSurface.kind !== "name") {
    // The whole reason aliases are indexed: say which one hit, or the
    // contributor sees an unfamiliar name and dismisses a true match.
    reasons.push(`recorded here as “${bestSurface.text}” (${bestSurface.kind})`);
  }

  const surnames = surnameAgreement(desc.surname, person.name.surname);
  if (surnames === true && desc.surname && person.name.surname) {
    const a = desc.surname.trim().toLowerCase();
    const b = person.name.surname.trim().toLowerCase();
    if (a !== b) {
      reasons.push(`${desc.surname} and ${person.name.surname} are one surname`);
      score += 0.06;
    }
  } else if (surnames === false) {
    score -= 0.14;
  }

  /* ------------------------------------------------------- the dates */

  const born = birthYear(person);
  if (desc.birthYear && born) {
    const gap = Math.abs(desc.birthYear - born);
    if (gap === 0) {
      score += 0.24;
      reasons.push(`both born ${born}`);
    } else if (gap <= 3) {
      score += 0.14;
      reasons.push(`born ${born}, within ${gap} year${gap === 1 ? "" : "s"}`);
    } else if (gap <= 8) {
      score += 0.04;
    } else if (gap > 15) {
      // A generation apart. Whatever else agrees, these are two people.
      score -= 0.4;
    } else {
      score -= 0.1;
    }
  }

  const died = deathYear(person);
  if (desc.deathYear && died) {
    const gap = Math.abs(desc.deathYear - died);
    if (gap === 0) {
      score += 0.12;
      reasons.push(`both died ${died}`);
    } else if (gap > 12) {
      score -= 0.2;
    }
  }

  /* ----------------------------------------------------- the lineage */

  const shared: string[] = [];
  const lineageFields = [
    { mine: desc.gotra, theirs: person.gotra, up: 0.09, down: 0.14, label: (id: string) => archive.gotras.get(id)?.name ?? id, noun: "gotra" },
    { mine: desc.mool, theirs: person.mool, up: 0.1, down: 0.05, label: (id: string) => archive.places.get(id)?.name ?? id, noun: "mool" },
    { mine: desc.kuladevata, theirs: person.kuladevata, up: 0.09, down: 0.05, label: (id: string) => archive.kuladevatas.get(id)?.name ?? id, noun: "kuladevata" },
    { mine: desc.math, theirs: person.math, up: 0.04, down: 0.03, label: (id: string) => archive.maths.get(id)?.name ?? id, noun: "matha" },
    { mine: desc.community, theirs: person.community, up: 0.02, down: 0.02, label: (id: string) => archive.communities.get(id)?.name ?? id, noun: "community" },
  ];

  for (const f of lineageFields) {
    if (!f.mine || !f.theirs) continue;
    if (f.mine === f.theirs) {
      score += f.up;
      shared.push(`${f.noun} ${f.label(f.theirs)}`);
    } else {
      score -= f.down;
    }
  }
  if (shared.length) reasons.push(`same ${shared.join(", same ")}`);

  /* ---------------------------------------------------- the relatives */

  const relatives: { typed?: string; actual?: string; role: string; weight: number }[] = [
    {
      typed: desc.fatherName,
      actual: relativeName(person.fatherId ? archive.people.get(person.fatherId) : undefined),
      role: "father",
      weight: 0.26,
    },
    {
      typed: desc.motherName,
      actual: relativeName(person.motherId ? archive.people.get(person.motherId) : undefined),
      role: "mother",
      weight: 0.22,
    },
  ];

  for (const r of relatives) {
    if (!r.typed?.trim() || !r.actual) continue;
    const s = nameSimilarity(r.typed, r.actual);
    if (s >= 0.72) {
      score += r.weight;
      reasons.push(`${r.role} is ${r.actual}`);
    } else if (s < 0.4) {
      // A named parent who is somebody else entirely is strong evidence.
      score -= 0.24;
    }
  }

  if (desc.spouseName?.trim()) {
    for (const link of person.spouses ?? []) {
      const other = archive.people.get(link.personId);
      if (!other) continue;
      if (nameSimilarity(desc.spouseName, fullName(other)) >= 0.72) {
        score += 0.24;
        reasons.push(`married to ${fullName(other)}`);
        break;
      }
    }
  }

  // The patronymic is the father's given name by construction, so it corroborates
  // the father link even when no father record exists to compare against.
  if (desc.patronymic?.trim() && person.name.patronymic?.trim()) {
    const s = nameSimilarity(desc.patronymic, person.name.patronymic);
    if (s >= 0.8) {
      score += 0.08;
      if (!reasons.some((r) => r.startsWith("father"))) {
        reasons.push(`same father's name, ${person.name.patronymic}`);
      }
    }
  }

  if (score < REPORT_FLOOR) return null;

  if (!reasons.length) reasons.push("a very similar name");
  return { score: Math.min(1, score), reasons };
}

export function findMatches(desc: MatchDescriptor, limit = 5): MatchCandidate[] {
  const archive = getArchive();
  const excluded = new Set(desc.exclude ?? []);

  const scored: MatchCandidate[] = [];
  for (const person of archive.personList) {
    if (excluded.has(person.id)) continue;
    const hit = scorePerson(desc, person);
    if (!hit) continue;

    const lineageId = archive.lineageOf.get(person.id);
    const years = lifespan(person);
    const line = lineageId ? archive.lineages.get(lineageId)?.label : undefined;

    scored.push({
      id: person.id,
      name: fullName(person),
      detail: [years, line].filter(Boolean).join(" · "),
      score: Math.round(hit.score * 100),
      reasons: hit.reasons,
      strength: hit.score >= STRONG ? "strong" : "possible",
      href: `/person/${person.id}`,
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
