import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/adminAuth";
import {
  PersonInputSchema,
  deletePerson,
  deletionImpact,
  markDeceased,
  markLiving,
  updatePerson,
} from "@/lib/peopleStore";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Replace a record wholesale from the editor. */
export async function PUT(request: Request, { params }: Context) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;

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

  if (parsed.data.fatherId === id || parsed.data.motherId === id) {
    return NextResponse.json(
      { error: "A person cannot be their own parent" },
      { status: 400 },
    );
  }
  if (parsed.data.spouses?.some((s) => s.personId === id)) {
    return NextResponse.json(
      { error: "A person cannot be married to themselves" },
      { status: 400 },
    );
  }

  const person = updatePerson(id, parsed.data);
  if (!person) {
    return NextResponse.json({ error: "No such record" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, person });
}

const StatusSchema = z.object({
  action: z.enum(["mark-deceased", "mark-living"]),
  year: z.number().int().min(-3000).max(2200).optional(),
  raw: z.string().max(120).optional(),
  placeLabel: z.string().max(160).optional(),
  note: z.string().max(600).optional(),
});

/** The one-click life-status changes, kept off the full editor. */
export async function PATCH(request: Request, { params }: Context) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = StatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const person =
    parsed.data.action === "mark-deceased"
      ? markDeceased(id, {
          year: parsed.data.year,
          raw: parsed.data.raw,
          placeLabel: parsed.data.placeLabel,
          note: parsed.data.note,
        })
      : markLiving(id);

  if (!person) {
    return NextResponse.json({ error: "No such record" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, person });
}

/**
 * Remove a record.
 *
 * Requires the caller to have seen the impact first: the client sends back the
 * number of links the deletion will sever, and a mismatch means the archive
 * changed under them — someone added a child to this person while the
 * confirmation dialog was open. Refusing is better than quietly orphaning them.
 */
export async function DELETE(request: Request, { params }: Context) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  const impact = deletionImpact(id);
  if (!impact) {
    return NextResponse.json({ error: "No such record" }, { status: 404 });
  }

  const expected = new URL(request.url).searchParams.get("links");
  const actual = impact.children.length + impact.spouses.length;
  if (expected !== null && Number(expected) !== actual) {
    return NextResponse.json(
      {
        error:
          "This record has changed since you opened it. Look again before deleting.",
        impact,
      },
      { status: 409 },
    );
  }

  const result = deletePerson(id);
  if (!result) {
    return NextResponse.json({ error: "No such record" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...result });
}
