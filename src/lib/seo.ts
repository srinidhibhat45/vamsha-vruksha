/**
 * Where this deployment is reachable — the one fact every canonical URL,
 * sitemap entry, robots directive and piece of structured data needs and
 * none of them should hardcode separately.
 *
 * Falls back to the Netlify-assigned URL (set automatically on every deploy)
 * so a preview or a not-yet-custom-domained deployment still emits correct,
 * if throwaway, URLs rather than broken ones — only the real production
 * domain needs NEXT_PUBLIC_SITE_URL set explicitly.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL || // Netlify sets this to the primary site URL at build time.
  "http://localhost:3000"
).replace(/\/+$/, "");

export const SITE_NAME = "Vansh Vriksha";

export const SITE_DESCRIPTION =
  "A public, community-built family tree and archive, open to every family and every community. Free to read, free to search, and no account needed to contribute.";
