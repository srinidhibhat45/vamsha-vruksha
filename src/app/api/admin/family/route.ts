import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { getArchive } from "@/lib/archive";
import { FamilyDraftSchema, checkDraft, topoOrder } from "@/lib/family";
import { PersonInputSchema, createFamily } from "@/lib/peopleStore";
import { draftToMember } from "@/lib/promote";
import { createVocabResolver } from "@/lib/vocabStore";

export const dynamic = "force-dynamic";

/**
 * A maintainer entering a whole family, written straight to the archive.
 *
 * The same draft shape the public form submits, minus the queue: a maintainer
 * is the person the queue exists to route submissions *to*, so making them
 * approve their own typing would be theatre. The coherence check is not
 * skipped with it — being trusted about who is related to whom is not the same
 * as being immune to entering a birth year with the digits transposed.
 */
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

  const parsed = FamilyDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Some fields need attention",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  const archive = getArchive();
  const problems = checkDraft(parsed.data, (id) => archive.people.has(id));
  const errors = problems.filter((p) => p.severity === "error");
  if (errors.length) {
    return NextResponse.json(
      {
        error: "The family as entered contradicts itself",
        issues: errors.map((p) => ({ path: p.key ?? "", message: p.message })),
      },
      { status: 400 },
    );
  }

  const ordered = topoOrder(parsed.data.people);
  // Shared across the family, so a gotra proposed on four brothers becomes one
  // pending vocabulary entry rather than four. Resolved one row at a time —
  // see the note on VocabResolver in vocabStore.ts.
  const vocab = createVocabResolver("Archive maintainer");
  const members = [];
  for (const p of ordered) {
    members.push(await draftToMember(p, parsed.data.sources, vocab));
  }

  for (const m of members) {
    if (m.existingId) continue;
    const check = PersonInputSchema.safeParse(m.input);
    if (!check.success) {
      return NextResponse.json(
        {
          error: "Some fields need attention",
          issues: check.error.issues.map((i) => ({
            path: `${m.input.name?.given || m.key}.${i.path.join(".")}`,
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }
    m.input = check.data;
  }

  const written = await createFamily(members);

  return NextResponse.json({
    ok: true,
    ids: written.ids,
    created: written.created,
    updated: written.updated,
    warnings: problems
      .filter((p) => p.severity === "warning")
      .map((p) => p.message),
  });
}
