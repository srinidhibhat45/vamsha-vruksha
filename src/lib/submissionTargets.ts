import { fullName, getArchive } from "./archive.ts";
import type { Submission } from "./types.ts";

/**
 * Display names for every record a batch of submissions points at.
 *
 * Kept out of submissionTitle.ts on purpose: that module is imported by the
 * review queue, which is a client component, and this one reaches into the
 * archive — which is read off the filesystem and must stay on the server. So
 * the lookup happens once per page, server-side, and the names are handed
 * down as plain data.
 *
 * A card that says "about kamath-kushasthali-0002" is asking a reviewer to
 * memorise record ids. This is what stops it.
 */
export function targetNames(submissions: Submission[]): Record<string, string> {
  const archive = getArchive();
  const out: Record<string, string> = {};
  for (const s of submissions) {
    if (!s.targetId || out[s.targetId]) continue;
    const person = archive.people.get(s.targetId);
    if (person) out[s.targetId] = fullName(person);
  }
  return out;
}
