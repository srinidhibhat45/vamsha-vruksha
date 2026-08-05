import { NextResponse } from "next/server";
import { z } from "zod";
import { appendSubmission } from "@/lib/submissions";
import { getArchive } from "@/lib/archive";
import { findMatches } from "@/lib/match";
import { FamilyDraftSchema, checkDraft, displayOf } from "@/lib/family";
import { clientIp, createRateLimiter, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// A contributor entering a whole family in one sitting submits once; someone
// working through several corrections in an evening submits a handful of
// times. 15 in 10 minutes covers both comfortably while still bounding a
// script that would otherwise flood the moderation queue.
const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 15 });

const SubmissionSchema = z.object({
  kind: z.enum([
    "new-person",
    "correction",
    "add-relationship",
    "story",
    "photo",
    "family-tree",
  ]),
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

/**
 * People already in the archive who look like the one being submitted.
 *
 * Delegated to lib/match.ts rather than scored here. The version that used to
 * live in this file compared full names and nudged for a close birth year,
 * which reported *Anandibai Kamath* as a 75% match for *Vasudev Kamath* — same
 * surname, born a year apart, nothing else in common. A warning that fires on
 * pairs like that is worse than none: reviewers learn to scroll past it, and
 * the real duplicate two lines below goes with it.
 */
function findPossibleDuplicates(
  desc: Parameters<typeof findMatches>[0],
  limit = 5,
) {
  return findMatches(desc, limit).map((m) => ({
    id: m.id,
    name: m.name,
    detail: m.detail,
    reasons: m.reasons,
    confidence: m.score,
  }));
}

export async function POST(request: Request) {
  if (!limiter.check(clientIp(request))) {
    return rateLimitResponse(600);
  }

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

  /*
   * A family draft is checked here rather than only at publication, because
   * the contributor is still at the keyboard. Telling somebody who has just
   * typed in four generations that the eldest son is born before his father is
   * useful now and useless in three weeks, when a moderator finds it and has
   * nobody left to ask.
   */
  if (data.kind === "family-tree") {
    const draft = FamilyDraftSchema.safeParse(data.payload);
    if (!draft.success) {
      return NextResponse.json(
        {
          error: "Some fields need attention",
          issues: draft.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const archive = getArchive();
    const problems = checkDraft(draft.data, (id) => archive.people.has(id));
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

    const record = await appendSubmission({
      kind: data.kind,
      message: data.message,
      payload: draft.data,
      submitter: {
        name: data.submitter.name,
        email: data.submitter.email || undefined,
        relationship: data.submitter.relationship,
        consent: data.submitter.consent,
      },
    });

    // Duplicates are reported per person: a draft of thirty where one is
    // already here needs to say *which* one. Rows the contributor already
    // linked are skipped — that question is answered for them.
    const linked = draft.data.people
      .map((p) => p.existingId)
      .filter((id): id is string => !!id);

    const byKey = new Map(draft.data.people.map((p) => [p.key, p]));
    const nameOf = (ref?: string) => {
      const found = ref ? byKey.get(ref) : undefined;
      return found ? displayOf(found) : undefined;
    };

    const duplicates = draft.data.people
      .filter((p) => !p.existingId)
      .flatMap((p) => {
        const matches = findPossibleDuplicates(
          {
            given: p.given,
            patronymic: p.patronymic,
            surname: p.surname,
            aka: p.aka,
            devanagari: p.devanagari,
            birthYear: p.birthYear,
            deathYear: p.deathYear,
            gotra: p.gotra,
            mool: p.mool,
            kuladevata: p.kuladevata,
            math: p.math,
            community: p.community,
            fatherName: nameOf(p.fatherKey),
            motherName: nameOf(p.motherKey),
            spouseName: nameOf(p.spouseKeys?.[0]?.key),
            exclude: linked,
          },
          3,
        );
        return matches.length
          ? [{ key: p.key, name: displayOf(p), matches }]
          : [];
      })
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      id: record.id,
      people: draft.data.people.length,
      warnings: problems
        .filter((p) => p.severity === "warning")
        .map((p) => p.message),
      familyDuplicates: duplicates,
      duplicates: [],
    });
  }

  const record = await appendSubmission({
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

  const text = (key: string) => {
    const v = data.payload[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const year = (key: string) => {
    const v = data.payload[key];
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n !== 0 ? n : undefined;
  };

  return NextResponse.json({
    ok: true,
    id: record.id,
    // Surfaced back to the contributor so they can tell us it is the same
    // person before a moderator has to work it out from scratch.
    duplicates:
      data.kind === "new-person"
        ? findPossibleDuplicates({
            given: text("given") ?? text("displayName"),
            patronymic: text("patronymic"),
            surname: text("surname"),
            aka: Array.isArray(data.payload.aka)
              ? (data.payload.aka as unknown[]).filter(
                  (x): x is string => typeof x === "string",
                )
              : undefined,
            devanagari: text("devanagari"),
            birthYear: year("birthYear"),
            deathYear: year("deathYear"),
            gotra: text("gotra"),
            mool: text("mool"),
            kuladevata: text("kuladevata"),
            math: text("math"),
            community: text("community"),
            fatherName: text("fatherName"),
            motherName: text("motherName"),
            spouseName: text("spouseName"),
          })
        : [],
  });
}
