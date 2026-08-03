/**
 * Routes that still have to be rendered per request, because their content is
 * decided by the query string: which lineage the tree is showing, what was
 * searched for, which two people are being related. Everything else in the
 * public site is prerendered at build time and served as a file.
 */
const ON_DEMAND_ROUTES = ["/tree", "/search", "/relate"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The lineage graph is loaded once into module scope on the server.
    largePageDataBytes: 8 * 1024 * 1024,
  },

  async headers() {
    return [
      {
        source: `/:path(${ON_DEMAND_ROUTES.map((r) => r.slice(1)).join("|")})`,
        headers: [
          /*
            Let the CDN hold these, and let it answer from the held copy
            while it refreshes in the background. Without this, every
            reader who opens the same family tree pays for a fresh
            serverless invocation of a page whose content did not change
            between them.

            Safe because records are not a live database: they live in
            data/people/*.json and only change when a maintainer commits,
            which means a deploy, which purges the cache. The archive
            cannot be more stale than the last build.

            Netlify-CDN-Cache-Control governs the edge; the plain header
            keeps browsers revalidating, so a reader who returns to a tree
            after a deploy sees the new records rather than their own
            stale copy of them.
          */
          {
            key: "Netlify-CDN-Cache-Control",
            value: "public, s-maxage=300, stale-while-revalidate=86400",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
