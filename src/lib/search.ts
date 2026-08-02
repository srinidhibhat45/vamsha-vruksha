import type { Archive, Facet } from "./archive.ts";
import { birthYear, deathYear, fullName, getArchive } from "./archive.ts";
import { editDistance, phoneticKey, plainTokens } from "./translit.ts";
import type { Person } from "./types.ts";

/**
 * Search.
 *
 * Two indexes over the same people: a literal one (lowercased, diacritics
 * stripped) and a phonetic one (see translit.ts). A query hits the literal
 * index first — someone who types an exact name should never be ranked below a
 * fuzzy match — and falls through to the phonetic index, and finally to a
 * bounded edit distance across the phonetic vocabulary.
 *
 * The phonetic vocabulary for a community archive is small (a few thousand
 * distinct keys even at a hundred thousand people, because Indic given names
 * repeat heavily), so the fuzzy pass is a linear scan over that vocabulary
 * rather than over the people — cheap enough to run on every keystroke.
 */

export interface SearchFilters {
  gotra?: string;
  math?: string;
  community?: string;
  mool?: string;
  kuladevata?: string;
  surname?: string;
  lineage?: string;
  confidence?: string;
  country?: string;
  bornAfter?: number;
  bornBefore?: number;
  living?: boolean;
  hasPhoto?: boolean;
}

export interface SearchResult {
  person: Person;
  score: number;
  /** Which field produced the strongest match, for the result subtitle. */
  matchedOn: string;
  lineageId?: string;
  lineageLabel?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  facets: {
    gotra: Facet[];
    math: Facet[];
    community: Facet[];
    mool: Facet[];
    kuladevata: Facet[];
    surname: Facet[];
    confidence: Facet[];
  };
  /** Set when the query was corrected, e.g. "did you mean Shanbhag?" */
  suggestion?: string;
}

interface IndexEntry {
  /** Literal tokens: name parts, aka, native script. */
  literal: Set<string>;
  /** Phonetic keys for the same tokens. */
  phonetic: Set<string>;
  /** The surname's phonetic key, weighted higher. */
  surnameKey?: string;
  /** Given name phonetic key. */
  givenKey?: string;
  text: string;
}

interface SearchIndex {
  entries: Map<string, IndexEntry>;
  byLiteral: Map<string, string[]>;
  byPhonetic: Map<string, string[]>;
  /** Distinct phonetic keys, for the fuzzy scan. */
  vocabulary: string[];
}

function collectTokens(p: Person): { literal: string[]; text: string } {
  const parts = [
    p.name.given,
    p.name.surname,
    p.name.patronymic,
    p.name.display,
    p.name.birthName,
    p.name.devanagari,
    p.name.kannada,
    ...(p.name.aka ?? []),
  ].filter((x): x is string => !!x);

  const literal = new Set<string>();
  for (const part of parts) for (const t of plainTokens(part)) literal.add(t);

  return { literal: [...literal], text: parts.join(" ") };
}

function buildIndex(archive: Archive): SearchIndex {
  const entries = new Map<string, IndexEntry>();
  const byLiteral = new Map<string, string[]>();
  const byPhonetic = new Map<string, string[]>();

  const push = (map: Map<string, string[]>, key: string, id: string) => {
    const list = map.get(key);
    if (list) list.push(id);
    else map.set(key, [id]);
  };

  for (const p of archive.personList) {
    const { literal, text } = collectTokens(p);
    const phonetic = new Set<string>();
    for (const t of literal) {
      const k = phoneticKey(t);
      if (k) phonetic.add(k);
    }
    entries.set(p.id, {
      literal: new Set(literal),
      phonetic,
      surnameKey: p.name.surname ? phoneticKey(p.name.surname) : undefined,
      givenKey: p.name.given ? phoneticKey(p.name.given) : undefined,
      text,
    });
    for (const t of literal) push(byLiteral, t, p.id);
    for (const k of phonetic) push(byPhonetic, k, p.id);
  }

  return { entries, byLiteral, byPhonetic, vocabulary: [...byPhonetic.keys()] };
}

let indexCache: { archive: Archive; index: SearchIndex } | null = null;

function getIndex(archive: Archive): SearchIndex {
  if (indexCache && indexCache.archive === archive) return indexCache.index;
  const index = buildIndex(archive);
  indexCache = { archive, index };
  return index;
}

/* ------------------------------------------------------------------ */
/* Filtering                                                           */
/* ------------------------------------------------------------------ */

