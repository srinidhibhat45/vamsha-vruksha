import { fullName, getArchive, type Archive } from "./archive.ts";
import type { TreePerson, TreeSource } from "./layout.ts";

/**
 * Builds the payload the tree viewer runs on.
 *
 * The whole lineage goes to the browser in one shot rather than being paged in
 * as the reader expands branches. A lineage is a few hundred people; serialised
 * down to the fields a card actually shows, that is well under a hundred
 * kilobytes — cheaper than the two or three round trips a lazy-loading viewer
 * would make before the reader had finished their first click. In exchange,
 * re-rooting the tree on any person, switching between ancestor and descendant
 * views, and searching within the family are all instant and work offline.
 */

export interface TreePayload extends TreeSource {
  lineageId: string;
  lineageLabel: string;
  apexId: string;
  size: number;
  generations: number;
}

function toTreePerson(archive: Archive, id: string): TreePerson {
  const p = archive.people.get(id)!;
  const moolPlace = p.mool ? archive.places.get(p.mool) : undefined;
  return {
    id,
    name: fullName(p),
    given: p.name.given,
    surname: p.name.surname,
    gender: p.gender,
    birthYear: p.birth?.date?.year,
    deathYear: p.death?.date?.year,
    living: p.status === "living",
    epithet: p.epithet,
    gotra: p.gotra,
    gotraLabel: p.gotra ? archive.gotras.get(p.gotra)?.name : undefined,
    math: p.math,
    mool: p.mool,
    moolLabel: moolPlace?.name,
    kuladevata: p.kuladevata,
    kuladevataLabel: p.kuladevata
      ? archive.kuladevatas.get(p.kuladevata)?.name
      : undefined,
    photo: p.photo?.url,
    confidence: p.confidence,
    childCount: (archive.childrenOf.get(id) ?? []).length,
  };
}

export function buildTreePayload(lineageId: string): TreePayload | null {
  const archive = getArchive();
  const lineage = archive.lineages.get(lineageId);
  if (!lineage) return null;

  const people: Record<string, TreePerson> = {};
  const parents: Record<string, string[]> = {};
  const personUnions: Record<string, string[]> = {};
  const childUnion: Record<string, string> = {};
  const unions: TreePayload["unions"] = {};

  const memberSet = new Set(lineage.memberIds);

  for (const id of lineage.memberIds) {
    const p = archive.people.get(id);
    if (!p) continue;
    people[id] = toTreePerson(archive, id);

    const ps = [p.fatherId, p.motherId].filter(
      (x): x is string => !!x && memberSet.has(x),
    );
    if (ps.length) parents[id] = ps;

    const us = (archive.unionsOf.get(id) ?? []).filter((u) =>
      archive.unions.get(u)?.partners.some((q) => memberSet.has(q)),
    );
    if (us.length) personUnions[id] = us;

    const cu = archive.parentUnionOf.get(id);
    if (cu) childUnion[id] = cu;
  }

  for (const unionId of new Set(Object.values(personUnions).flat())) {
    const u = archive.unions.get(unionId);
    if (!u) continue;
    unions[unionId] = {
      id: u.id,
      partners: u.partners.filter((p) => memberSet.has(p)),
      childIds: u.childIds.filter((c) => memberSet.has(c)),
      status: u.status,
      year: u.date?.year,
      endYear: u.endDate?.year,
    };
  }

  return {
    people,
    unions,
    childUnion,
    personUnions,
    parents,
    lineageId: lineage.id,
    lineageLabel: lineage.label,
    apexId: lineage.apexId,
    size: lineage.size,
    generations: lineage.generations,
  };
}

/** The lineage a person belongs to, or the largest one as a default. */
export function resolveLineage(personId?: string): string | undefined {
  const archive = getArchive();
  if (personId) {
    const id = archive.lineageOf.get(personId);
    if (id) return id;
  }
  return archive.lineageList[0]?.id;
}
