import { getArchive } from "./archive.ts";
import type { ContributeRefs } from "@/components/ContributeForm";

/**
 * The controlled vocabularies, shaped for a dropdown.
 *
 * Both the public contribute form and the maintainer's editor offer the same
 * lists, and they have to stay the same lists: the moment the admin can pick a
 * gotra the contribute form cannot, corrections start creating directory
 * entries that no submission can ever match.
 */
export function buildRefs(): ContributeRefs {
  const archive = getArchive();

  const placeLabel = (p: {
    name: string;
    region?: string;
    country?: string;
  }) => {
    if (p.region) return `${p.name} — ${p.region}`;
    return p.country && p.country !== "India"
      ? `${p.name}, ${p.country}`
      : p.name;
  };

  return {
    gotras: [...archive.gotras.values()].map((g) => ({
      id: g.id,
      label: g.name,
    })),
    maths: [...archive.maths.values()].map((m) => ({ id: m.id, label: m.name })),
    communities: [...archive.communities.values()].map((c) => ({
      id: c.id,
      label: c.name,
    })),
    kuladevatas: [...archive.kuladevatas.values()].map((k) => ({
      id: k.id,
      label: k.name,
    })),
    places: [...archive.places.values()].map((p) => ({
      id: p.id,
      label: placeLabel(p),
    })),
    moolPlaces: [...archive.places.values()]
      .filter((p) => p.kind === "mool" || p.kind === "settlement")
      .map((p) => ({
        id: p.id,
        label: p.region ? `${p.name} — ${p.region}` : p.name,
      })),
  };
}
