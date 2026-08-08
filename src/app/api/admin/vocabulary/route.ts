import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/adminAuth";
import { getArchive } from "@/lib/archive";
import { retargetRef } from "@/lib/peopleStore";
import { approveEntry, removeEntry } from "@/lib/vocabStore";
import { PROPOSABLE_VOCABULARIES } from "@/lib/vocabulary";

export const dynamic = "force-dynamic";

/**
 * What a maintainer does with a name a contributor typed.
 *
 * Three answers, and the middle one is why this endpoint exists at all rather
 * than a checkbox on the entry:
 *
 *   confirm — the name is real. It joins the list everybody picks from, with
 *             whatever detail the maintainer has added.
 *   merge   — the name is a spelling of something already here. The entry goes
 *             away *and every record using it is repointed*, which is the half
 *             that cannot be done by hand without leaving orphans.
 *   discard — the value was noise. Records that carry it have the field
 *             cleared, so nothing is left pointing at a deleted id.
 */
const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("confirm"),
    vocabulary: z.enum(PROPOSABLE_VOCABULARIES),
    id: z.string().min(1).max(160),
    name: z.string().trim().min(1).max(160).optional(),
    devanagari: z.string().trim().max(200).optional(),
    note: z.string().trim().max(1000).optional(),
    region: z.string().trim().max(160).optional(),
    temple: z.string().trim().max(200).optional(),
    seat: z.string().trim().max(200).optional(),
    rishi: z.string().trim().max(160).optional(),
  }),
  z.object({
    action: z.literal("merge"),
    vocabulary: z.enum(PROPOSABLE_VOCABULARIES),
    id: z.string().min(1).max(160),
    into: z.string().min(1).max(160),
  }),
  z.object({
    action: z.literal("discard"),
    vocabulary: z.enum(PROPOSABLE_VOCABULARIES),
    id: z.string().min(1).max(160),
  }),
]);

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "That is not an action this screen can take",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    if (input.action === "confirm") {
      const { action: _a, vocabulary, id, ...patch } = input;
      const ok = await approveEntry(vocabulary, id, patch);
      return ok
        ? NextResponse.json({ ok: true, confirmed: id })
        : NextResponse.json({ error: "No such entry" }, { status: 404 });
    }

    if (input.action === "merge") {
      const archive = getArchive();
      const target = {
        gotras: archive.gotras,
        maths: archive.maths,
        communities: archive.communities,
        kuladevatas: archive.kuladevatas,
        places: archive.places,
      }[input.vocabulary].get(input.into);

      if (!target) {
        return NextResponse.json(
          { error: "The entry to merge into is not in the vocabulary" },
          { status: 400 },
        );
      }
      if (target.pending) {
        return NextResponse.json(
          { error: "Merge into a confirmed entry, not another proposal" },
          { status: 400 },
        );
      }

      // Records first: an entry removed before the records that use it are
      // moved leaves those records pointing at nothing for as long as the
      // second write takes, and at nothing permanently if it fails.
      const { changed } = await retargetRef(input.vocabulary, input.id, input.into);
      await removeEntry(input.vocabulary, input.id);
      return NextResponse.json({ ok: true, merged: changed.length });
    }

    const { changed } = await retargetRef(input.vocabulary, input.id, null);
    await removeEntry(input.vocabulary, input.id);
    return NextResponse.json({ ok: true, cleared: changed.length });
  } catch (error) {
    console.error("[admin/vocabulary] write failed", error);
    return NextResponse.json(
      { error: "The archive could not save that. Try again shortly." },
      { status: 502 },
    );
  }
}
