import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/adminAuth";
import { PersonInputSchema, createPerson } from "@/lib/peopleStore";
import { createVocabResolver, resolvePersonRefs } from "@/lib/vocabStore";

export const dynamic = "force-dynamic";

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

  const parsed = PersonInputSchema.safeParse(body);
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

  try {
    // A gotra or village the maintainer typed rather than picked becomes a
    // real id here — matched onto the vocabulary where possible, otherwise
    // added to it as a pending entry for /admin/vocabulary.
    const person = await createPerson(
      await resolvePersonRefs(parsed.data, createVocabResolver("Archive maintainer")),
    );
    return NextResponse.json({ ok: true, person });
  } catch (error) {
    // Almost always the git backend rejecting or failing the commit — see
    // the equivalent catch in api/admin/family for why this is reported
    // rather than left to propagate.
    console.error("[admin/people] create failed", error);
    return NextResponse.json(
      { error: "The archive could not save this record. Try again shortly." },
      { status: 502 },
    );
  }
}
