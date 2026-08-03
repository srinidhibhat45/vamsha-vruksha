import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/lib/adminAuth";
import { getSubmission, updateSubmission } from "@/lib/submissions";
import { publishSubmission } from "@/lib/promote";

export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  id: z.string().min(1).max(120),
  action: z.enum([
    /** Accept and write it into the archive in one step. */
    "approve",
    /** Accept the judgement but leave the writing for a hand-made commit. */
    "accept-only",
    "request-changes",
    "reject",
    /** Put a decided submission back in the queue. */
    "reopen",
  ]),
  note: z.string().max(2000).optional(),
});

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
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { id, action, note } = parsed.data;
  const submission = getSubmission(id);
  if (!submission) {
    return NextResponse.json({ error: "Unknown submission" }, { status: 404 });
  }

  if (action === "request-changes" && !note?.trim()) {
    // Sending something back without saying what is wrong wastes the
    // contributor's time and guarantees the same submission comes back.
    return NextResponse.json(
      { error: "Say what needs changing — the note is the whole point" },
      { status: 400 },
    );
  }

  if (action === "approve") {
    if (submission.appliedTo) {
      return NextResponse.json(
        { error: "This one has already been published" },
        { status: 409 },
      );
    }

    const result = publishSubmission(submission);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    const updated = updateSubmission(id, {
      status: "merged",
      reviewerNote: note,
      appliedTo: result.person.id,
      appliedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      submission: updated,
      person: { id: result.person.id, created: result.created },
    });
  }

  const status = {
    "accept-only": "approved",
    "request-changes": "changes-requested",
    reject: "rejected",
    reopen: "pending",
  }[action] as "approved" | "changes-requested" | "rejected" | "pending";

  const updated = updateSubmission(id, { status, reviewerNote: note });
  return NextResponse.json({ ok: true, submission: updated });
}
