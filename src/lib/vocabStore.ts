import fs from "node:fs";
import path from "node:path";
import { getArchive, invalidateArchive } from "./archive.ts";
import { resolveRef } from "./refmatch.ts";
import {
  isProposedRef,
  proposedLabel,
  type ProposableVocabulary,
} from "./vocabulary.ts";

/**
 * Turning a contributor's typed vocabulary value into an id.
 *
 * See lib/vocabulary.ts for why this exists at all. This module is the other
 * half: what happens to a `"new:Vishwakarma"` when a submission is actually
 * published.
 *
 * Two outcomes, tried in that order:
 *
 *   1. The name matches something already in the vocabulary — the common
 *      case, since most "new" names are a spelling the fuzzy matcher already
 *      knows under a different id. It resolves silently to that id; the
 *      contributor never has to know their spelling was slightly off.
 *
 *   2. Nothing matches, and a *pending* entry is created: a real row in
 *      data/reference/<vocabulary>.json, with `pending: true` and enough of
 *      what the contributor said to let a maintainer finish it. It is
 *      excluded from every dropdown until a maintainer clears the flag (see
 *      refs.ts), so one contributor's typo cannot appear as an option for the
 *      next thousand.
 *
 * Two proposals for the same name in one submission — a father and son both
 * getting "new:Vishwakarma" — must resolve to the *same* pending entry rather
 * than minting a duplicate each time a person record is built. That is what
 * the request-scoped cache below is for: call `createVocabResolver()` once per
 * submission and reuse the resolver across every person in it.
 */

const REFERENCE_DIR = path.join(process.cwd(), "data", "reference");

const FILE_OF: Record<ProposableVocabulary, string> = {
  gotras: "gotras.json",
  maths: "maths.json",
  communities: "communities.json",
  kuladevatas: "kuladevatas.json",
  places: "places.json",
};

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "entry"
  );
}

interface RefDoc {
  _readme?: string;
  items: { id: string; name: string; pending?: boolean }[];
}

function readDoc(vocabulary: ProposableVocabulary): RefDoc {
  const file = path.join(REFERENCE_DIR, FILE_OF[vocabulary]);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...parsed, items: parsed.items ?? [] };
  } catch {
    return { items: [] };
  }
}

function writeDoc(vocabulary: ProposableVocabulary, doc: RefDoc): void {
  const file = path.join(REFERENCE_DIR, FILE_OF[vocabulary]);
  const json = JSON.stringify(doc, null, 2) + "\n";
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, json, "utf8");
  fs.renameSync(tmp, file);
}

/**
 * Append a pending entry and return its id. Exported mainly for the admin
 * approval screen, which needs to write the *filled-in* version back once a
 * maintainer has supplied a proper devanagari spelling, a temple, a seat.
 */
export function addPendingEntry(
  vocabulary: ProposableVocabulary,
  label: string,
  meta?: { proposedBy?: string; note?: string },
): string {
  const doc = readDoc(vocabulary);
  const taken = new Set(doc.items.map((i) => i.id));

  let id = slugify(label);
  let n = 2;
  while (taken.has(id)) id = `${slugify(label)}-${n++}`;

  const entry: Record<string, unknown> = {
    id,
    name: label,
    pending: true,
  };
  if (meta?.proposedBy) entry.proposedBy = meta.proposedBy;
  if (meta?.note) entry.note = meta.note;

  doc.items.push(entry as RefDoc["items"][number]);
  writeDoc(vocabulary, doc);
  invalidateArchive();
  return id;
}

export type VocabResolver = (
  vocabulary: ProposableVocabulary,
  value: string | undefined,
) => string | undefined;

/**
 * A resolver scoped to one publish call. Matches against the vocabulary as it
 * stood when the resolver was created, plus anything *this* resolver has
 * itself just added — so a family draft that proposes the same new gotra for
 * six people creates one pending entry, not six.
 */
export function createVocabResolver(proposedBy?: string): VocabResolver {
  // label (lowercased) -> id, seeded from the archive and grown as proposals
  // in this call are minted.
  const known: Record<ProposableVocabulary, Map<string, string>> = {
    gotras: new Map(),
    maths: new Map(),
    communities: new Map(),
    kuladevatas: new Map(),
    places: new Map(),
  };

  const archive = getArchive();
  const seed = (vocabulary: ProposableVocabulary, map: Map<string, { id: string; name: string }>) => {
    for (const item of map.values()) {
      known[vocabulary].set(item.name.toLowerCase(), item.id);
    }
  };
  seed("gotras", archive.gotras);
  seed("maths", archive.maths);
  seed("communities", archive.communities);
  seed("kuladevatas", archive.kuladevatas);
  seed("places", archive.places);

  return (vocabulary, value) => {
    if (!value) return value;
    if (!isProposedRef(value)) return value;

    const label = proposedLabel(value);
    if (!label) return undefined;

    const cached = known[vocabulary].get(label.toLowerCase());
    if (cached) return cached;

    // Strict matching only: a name whose *spelling* the vocabulary already
    // recognises — an alias, an id, a transliteration that folds to the same
    // phonetic key — resolves silently, which is what keeps the directory from
    // filling up with near-duplicates of "Bharadwaja". Anything looser is a
    // guess, and a guess made here would overwrite what somebody typed with
    // something they did not. Those become proposals, and the guess is offered
    // to a maintainer as a merge suggestion instead.
    const match = resolveRef(vocabulary, label, { strict: true });
    if (match?.matched) {
      known[vocabulary].set(label.toLowerCase(), match.id);
      return match.id;
    }

    const id = addPendingEntry(vocabulary, label, { proposedBy });
    known[vocabulary].set(label.toLowerCase(), id);
    return id;
  };
}

