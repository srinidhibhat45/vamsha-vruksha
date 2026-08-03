import Link from "next/link";
import type { Temple } from "@/lib/types";

/**
 * The temples, as they stand.
 *
 * The rest of this archive is names and dates, and names and dates are what a
 * fourteen-year-old in New Jersey will not read. What they will look at is a
 * photograph of the building their grandmother means when she says *Mangeshi*
 * — and once they have seen it, the gotra and the mool on a record stop being
 * form fields and start being a place with a lamp tower in front of it.
 *
 * That is the whole argument for this section. The kuladevata is also, in
 * practice, the most durable link the archive has: a family that has forgotten
 * which village it came from has almost never forgotten which deity it belongs
 * to, so these pictures sit next to the single field most likely to reconnect
 * two branches that lost each other.
 *
 * Every image is somebody else's photograph under a licence requiring
 * attribution, and the credit is rendered with the picture rather than tucked
 * into a colophon. An archive that exists to keep people's names attached to
 * what they did does not get to strip a photographer's.
 */
export function TempleGallery({
  temples,
  placeName,
  /** How many people in the archive name this deity. Omitted where unknown. */
  countFor,
}: {
  temples: Temple[];
  placeName: (id: string | undefined) => string | undefined;
  countFor?: (temple: Temple) => number | undefined;
}) {
  if (!temples.length) return null;

  return (
    <ul className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {temples.map((temple) => {
        const here = placeName(temple.placeId);
        const from = placeName(temple.originPlaceId);
        const count = countFor?.(temple);

        return (
          <li
            key={temple.id}
            className="surface flex flex-col overflow-hidden"
          >
            {temple.image && (
              <figure className="relative">
                {/*
                  Plain <img>: these are pre-sized static files committed to the
                  repo at exactly the width they render at, so the optimiser
                  would re-encode an image that is already the right size.
                */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={temple.image.src}
                  alt={`${temple.name}${here ? `, ${here}` : ""}`}
                  width={temple.image.width}
                  height={temple.image.height}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[4/3] w-full bg-[var(--bg-inset)] object-cover"
                />
              </figure>
            )}

            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-[1.2rem] font-medium leading-tight">
                  {temple.name}
                </h3>
                {temple.devanagari && (
                  <span
                    className="deva shrink-0 text-[0.95rem] text-[var(--accent)]"
                    lang="kok"
                  >
                    {temple.devanagari}
                  </span>
                )}
              </div>

              <p className="mt-1 text-[0.82rem] text-[var(--fg-faint)]">
                {here}
                {from && (
                  <>
                    {" · "}
                    {/*
                      The line families actually recite — "we are Shantadurga,
                      from Keloshi" — even when nobody has seen Keloshi in four
                      hundred years.
                    */}
                    <span className="text-[var(--color-gold)]">
                      carried from {from}
                    </span>
                  </>
                )}
              </p>

              {temple.blurb && (
                <p className="mt-2.5 text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
                  {temple.blurb}
                </p>
              )}

              <div className="mt-auto pt-3.5">
                {temple.kuladevataId && (
                  <Link
                    href={`/search?kuladevata=${encodeURIComponent(temple.kuladevataId)}`}
                    className="link-underline text-[0.88rem] font-medium"
                  >
                    {count === undefined
                      ? "Families who name this deity"
                      : `${count} ${count === 1 ? "person" : "people"} name this deity`}
                  </Link>
                )}
                {temple.mathId && !temple.kuladevataId && (
                  <Link
                    href={`/search?math=${encodeURIComponent(temple.mathId)}`}
                    className="link-underline text-[0.88rem] font-medium"
                  >
                    {count === undefined
                      ? "Families of this matha"
                      : `${count} ${count === 1 ? "person" : "people"} name this matha`}
                  </Link>
                )}

                {temple.image && (
                  <p className="mt-2 text-[0.72rem] leading-relaxed text-[var(--fg-faint)]">
                    Photograph {temple.image.credit}
                    {", "}
                    {temple.image.licenseUrl ? (
                      <a
                        href={temple.image.licenseUrl}
                        rel="noopener noreferrer license"
                        target="_blank"
                        className="underline decoration-dotted underline-offset-2"
                      >
                        {temple.image.license}
                      </a>
                    ) : (
                      temple.image.license
                    )}
                    {temple.image.source && (
                      <>
                        {" · "}
                        <a
                          href={temple.image.source}
                          rel="noopener noreferrer"
                          target="_blank"
                          className="underline decoration-dotted underline-offset-2"
                        >
                          source
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
