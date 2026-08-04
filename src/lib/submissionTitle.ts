import { displayOf, describeDraft } from "./family.ts";
import type { FamilyDraft, Submission } from "./types.ts";

/**
 * What to call a submission on a review screen.
 *
 * Only one of the five kinds carries a name of its own. A new-person
 * submission has `displayName`; a correction deliberately does not — blanking
 * the name fields is how a contributor says "the name is fine, the date is
 * wrong" — and a story, a photograph and a joined relationship never had one.
 *
 * Both admin screens used to print `payload.displayName ?? "(no name given)"`,
 * so three kinds out of five arrived in the queue titled "(no name given)"
 * over a raw record id. A reviewer could not tell one from another without
 * opening each, which is the difference between a queue you can work through
 * and a queue you avoid. The subject of a correction is the record it points
 * at, so that is what it is called here.
 *
 * `targetName` is the display name of `submission.targetId`, looked up on the
 * server where the archive lives. Without it the id is still better than
 * nothing, so it degrades rather than failing.
 */
export function submissionTitle(
  submission: Submission,
  targetName?: string,
): string {
  const s = submission;

  if (s.kind === "family-tree" && Array.isArray(s.payload.people)) {
    const draft = s.payload as unknown as FamilyDraft;
    const first = draft.people[0];
    if (!first) return "An empty family";
    const head = displayOf(first) || sentenceCase(describeDraft(first, draft.people));
    return draft.people.length > 1
      ? `${head} and ${draft.people.length - 1} more`
      : head;
  }

  const named = typeof s.payload.displayName === "string"
    ? s.payload.displayName.trim()
    : "";
  if (named) return named;

  const about = targetName ?? s.targetId;
  if (!about) {
    // A new person with no name at all is a real submission and a real
    // problem — say which it is rather than implying every untitled card is
    // the same thing.
    return s.kind === "new-person" ? "A person, unnamed" : "Untitled submission";
  }

  switch (s.kind) {
    case "correction":
      return `Correction to ${about}`;
    case "story":
      return `A story about ${about}`;
    case "add-relationship":
      return `A relationship for ${about}`;
    case "photo":
      return `A photograph of ${about}`;
    default:
      return about;
  }
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
