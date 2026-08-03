import { getArchive } from "./archive.ts";
import type { ContributeRefs } from "@/components/ContributeForm";

/**
 * The controlled vocabularies, shaped for a dropdown.
 *
 * Both the public contribute form and the maintainer's editor offer the same
 * lists, and they have to stay the same lists: the moment the admin can pick a
 * gotra the contribute form cannot, corrections start creating directory
 * entries that no submission can ever match.
 *
 * Entries a contributor proposed and no maintainer has confirmed are filtered
 * out here, and that filter is the whole reason proposing is safe to allow. A
 * misspelling somebody typed into the gotra box is still recorded against
 * their own family — nothing is lost — but it does not become an option the
 * next thousand contributors can pick by mistake, which is how a controlled
 * vocabulary decays into an uncontrolled one. Confirming an entry is one press
 * on /admin/vocabulary.
 */
export function buildRefs(): ContributeRefs {
  const archive = getArchive();

  const confirmed = <T extends { pending?: boolean }>(items: Iterable<T>) =>
    [...items].filter((i) => !i.pending);

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
    gotras: confirmed(archive.gotras.values()).map((g) => ({
      id: g.id,
      label: g.name,
    })),
    maths: confirmed(archive.maths.values()).map((m) => ({
      id: m.id,
      label: m.name,
    })),
    communities: confirmed(archive.communities.values()).map((c) => ({
      id: c.id,
      label: c.name,
    })),
    kuladevatas: confirmed(archive.kuladevatas.values()).map((k) => ({
      id: k.id,
      label: k.name,
    })),
    places: confirmed(archive.places.values()).map((p) => ({
      id: p.id,
      label: placeLabel(p),
    })),
    moolPlaces: confirmed(archive.places.values())
      .filter((p) => p.kind === "mool" || p.kind === "settlement")
      .map((p) => ({
        id: p.id,
        label: p.region ? `${p.name} — ${p.region}` : p.name,
      })),
  };
}
