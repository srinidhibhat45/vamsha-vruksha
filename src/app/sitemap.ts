import type { MetadataRoute } from "next";
import { getArchive } from "@/lib/archive";
import { SITE_URL } from "@/lib/seo";
import { DIRECTORY_FACET_KEYS } from "@/lib/directoryFacets";

/**
 * One sitemap, not a sitemap index.
 *
 * Next's route handler caps a single sitemap at 50,000 URLs; this archive is
 * currently a few thousand records, so a lineage growing tenfold still fits.
 * Revisit with `generateSitemaps` if the archive ever approaches that cap.
 *
 * Every URL here is either fully static or prerendered via
 * `generateStaticParams` (person pages, directory facets) — see routes.ts and
 * AppLink.tsx for which routes are *not* prerendered, which is exactly why
 * `/search`, `/tree` and `/relate` appear below only as their bare,
 * query-free paths: a crawler gains nothing from a URL this site would only
 * answer with a serverless render of the same shell.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const archive = getArchive();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/search`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/tree`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/relate`, lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/lineages`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE_URL}/diaspora`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/directory`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/contribute`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const directoryRoutes: MetadataRoute.Sitemap = DIRECTORY_FACET_KEYS.map((facet) => ({
    url: `${SITE_URL}/directory/${facet}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const personRoutes: MetadataRoute.Sitemap = archive.personList.map((p) => ({
    url: `${SITE_URL}/person/${p.id}`,
    lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
    changeFrequency: "monthly",
    priority: 0.4,
  }));

  return [...staticRoutes, ...directoryRoutes, ...personRoutes];
}
