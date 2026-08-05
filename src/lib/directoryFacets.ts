/**
 * The five indexes under /directory/[facet].
 *
 * Lives here rather than inside the page itself so that sitemap.ts can list
 * every facet route without importing a page component's module graph just
 * to reach one constant off it.
 */
export const DIRECTORY_FACETS = {
  surname: {
    title: "Surnames",
    konkani: "आडनांव",
    param: "surname",
    intro:
      "Two patterns dominate. Office-names — Kamath, Shanbhag, Nadkarni, Hegde — record a hereditary post in village administration or the temple. Village-names — Kaikini, Hattangadi, Padukone, Basrur — record where the family lived, and in some communities are the rule almost without exception. The notes below are the derivations current among the families who carry each name; several are folk etymology and should be read as tradition rather than as evidence.",
  },
  gotra: {
    title: "Gotras",
    konkani: "गोत्र",
    param: "gotra",
    intro:
      "A gotra names the rishi a patriline descends from. It passes from father to child and is never changed by marriage, which is what makes it useful across centuries: a woman's gotra in a record still identifies the family she was born into, long after her surname stopped being used. Pravara lists follow the commonest form — confirm yours with your own matha or purohit, as recensions differ.",
  },
  kuladevata: {
    title: "Kuladevatas",
    konkani: "कुलदेवता",
    param: "kuladevata",
    intro:
      "The deity a household turns to first. Many of the temples named here are in Goa, and many of those images were carried inland to Ponda and Bicholim in the sixteenth and seventeenth centuries, ahead of the destruction of temples in the Old Conquests. A family that has forgotten its village usually has not forgotten its deity.",
  },
  mool: {
    title: "Mool villages",
    konkani: "मूळ गांव",
    param: "mool",
    intro:
      "The ancestral village. Families that left Goa for the Karavali coast, and later for Bombay and beyond, kept naming the village they came from for generations after anyone had seen it.",
  },
  math: {
    title: "Mathas",
    konkani: "मठ",
    param: "math",
    intro:
      "The monastic seat a family owes allegiance to. Where it applies it divides families more sharply than region or surname does: Vaishnava households of the Kashi and Partagali seats and Smarta households of Kavale may share a village and a surname and still keep separate ritual. Plenty of families name no matha at all.",
  },
  community: {
    title: "Communities",
    konkani: "समाज",
    param: "community",
    intro:
      "Every community named by a family in this archive, in alphabetical order and with no order of precedence. The boundaries between them are historically fluid and locally contested; this archive records what a family says about itself rather than adjudicating.",
  },
} as const;

export type DirectoryFacetKey = keyof typeof DIRECTORY_FACETS;

export const DIRECTORY_FACET_KEYS = Object.keys(
  DIRECTORY_FACETS,
) as DirectoryFacetKey[];
