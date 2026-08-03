import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  checkPassword,
  issueSession,
  sessionCookieOptions,
} from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

/**
 * Attempt throttling.
 *
 * One account, one password, and a login form on a public URL is a
 * guessing target. Held in memory rather than in a store because the point is
 * to make an online guessing run slow, and a process restart clearing the
 * counter costs an attacker more than it costs us.
 */
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; first: number }>();

function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.first > ATTEMPT_WINDOW_MS) return false;
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now - record.first > ATTEMPT_WINDOW_MS) {
    attempts.set(ip, { count: 1, first: now });
  } else {
    record.count++;
  }
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (tooManyAttempts(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a username and a password" },
      { status: 400 },
    );
  }

  if (!checkPassword(parsed.data.username, parsed.data.password)) {
    recordFailure(ip);
    // One message for both fields: saying which half was wrong tells an
    // attacker they have found the username.
    return NextResponse.json(
      { error: "That username and password do not match" },
      { status: 401 },
    );
  }

  attempts.delete(ip);

  const session = issueSession();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    session.value,
    sessionCookieOptions(session.maxAge),
  );
  return response;
}