/* ------------------------------------------------------------------ */
/* The maintainer's side                                               */
/* ------------------------------------------------------------------ */

export interface PendingEntry {
  vocabulary: ProposableVocabulary;
  id: string;
  name: string;
  proposedBy?: string;
  /** How many records already point at it. */
  uses: number;
  /**
   * Entries the fuzzy matcher thinks this might be a spelling of. The whole
   * point of the screen is the merge, so the candidates are computed for the
   * maintainer rather than left to them to hunt for.
   */
  nearby: { id: string; name: string }[];
}

const PERSON_FIELD: Record<ProposableVocabulary, keyof PersonRefFields> = {
  gotras: "gotra",
  maths: "math",
  communities: "community",
  kuladevatas: "kuladevata",
  places: "mool",
};

/** Every entry a contributor proposed and no maintainer has confirmed. */
export function listPending(): PendingEntry[] {
  const archive = getArchive();
  const maps: Record<
    ProposableVocabulary,
    Map<string, { id: string; name: string; pending?: boolean }>
  > = {
    gotras: archive.gotras,
    maths: archive.maths,
    communities: archive.communities,
    kuladevatas: archive.kuladevatas,
    places: archive.places,
  };

  const out: PendingEntry[] = [];

  for (const vocabulary of Object.keys(maps) as ProposableVocabulary[]) {
    const field = PERSON_FIELD[vocabulary];
    for (const item of maps[vocabulary].values()) {
      if (!item.pending) continue;

      let uses = 0;
      for (const person of archive.personList) {
        if ((person as unknown as Record<string, unknown>)[field] === item.id) {
          uses += 1;
        }
        if (vocabulary === "places") {
          if (person.birth?.place?.id === item.id) uses += 1;
          if (person.death?.place?.id === item.id) uses += 1;
          if (person.residences?.some((r) => r.id === item.id)) uses += 1;
        }
      }

      // Compare against the confirmed entries only — a suggestion to merge one
      // pending entry into another pending one helps nobody.
      const nearby = [...maps[vocabulary].values()]
        .filter((other) => !other.pending && other.id !== item.id)
        .filter((other) => {
          const match = resolveRef(vocabulary, item.name);
          return match?.matched && match.id === other.id;
        })
        .map((other) => ({ id: other.id, name: other.name }));

      out.push({
        vocabulary,
        id: item.id,
        name: item.name,
        proposedBy: (item as { proposedBy?: string }).proposedBy,
        uses,
        nearby,
      });
    }
  }

  return out;
}

/**
 * Confirm an entry, with whatever a maintainer has filled in.
 *
 * Clearing `pending` is what puts it in everybody's dropdown, so it is the one
 * change that cannot be made by anybody but a maintainer.
 */
export function approveEntry(
  vocabulary: ProposableVocabulary,
  id: string,
  patch: Record<string, unknown> = {},
): boolean {
  const doc = readDoc(vocabulary);
  const index = doc.items.findIndex((i) => i.id === id);
  if (index === -1) return false;

  const { pending: _pending, proposedBy: _proposedBy, ...kept } = doc.items[
    index
  ] as Record<string, unknown>;

  const cleaned: Record<string, unknown> = { ...kept };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === "" || value === null) continue;
    cleaned[key] = value;
  }

  doc.items[index] = cleaned as RefDoc["items"][number];
  writeDoc(vocabulary, doc);
  invalidateArchive();
  return true;
}

/** Drop an entry from the vocabulary file. Records are retargeted separately. */
export function removeEntry(
  vocabulary: ProposableVocabulary,
  id: string,
): boolean {
  const doc = readDoc(vocabulary);
  const next = doc.items.filter((i) => i.id !== id);
  if (next.length === doc.items.length) return false;
  writeDoc(vocabulary, { ...doc, items: next });
  invalidateArchive();
  return true;
}

/** A record's reference fields, as they arrive from an editor form. */
interface PersonRefFields {
  gotra?: string;
  community?: string;
  math?: string;
  kuladevata?: string;
  mool?: string;
  birth?: { place?: { id?: string; label?: string } } & Record<string, unknown>;
  death?: { place?: { id?: string; label?: string } } & Record<string, unknown>;
  residences?: { id?: string; label?: string }[];
}

/**
 * Resolve every proposal on a person record in one pass.
 *
 * Used by the maintainer's own editor, which posts a whole Person rather than
 * a submission payload. A maintainer typing a gotra that is not on the list is
 * doing the same thing a contributor does, and it lands in the same place —
 * pending, on the approval screen — because being trusted about *what* a
 * family's gotra is called is not the same as having supplied its pravara.
 */
export function resolvePersonRefs<T extends PersonRefFields>(
  input: T,
  vocab: VocabResolver,
): T {
  const placeRef = (ref: { id?: string; label?: string } | undefined) => {
    if (!ref?.id) return ref;
    return { ...ref, id: vocab("places", ref.id) };
  };

  return {
    ...input,
    gotra: vocab("gotras", input.gotra),
    community: vocab("communities", input.community),
    math: vocab("maths", input.math),
    kuladevata: vocab("kuladevatas", input.kuladevata),
    mool: vocab("places", input.mool),
    birth: input.birth
      ? { ...input.birth, place: placeRef(input.birth.place) }
      : input.birth,
    death: input.death
      ? { ...input.death, place: placeRef(input.death.place) }
      : input.death,
    residences: input.residences?.map((r) => placeRef(r) ?? r),
  };
}
