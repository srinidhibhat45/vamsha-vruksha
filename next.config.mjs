/**
 * Routes that still have to be rendered per request, because their content is
 * decided by the query string: which lineage the tree is showing, what was
 * searched for, which two people are being related. Everything else in the
 * public site is prerendered at build time and served as a file.
 */
const ON_DEMAND_ROUTES = ["/tree", "/search", "/relate", "/contribute"];

/**
 * A conservative Content-Security-Policy.
 *
 * There is no middleware in this app on purpose — see routes.ts and
 * AppLink.tsx: nearly the whole public site is prerendered and served as a
 * static file, and middleware would turn every one of those requests into an
 * edge function invocation, which is exactly the per-page-load cost that
 * design avoids. That rules out the nonce-based CSP Next.js documents for its
 * App Router streaming scripts (verified against a production build: with a
 * bare `script-src 'self'`, the browser blocks Next's own inline hydration
 * scripts, one differently-hashed inline script per boundary, which cannot be
 * allow-listed with a static hash since the content differs per page and per
 * render). `'unsafe-inline'` on script-src is the accepted trade-off rather
 * than reversing that architectural decision. It costs less than it would in
 * a typical app: the only `dangerouslySetInnerHTML` in the codebase is
 * JsonLd.tsx, which serialises data this app already computed (never raw
 * user input) into a `application/ld+json` tag, and React otherwise never
 * renders user content as executable markup or inline event-handler
 * attributes — so the main thing left for `script-src` to gate, an
 * attacker's own `<script>` tag landing in the page, was already unreachable
 * through this app's own rendering. Revisit this if middleware is ever added
 * for another reason.
 *
 * Inline `style` attributes are genuinely used — the tree canvas, the
 * ornamental glyphs and a few data-driven colour swatches all set
 * `style={{ ... }}` — so `style-src` carries `'unsafe-inline'` too.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt-and-braces alongside frame-ancestors above, for the handful of older
  // browsers that read this and not CSP.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing on this site uses any of these; refusing them outright means a
  // future dependency cannot start asking for them either.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // TLS is terminated at the edge and only ever served over https, so this
  // is safe to send unconditionally rather than gated on NODE_ENV — `next
  // dev` on plain http simply never reaches a browser that had cause to
  // remember it.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

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
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        source: `/:path(${ON_DEMAND_ROUTES.map((r) => r.slice(1)).join("|")})`,
        headers: [
          /*
            Let the CDN (Vercel, Cloudflare, Netlify) hold these at the edge.
            Without Vercel-CDN-Cache-Control and CDN-Cache-Control, Vercel
            invokes a Serverless Function (Compute) for every single request,
            transferring hundreds of kilobytes of un-cached RSC payload and
            eating up free Vercel Fast Data Transfer / Compute bandwidth.

            Records only change when a commit/deploy occurs, which automatically
            purges the Vercel CDN cache.
          */
          {
            key: "CDN-Cache-Control",
            value: "public, s-maxage=86400, stale-while-revalidate=604800",
          },
          {
            key: "Vercel-CDN-Cache-Control",
            value: "public, s-maxage=86400, stale-while-revalidate=604800",
          },
          {
            key: "Netlify-CDN-Cache-Control",
            value: "public, s-maxage=86400, stale-while-revalidate=604800",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/api/:path(tree|suggest|relate)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
          {
            key: "CDN-Cache-Control",
            value: "public, s-maxage=86400, stale-while-revalidate=604800",
          },
          {
            key: "Vercel-CDN-Cache-Control",
            value: "public, s-maxage=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/temples/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
