import NextLink from "next/link";
import type { ComponentProps } from "react";
import { prefetchFor } from "@/lib/routes";

/**
 * `next/link`, with one default changed: routes that cost a server to render
 * are not prefetched.
 *
 * Next prefetches every link that scrolls into view. For the prerendered
 * pages — which, since person records became static, is nearly all of them —
 * that is free. For /search, /tree, /relate and /contribute it is a Netlify
 * Function invocation, and the site links to those from the header, the
 * footer, every facet chip on a person record, every row of the lineage
 * index and the example queries under the hero. Opening the home page fired
 * a dozen of them before the reader had clicked anything.
 *
 * Setting `prefetch={false}` at each of those call sites would work until
 * somebody adds the thirty-first, so the rule lives here instead: import
 * this in place of next/link and the right thing happens by default. Passing
 * `prefetch` explicitly still wins, for the rare link worth paying for.
 *
 * Deliberately not a client component — it has no state, so it renders on
 * the server for server pages and in the bundle for client ones.
 */
export function AppLink({
  href,
  prefetch,
  ...rest
}: ComponentProps<typeof NextLink>) {
  const resolved =
    prefetch !== undefined
      ? prefetch
      : typeof href === "string"
        ? prefetchFor(href)
        : undefined;

  return <NextLink href={href} prefetch={resolved} {...rest} />;
}
