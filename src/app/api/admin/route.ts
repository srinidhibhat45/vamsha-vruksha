import { NextResponse } from "next/server";
import { z } from "zod";
import { isReviewer, updateSubmission } from "@/lib/submissions";

export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  key: z.string().min(1),
  id: z.string().min(1),
  status: z.enum(["approved", "rejected", "merged", "pending"]),
  note: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
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

  if (!isReviewer(parsed.data.key)) {
    // Same response for a wrong key and an unset one, so probing the endpoint
    // reveals nothing about whether moderation is configured at all.
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  const updated = updateSubmission(parsed.data.id, {
    status: parsed.data.status,
    reviewerNote: parsed.data.note,
  });

  if (!updated) {
    return NextResponse.json({ error: "Unknown submission" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, submission: updated });
}
