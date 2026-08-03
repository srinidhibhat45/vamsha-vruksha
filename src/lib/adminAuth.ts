import crypto from "node:crypto";
import { cookies } from "next/headers";

/**
 * Access control for the maintainer's side of the archive.
 *
 * There is exactly one account. That is not a shortcut waiting to be replaced
 * by roles and invitations — it matches how a community archive is actually
 * kept. One or two people hold the keys, everyone else contributes through the
 * public form, and the audit trail lives in the submission log and in git
 * rather than in a users table.
 *
 * The session is a signed cookie rather than a server-side session store,
 * because the app holds no other mutable server state and adding one for a
 * single login would be the tail wagging the dog. The cookie carries an expiry
 * and an HMAC over it; nothing else. Tampering with either field invalidates
 * the signature, and there is nothing in the payload worth reading.
 */

export const SESSION_COOKIE = "vv_admin";

/** Twelve hours — long enough for an evening of review, short enough to matter. */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const DEFAULT_USERNAME = "admin";
export const DEFAULT_PASSWORD = "admin";

function credentials() {
  return {
    username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
    password: process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD,
  };
}

/**
 * True when the deployment is still running on the built-in admin/admin pair.
 * The dashboard says so out loud rather than letting it be forgotten.
 */
export function usingDefaultCredentials(): boolean {
  const { username, password } = credentials();
  return username === DEFAULT_USERNAME && password === DEFAULT_PASSWORD;
}

/**
 * The key the session cookie is signed with.
 *
 * Falling back to a value derived from the password means a deployment that
 * sets neither still gets a signature nobody can forge without knowing the
 * password — and changing the password invalidates every outstanding session,
 * which is the behaviour you want anyway.
 */
function signingKey(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    `vv:${credentials().username}:${credentials().password}`
  );
}

/** Constant-time compare that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(username: string, password: string): boolean {
  const expected = credentials();
  // Both compared, both in constant time, so a wrong username and a wrong
  // password are indistinguishable from the outside.
  const userOk = safeEqual(username.trim().toLowerCase(), expected.username.toLowerCase());
  const passOk = safeEqual(password, expected.password);
  return userOk && passOk;
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", signingKey())
    .update(payload)
    .digest("base64url");
}

export function issueSession(): { value: string; maxAge: number } {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return {
    value: `${payload}.${sign(payload)}`,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function verifySession(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/**
 * Whether the caller holds a valid session.
 *
 * Every admin page and every admin endpoint calls this. The check is not done
 * in middleware because signing runs on node:crypto, and keeping one code path
 * for both means there is no chance of a route being protected in middleware
 * but not in the handler that actually writes to disk.
 */
export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/** Cookie attributes shared by the login and logout routes. */
export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
