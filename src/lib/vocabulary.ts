/**
 * Values a contributor typed themselves, in a field that normally holds an id.
 *
 * Gotra, kuladevata, matha, village and community are controlled vocabularies,
 * and that is what keeps "Bharadwaj" and "Bhāradvāja" from becoming two
 * directory pages. The cost of a controlled vocabulary is that it is never
 * complete: this archive lists sixty-odd gotras and there are more, the
 * kuladevata list is Goan and a Kanara family will name a temple that is not on
 * it, and the person who knows the missing name is precisely the contributor
 * standing in front of the empty dropdown. Forcing them to pick the nearest
 * wrong entry — which is what a closed list does — puts a falsehood in the
 * record and loses the true name for good.
 *
 * So a reference field carries either an id from the vocabulary or a proposal:
 * the words the contributor typed, prefixed. Nothing downstream has to guess
 * which it is looking at, the value survives review intact, and when the
 * submission is published the proposal is either matched onto an existing entry
 * — the common case, because most "new" names are a spelling the matcher
 * already knows — or added to the vocabulary as a pending entry for a
 * maintainer to fill out. Pending entries stay out of everybody else's
 * dropdown until that happens, so one person's typo cannot become sixty
 * people's option.
 */

export const PROPOSED_PREFIX = "new:";

export const PROPOSABLE_VOCABULARIES = [
  "gotras",
  "maths",
  "communities",
  "kuladevatas",
  "places",
] as const;

export type ProposableVocabulary = (typeof PROPOSABLE_VOCABULARIES)[number];

/** The reference fields on a person, and which list each draws from. */
export const FIELD_VOCABULARY = {
  gotra: "gotras",
  math: "maths",
  community: "communities",
  kuladevata: "kuladevatas",
  mool: "places",
  birthPlace: "places",
  deathPlace: "places",
} as const satisfies Record<string, ProposableVocabulary>;

export function makeProposedRef(label: string): string {
  return PROPOSED_PREFIX + label.trim();
}

export function isProposedRef(value: string | undefined): boolean {
  return !!value && value.startsWith(PROPOSED_PREFIX);
}

/** The words the contributor actually typed, without the marker. */
export function proposedLabel(value: string): string {
  return value.startsWith(PROPOSED_PREFIX)
    ? value.slice(PROPOSED_PREFIX.length).trim()
    : value;
}

/**
 * What to show for a reference value, whichever kind it is.
 *
 * `known` is the label from the vocabulary. A proposal reads as what was
 * typed; an id nobody recognises reads as itself rather than disappearing,
 * because a value in a record that the page refuses to display is how data
 * quietly goes missing.
 */
export function refDisplay(
  value: string | undefined,
  known?: (id: string) => string | undefined,
): string | undefined {
  if (!value) return undefined;
  if (isProposedRef(value)) return proposedLabel(value);
  return known?.(value) ?? value;
}
