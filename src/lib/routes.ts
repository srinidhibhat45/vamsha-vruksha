/**
 * Which routes cost a server to render, and therefore must not be prefetched.
 *
 * Next prefetches every <Link> that scrolls into view. For a route that was
 * prerendered at build time that is free — the prefetch is a file already
 * sitting on the CDN. For a route that is server-rendered on demand it is not:
 * the site runs on Netlify Functions, so each prefetch wakes a container,
 * loads the module graph and rebuilds the archive, and the header and footer
 * between them link to five such routes from every single page.
 *
 * The result was that opening any page fired a dozen prefetches, several of
 * them cold function invocations, before the reader had clicked anything —
 * and then the click they did make queued behind that work. Hence this list.
 *
 * A route belongs here when the build output marks it `ƒ (Dynamic)`. Both of
 * the reasons a route ends up that way apply below: reading `searchParams`
 * (/search, /tree, /relate, /contribute) or reading cookies (/admin).
 */
const ON_DEMAND = [
  "/search",
  "/tree",
  "/relate",
  "/contribute",
  "/admin",
] as const;

/**
 * True when following this link means invoking a function rather than
 * fetching a file. Pass the result to `<Link prefetch={...}>` inverted.
 *
 * Matched on the path only, so query strings and fragments on a link — the
 * footer's `/contribute#correct`, search's `?q=` — resolve the same way as
 * the bare route.
 */
export function isOnDemand(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0];
  return ON_DEMAND.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

/**
 * What to pass to `<Link prefetch>`. `undefined` rather than `true` for the
 * cheap case, so prerendered routes keep Next's own default behaviour.
 */
export function prefetchFor(href: string): false | undefined {
  return isOnDemand(href) ? false : undefined;
}