function passesFilters(
  p: Person,
  f: SearchFilters,
  archive: Archive,
): boolean {
  if (f.gotra && p.gotra !== f.gotra) return false;
  if (f.math && p.math !== f.math) return false;
  if (f.community && p.community !== f.community) return false;
  if (f.mool && p.mool !== f.mool) return false;
  if (f.kuladevata && p.kuladevata !== f.kuladevata) return false;
  if (f.confidence && p.confidence !== f.confidence) return false;
  if (f.surname) {
    const want = phoneticKey(f.surname);
    if (!p.name.surname || phoneticKey(p.name.surname) !== want) return false;
  }
  if (f.lineage && archive.lineageOf.get(p.id) !== f.lineage) return false;
  if (f.living !== undefined) {
    const isLiving = p.status === "living";
    if (isLiving !== f.living) return false;
  }
  if (f.hasPhoto && !p.photo?.url) return false;
  if (f.bornAfter != null) {
    const y = birthYear(p);
    if (y == null || y < f.bornAfter) return false;
  }
  if (f.bornBefore != null) {
    const y = birthYear(p);
    if (y == null || y > f.bornBefore) return false;
  }
  if (f.country) {
    const last = p.residences?.[p.residences.length - 1];
    const place = last?.id ? archive.places.get(last.id) : undefined;
    if (place?.country !== f.country) return false;
  }
  return true;
}

