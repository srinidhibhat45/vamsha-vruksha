import { NextResponse } from "next/server";
import { z } from "zod";
import { findMatches } from "@/lib/match";
import { clientIp, createRateLimiter, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Fired on every keystroke while a contributor fills in a name, so the limit
// is per-minute rather than per-ten-minutes and generous enough that normal
// typing never touches it.
const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

/**
 * "Is this person already in the archive?", asked while somebody types.
 *
 * A POST rather than a GET because the question is a dozen fields wide — a
 * name, a year, a gotra, a mool, the father's name — and cramming that into a
 * query string to preserve an idea of REST purity would cost the one thing
 * that actually matters here, which is that the whole descriptor arrives in
 * one round trip while the contributor is still looking at the form.
 */
const DescriptorSchema = z.object({
  given: z.string().max(120).optional(),
  patronymic: z.string().max(120).optional(),
  surname: z.string().max(120).optional(),
  aka: z.array(z.string().max(120)).max(20).optional(),
  devanagari: z.string().max(200).optional(),

  birthYear: z.number().int().min(-3000).max(2200).optional(),
  deathYear: z.number().int().min(-3000).max(2200).optional(),

  gotra: z.string().max(120).optional(),
  mool: z.string().max(120).optional(),
  kuladevata: z.string().max(120).optional(),
  math: z.string().max(120).optional(),
  community: z.string().max(120).optional(),

  fatherName: z.string().max(200).optional(),
  motherName: z.string().max(200).optional(),
  spouseName: z.string().max(200).optional(),

  exclude: z.array(z.string().max(120)).max(80).optional(),
  limit: z.number().int().min(1).max(10).optional(),
});

export async function POST(request: Request) {
  if (!limiter.check(clientIp(request))) {
    return rateLimitResponse(60);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = DescriptorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { limit, ...desc } = parsed.data;

  // A name with nothing else to go on is search's job, not this one's.
  if (!desc.given?.trim() && !desc.surname?.trim()) {
    return NextResponse.json({ matches: [] });
  }

  return NextResponse.json({ matches: findMatches(desc, limit ?? 5) });
}
