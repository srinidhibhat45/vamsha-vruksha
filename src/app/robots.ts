import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * The archive is public and search-indexed by design — see /about#privacy.
 * The only paths withheld from a crawler are the maintainer's own tools,
 * which already carry `robots: noindex` on their own metadata (see
 * admin/(secure)/layout.tsx) — disallowing them here too costs nothing and
 * means a crawler that ignores per-page meta still stays out.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