function facetsFor(people: Person[], archive: Archive): SearchResponse["facets"] {
  const make = (
    pick: (p: Person) => string | undefined,
    label: (id: string) => string,
  ): Facet[] => {
    const counts = new Map<string, number>();
    for (const p of people) {
      const k = pick(p);
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ id, label: label(id), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };

  return {
    gotra: make((p) => p.gotra, (id) => archive.gotras.get(id)?.name ?? id),
    math: make((p) => p.math, (id) => archive.maths.get(id)?.name ?? id),
    community: make(
      (p) => p.community,
      (id) => archive.communities.get(id)?.name ?? id,
    ),
    mool: make((p) => p.mool, (id) => archive.places.get(id)?.name ?? id),
    kuladevata: make(
      (p) => p.kuladevata,
      (id) => archive.kuladevatas.get(id)?.name ?? id,
    ),
    surname: make((p) => p.name.surname, (id) => id),
    confidence: make((p) => p.confidence, (id) => id),
  };
}

/* ------------------------------------------------------------------ */
/* Query                                                               */
/* ------------------------------------------------------------------ */

export interface SearchOptions {
  query?: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  sort?: "relevance" | "name" | "oldest" | "newest";
}

export function search(options: SearchOptions = {}): SearchResponse {
  const archive = getArchive();
  const index = getIndex(archive);
  const filters = options.filters ?? {};
  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;
  const query = (options.query ?? "").trim();

  // Filter first — it is a cheap linear pass and shrinks the scoring set.
  const candidates = archive.personList.filter((p) =>
    passesFilters(p, filters, archive),
  );

  let scored: SearchResult[];
  let suggestion: string | undefined;

  if (!query) {
    scored = candidates.map((person) => ({
      person,
      score: 0,
      matchedOn: "",
      lineageId: archive.lineageOf.get(person.id),
      lineageLabel: archive.lineages.get(
        archive.lineageOf.get(person.id) ?? "",
      )?.label,
    }));
  } else {
    const candidateIds = new Set(candidates.map((p) => p.id));
    const queryTokens = plainTokens(query);
    const scores = new Map<string, number>();
    const matchedOn = new Map<string, string>();

    const award = (id: string, points: number, why: string) => {
      if (!candidateIds.has(id)) return;
      const prev = scores.get(id) ?? 0;
      scores.set(id, prev + points);
      if (points >= 3 && !matchedOn.has(id)) matchedOn.set(id, why);
    };

    for (const token of queryTokens) {
      const key = phoneticKey(token);

      // 1. Exact literal token.
      for (const id of index.byLiteral.get(token) ?? []) award(id, 10, "name");

      // 2. Literal prefix — powers type-ahead.
      if (token.length >= 2) {
        for (const [literal, ids] of index.byLiteral) {
          if (literal !== token && literal.startsWith(token)) {
            for (const id of ids) award(id, 6, "name");
          }
        }
      }

      // 3. Phonetic equality — Shreenivas finding Srinivasa.
      if (key) {
        for (const id of index.byPhonetic.get(key) ?? []) award(id, 5, "spelling");
      }

      // 4. Bounded fuzzy over the phonetic vocabulary.
      if (key && key.length >= 3) {
        let bestKey: string | undefined;
        let bestDist = 3;
        for (const vocab of index.vocabulary) {
          if (vocab === key) continue;
          if (Math.abs(vocab.length - key.length) > 2) continue;
          const d = editDistance(key, vocab, 2);
          if (d <= 2) {
            const points = d === 1 ? 3 : 1.5;
            for (const id of index.byPhonetic.get(vocab) ?? [])
              award(id, points, "similar spelling");
            if (d < bestDist) {
              bestDist = d;
              bestKey = vocab;
            }
          }
        }
        if (bestKey && !index.byPhonetic.has(key)) {
          const sample = index.byPhonetic.get(bestKey)?.[0];
          const person = sample ? archive.people.get(sample) : undefined;
          if (person && !suggestion) {
            const words = fullName(person).split(" ");
            suggestion = words.find((w) => phoneticKey(w) === bestKey) ?? undefined;
          }
        }
      }
    }

    // Boost people whose surname matches a query token — surname queries are
    // the single most common thing a community archive gets asked.
    for (const token of queryTokens) {
      const key = phoneticKey(token);
      for (const [id, entry] of index.entries) {
        if (!candidateIds.has(id)) continue;
        if (entry.surnameKey === key) award(id, 4, "surname");
        if (entry.givenKey === key) award(id, 2, "given name");
      }
    }

    scored = [...scores.entries()]
      .map(([id, score]) => {
        const person = archive.people.get(id)!;
        const lineageId = archive.lineageOf.get(id);
        return {
          person,
          score,
          matchedOn: matchedOn.get(id) ?? "name",
          lineageId,
          lineageLabel: lineageId
            ? archive.lineages.get(lineageId)?.label
            : undefined,
        };
      })
      .filter((r) => r.score > 0);
  }

  // Sort.
  const byName = (a: SearchResult, b: SearchResult) =>
    fullName(a.person).localeCompare(fullName(b.person));
  switch (options.sort) {
    case "name":
      scored.sort(byName);
      break;
    case "oldest":
      scored.sort(
        (a, b) =>
          (birthYear(a.person) ?? 9999) - (birthYear(b.person) ?? 9999) ||
          byName(a, b),
      );
      break;
    case "newest":
      scored.sort(
        (a, b) =>
          (birthYear(b.person) ?? -9999) - (birthYear(a.person) ?? -9999) ||
          byName(a, b),
      );
      break;
    default:
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Prefer people with more recorded detail — a fuller record is more
        // likely to be the one the reader wanted.
        const detail = (r: SearchResult) =>
          (r.person.photo ? 2 : 0) +
          (r.person.bio ? 2 : 0) +
          (birthYear(r.person) ? 1 : 0) +
          (r.person.sources?.length ?? 0);
        return detail(b) - detail(a) || byName(a, b);
      });
  }

  return {
    results: scored.slice(offset, offset + limit),
    total: scored.length,
    facets: facetsFor(
      query ? scored.map((r) => r.person) : candidates,
      archive,
    ),
    suggestion,
  };
}

/** Lightweight type-ahead used by the header search box. */
export interface Suggestion {
  id: string;
  name: string;
  detail: string;
  kind: "person" | "surname" | "gotra" | "mool" | "lineage";
  href: string;
}

export function suggest(query: string, limit = 8): Suggestion[] {
  const q = query.trim();
  if (q.length < 2) return [];
  const archive = getArchive();
  const out: Suggestion[] = [];

  const people = search({ query: q, limit }).results;
  for (const r of people) {
    const years = [birthYear(r.person), deathYear(r.person)]
      .filter(Boolean)
      .join("–");
    out.push({
      id: r.person.id,
      name: fullName(r.person),
      detail: [years, r.lineageLabel].filter(Boolean).join(" · "),
      kind: "person",
      href: `/person/${r.person.id}`,
    });
  }

  const qKey = phoneticKey(q);
  for (const facet of archive.stats.bySurname.slice(0, 400)) {
    if (out.length >= limit + 4) break;
    if (phoneticKey(facet.id).startsWith(qKey)) {
      out.push({
        id: facet.id,
        name: facet.label,
        detail: `${facet.count} people · surname`,
        kind: "surname",
        href: `/search?surname=${encodeURIComponent(facet.id)}`,
      });
    }
  }

  return out.slice(0, limit + 4);
}
