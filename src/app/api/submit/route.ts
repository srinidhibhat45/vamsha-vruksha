import { NextResponse } from "next/server";
import { z } from "zod";
import { appendSubmission } from "@/lib/submissions";
import { getArchive, fullName, birthYear } from "@/lib/archive";
import { nameSimilarity } from "@/lib/translit";

export const dynamic = "force-dynamic";

const SubmissionSchema = z.object({
  kind: z.enum(["new-person", "correction", "add-relationship", "story", "photo"]),
  targetId: z.string().max(120).optional(),
  message: z.string().max(4000).optional(),
  payload: z.record(z.unknown()),
  submitter: z.object({
    name: z.string().min(1, "Please give a name we can credit").max(120),
    email: z.string().email("That does not look like an email address").max(160).optional().or(z.literal("")),
    relationship: z.string().max(200).optional(),
    consent: z.literal(true, {
      errorMap: () => ({ message: "Please confirm the consent statement" }),
    }),
  }),
  /** Honeypot: a real person never fills this in. */
  website: z.string().max(0).optional(),
});

/** People already in the archive who look like the one being submitted. */
function findPossibleDuplicates(name: string, birth?: number) {
  if (!name || name.trim().length < 3) return [];
  const archive = getArchive();
  const scored = archive.personList
    .map((p) => {
      let score = nameSimilarity(name, fullName(p));
      const y = birthYear(p);
      // A matching birth year is strong corroboration; a clashing one is
      // strong evidence these are different people with a shared family name.
      if (birth && y) {
        const gap = Math.abs(birth - y);
        if (gap <= 2) score += 0.25;
        else if (gap > 15) score -= 0.3;
      }
      return { p, score };
    })
    .filter((x) => x.score >= 0.72)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored.map(({ p, score }) => ({
    id: p.id,
    name: fullName(p),
    birthYear: birthYear(p),
    confidence: Math.round(Math.min(1, score) * 100),
  }));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = SubmissionSchema.safeParse(body);
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

  const data = parsed.data;
  if (data.website) {
    // Honeypot tripped. Answer as though it succeeded so the bot does not
    // learn anything, but write nothing.
    return NextResponse.json({ ok: true, id: "ignored", duplicates: [] });
  }

  if (data.targetId && !getArchive().people.has(data.targetId)) {
    return NextResponse.json(
      { error: "The record being corrected no longer exists" },
      { status: 400 },
    );
  }

  const record = appendSubmission({
    kind: data.kind,
    targetId: data.targetId,
    message: data.message,
    payload: data.payload,
    submitter: {
      name: data.submitter.name,
      email: data.submitter.email || undefined,
      relationship: data.submitter.relationship,
      consent: data.submitter.consent,
    },
  });

  const name =
    typeof data.payload.displayName === "string"
      ? data.payload.displayName
      : [data.payload.given, data.payload.surname].filter(Boolean).join(" ");
  const birth =
    typeof data.payload.birthYear === "number"
      ? data.payload.birthYear
      : Number(data.payload.birthYear) || undefined;

  return NextResponse.json({
    ok: true,
    id: record.id,
    // Surfaced back to the contributor so they can tell us it is the same
    // person before a moderator has to work it out from scratch.
    duplicates:
      data.kind === "new-person" ? findPossibleDuplicates(name, birth) : [],
  });
}
