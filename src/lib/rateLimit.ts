/**
 * A simple in-memory, per-process, sliding-window rate limiter.
 *
 * This site takes writes from anyone with no account — that is the point of
 * it — which means the usual defence against abuse (throttle a logged-in
 * user) is not available. What is here instead: count requests per IP inside
 * a time window and refuse once a request crosses the limit.
 *
 * Two honest limitations, both accepted rather than solved:
 *
 * 1. It is per warm function instance, with no shared store behind it. A
 *    Netlify deployment can run several instances at once, so a determined,
 *    distributed attacker is not meaningfully slowed by this. What it does
 *    stop is the far more common case for a community archive with no
 *    login: one script or one bad actor hammering an endpoint from one
 *    machine.
 * 2. A cold start clears every counter. Same trade as the admin login
 *    throttle this is modelled on (see adminAuth.ts / api/admin/login) — an
 *    attacker who can force cold starts on demand has other problems to
 *    exploit first.
 *
 * A real deployment that outgrows this should put a proper edge-level rate
 * limit in front (Netlify's own, or a WAF) rather than trying to make this
 * module distributed — that is a job for infrastructure, not application code.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimiter {
  /** True if this call is allowed; false if the caller is over the limit. */
  check(key: string): boolean;
}

export function createRateLimiter(opts: {
  windowMs: number;
  max: number;
}): RateLimiter {
  const buckets = new Map<string, Bucket>();

  // Bound the map itself, not just what counts as "recent" — otherwise a
  // botnet with one request per distinct forged IP grows this map forever
  // rather than tripping the per-key limit.
  const MAX_TRACKED_KEYS = 5000;

  return {
    check(key: string): boolean {
      const now = Date.now();
      const bucket = buckets.get(key);

      if (!bucket || now - bucket.windowStart > opts.windowMs) {
        if (!bucket && buckets.size >= MAX_TRACKED_KEYS) {
          // Drop the oldest-looking entry rather than grow unbounded. This is
          // a blunt LRU-ish eviction, not a precise one — precision here
          // buys nothing a determined attacker cares about.
          const oldest = buckets.keys().next().value;
          if (oldest !== undefined) buckets.delete(oldest);
        }
        buckets.set(key, { count: 1, windowStart: now });
        return true;
      }

      bucket.count += 1;
      return bucket.count <= opts.max;
    },
  };
}

/** The caller's IP, trusting the CDN's forwarded-for header — Netlify sets
 *  it on every request and it cannot be spoofed past the edge. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}

export function rateLimitResponse(retryAfterSeconds = 60) {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Wait a few minutes and try again.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}
