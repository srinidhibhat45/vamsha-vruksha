/**
 * Timestamp formatting that server and client agree on.
 *
 * `toLocaleString()` reads the host's locale and time zone, and Node's are
 * almost never the reader's. Rendered in a server component and hydrated in
 * the browser, the two produce different strings — "03/08/2026, 08:38:25"
 * against "8/3/2026, 8:38:25 AM" — and React throws out the whole tree and
 * re-renders it.
 *
 * Pinning both the locale and the zone makes the output deterministic. UTC
 * rather than the maintainer's zone because a submission log that reads the
 * same wherever it is opened is worth more here than one showing local
 * bedtime, and the archive's dates are historical anyway.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** e.g. "3 Aug 2026, 08:38". Falls back to the raw string if unparseable. */
export function formatTimestamp(iso: string): string {
  const date = parse(iso);
  return date ? `${DATE_TIME.format(date)} UTC` : iso;
}

/** e.g. "3 Aug 2026". */
export function formatDate(iso: string): string {
  const date = parse(iso);
  return date ? DATE_ONLY.format(date) : iso;
}
