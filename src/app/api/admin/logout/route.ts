import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  // Expiring rather than deleting, so a stale copy of the cookie in a shared
  // browser is overwritten rather than merely unset.
  response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
  return response;
}
