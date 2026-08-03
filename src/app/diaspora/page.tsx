import type { Metadata } from "next";
import { AppLink as Link } from "@/components/AppLink";
import { birthYear, getArchive } from "@/lib/archive";
import { KastiRule } from "@/components/Ornament";
import { TempleGallery } from "@/components/TempleGallery";
import type { Place } from "@/lib/types";

export const metadata: Metadata = {
  title: "Where the community went",
  description:
    "Migration traced through the birthplaces in this archive: Goa, the Karavali coast, the cities, and the world.",
};

/**
 * Four bands, in the order the community moved through them. Assigning by
 * region string rather than by latitude, because the meaningful distinction is
 * historical rather than geographic — Mumbai is on the Konkan coast but it
 * belongs to the city migration, not the coastal one.
 */
const BANDS = [
  {
    id: "goa",
    label: "Goa",
    konkani: "गोंय",
    colour: "var(--color-kumkum)",
    note: "The villages of Salcete, Tiswadi, Bardez and Ponda — where the mool is.",
  },
  {
    id: "karavali",
    label: "Konkan & Karavali",
    konkani: "कोंकण",
    colour: "var(--color-laterite)",
    note: "Karwar down to Kochi, and the Maharashtra coast north of Goa.",
  },
  {
    id: "india",
    label: "The cities",
    konkani: "शहरां",
    colour: "var(--color-gold)",
    note: "Bombay above all, then Pune, Bangalore, Madras, Hyderabad, Delhi.",
  },
  {
    id: "abroad",
    label: "Abroad",
    konkani: "परदेश",
    colour: "var(--color-samudra)",
    note: "The Gulf from the 1970s; Britain, North America and Australasia after.",
  },
] as const;

type BandId = (typeof BANDS)[number]["id"];

const KARAVALI = [
  "Uttara Kannada",
  "Udupi",
  "Dakshina Kannada",
  "Kerala",
  "Ratnagiri",
  "Sindhudurg",
];

function bandOf(place: Place | undefined): BandId | undefined {
  if (!place) return undefined;
  if (place.country && place.country !== "India") return "abroad";
  if (place.region?.includes("Goa")) return "goa";
  if (KARAVALI.some((r) => place.region?.includes(r))) return "karavali";
  return "india";
}

export default function DiasporaPage() {
  const archive = getArchive();

  /* ----------------------------------------------- Movement by decade */

  const decades = new Map<number, Record<BandId, number>>();
  const placeCounts = new Map<string, number>();

  for (const p of archive.personList) {
    const year = birthYear(p);
    const placeId = p.birth?.place?.id ?? p.residences?.[p.residences.length - 1]?.id;
    const place = placeId ? archive.places.get(placeId) : undefined;
    const band = bandOf(place);
    if (placeId) placeCounts.set(placeId, (placeCounts.get(placeId) ?? 0) + 1);
    if (!year || !band) continue;

    const decade = Math.floor(year / 20) * 20; // 20-year bins — a generation
    const row =
      decades.get(decade) ?? { goa: 0, karavali: 0, india: 0, abroad: 0 };
    row[band] += 1;
    decades.set(decade, row);
  }

  const rows = [...decades.entries()].sort((a, b) => a[0] - b[0]);
  const maxRow = Math.max(
    1,
    ...rows.map(([, r]) => r.goa + r.karavali + r.india + r.abroad),
  );

  /* ------------------------------------------------------ Place list */

  const places = [...placeCounts.entries()]
    .map(([id, count]) => ({
      place: archive.places.get(id),
      id,
      count,
    }))
    .filter((x): x is { place: Place; id: string; count: number } => !!x.place)
    .sort((a, b) => b.count - a.count);

  const byBand = BANDS.map((band) => ({
    ...band,
    places: places.filter((p) => bandOf(p.place) === band.id),
    total: places
      .filter((p) => bandOf(p.place) === band.id)
      .reduce((sum, p) => sum + p.count, 0),
  }));

  const grandTotal = Math.max(1, byBand.reduce((s, b) => s + b.total, 0));

  /* ---------------------------------------------------- The temples */

  // Ordered by how many people in the archive actually name the deity, so the
  // gallery opens on the temples these particular families belong to rather
  // than on whichever happened to be listed first.
  const kuladevataCounts = new Map(
    archive.stats.byKuladevata.map((f) => [f.id, f.count]),
  );
  const mathCounts = new Map(archive.stats.byMath.map((f) => [f.id, f.count]));

  const temples = [...archive.temples.values()]
    .filter((t) => t.image)
    .sort((a, b) => {
      const weight = (t: typeof a) =>
        (t.kuladevataId ? (kuladevataCounts.get(t.kuladevataId) ?? 0) : 0) +
        (t.mathId ? (mathCounts.get(t.mathId) ?? 0) : 0);
      return weight(b) - weight(a) || a.name.localeCompare(b.name);
    });

  /* ----------------------------------------------------- The chakra */

  const maxPlace = Math.max(1, ...places.map((p) => p.count));
  const chakraPlaces = places.slice(0, 46);
  const RING: Record<BandId, number> = {
    goa: 58,
    karavali: 108,
    india: 158,
    abroad: 208,
  };
  // Lay each band's places out around its own ring, evenly spaced, ordered by
  // longitude so the diagram keeps a rough east-west sense.
  const positioned = BANDS.flatMap((band) => {
    const inBand = chakraPlaces.filter((p) => bandOf(p.place) === band.id);
    inBand.sort(
      (a, b) => (a.place.coords?.[1] ?? 0) - (b.place.coords?.[1] ?? 0),
    );
    return inBand.map((p, i) => {
      const angle =
        (i / Math.max(1, inBand.length)) * Math.PI * 2 - Math.PI / 2;
      const r = RING[band.id];
      return {
        ...p,
        band,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        size: 3 + (p.count / maxPlace) * 13,
      };
    });
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10">
      <header className="max-w-2xl">
        <p className="eyebrow">
          <span className="deva" lang="kok">
            विस्तार
          </span>{" "}
          · Spread
        </p>
        <h1 className="mt-2 font-display text-[2.2rem] font-medium leading-tight">
          Where families went
        </h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
          The families in this archive have moved in a recognisable sequence:
          out of the Goan villages down the Karavali coast, from the coast to
          Bombay and the other cities, and from the cities to the Gulf and the
          West. Most households can name the generation that made each jump.
          Plotted from the birthplaces recorded here, the pattern is visible in
          the aggregate — for these families, which is not the same as for
          anyone else&rsquo;s.
        </p>
      </header>

      <KastiRule className="my-9" />

      {/* ------------------------------------------------- Decade chart */}
      <section>
        <h2 className="font-display text-[1.75rem] font-medium">
          Births by generation
        </h2>
        <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
          Each bar is a twenty-year span — roughly one generation — coloured by
          where the children of that generation were born.
        </p>

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
          {BANDS.map((band) => (
            <span key={band.id} className="flex items-center gap-2 text-[0.8rem]">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: band.colour }}
                aria-hidden
              />
              <span className="text-[var(--fg-soft)]">{band.label}</span>
              <span className="deva text-[var(--fg-faint)]" lang="kok">
                {band.konkani}
              </span>
            </span>
          ))}
        </div>

        {/*
          The bars carry their numbers in `title` attributes, which is a
          tooltip and nothing more — no keyboard, no screen reader, no touch.
          The same figures are therefore also published as a real table,
          visually hidden, and the drawing itself is marked decorative. That
          is the honest way round: one source of truth, two presentations.
        */}
        <table className="sr-only">
          <caption>
            Recorded births by twenty-year period, and where those children
            were born
          </caption>
          <thead>
            <tr>
              <th scope="col">Period</th>
              {BANDS.map((band) => (
                <th key={band.id} scope="col">
                  {band.label}
                </th>
              ))}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([decade, row]) => (
              <tr key={decade}>
                <th scope="row">
                  {decade}–{decade + 19}
                </th>
                {BANDS.map((band) => (
                  <td key={band.id}>{row[band.id]}</td>
                ))}
                <td>{row.goa + row.karavali + row.india + row.abroad}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          className="mt-6 surface overflow-x-auto p-5 scroll-slim"
          aria-hidden="true"
        >
          <div className="flex min-w-[640px] items-end gap-2" style={{ height: 260 }}>
            {rows.map(([decade, row]) => {
              const total = row.goa + row.karavali + row.india + row.abroad;
              return (
                <div key={decade} className="flex flex-1 flex-col items-center">
                  <span className="mb-1 text-[0.72rem] tabular-nums text-[var(--fg-faint)]">
                    {total}
                  </span>
                  <div
                    className="flex w-full flex-col-reverse justify-start overflow-hidden rounded-md"
                    style={{ height: `${(total / maxRow) * 200}px` }}
                    title={`${decade}–${decade + 19}: ${total} births`}
                  >
                    {BANDS.map((band) => {
                      const value = row[band.id];
                      if (!value) return null;
                      return (
                        <div
                          key={band.id}
                          style={{
                            height: `${(value / total) * 100}%`,
                            background: band.colour,
                          }}
                          title={`${band.label}: ${value}`}
                        />
                      );
                    })}
                  </div>
                  <span className="mt-2 text-[0.72rem] tabular-nums text-[var(--fg-faint)]">
                    {decade}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ Chakra */}
      <section className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <h2 className="font-display text-[1.75rem] font-medium">
            The spread, as one figure
          </h2>
          <p className="mt-2 max-w-xl text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
            Four rings, drawn outward from the mool. Each dot is a place; its
            size is how many people the archive records there. Places are set
            around each ring west to east, so the figure keeps a rough sense of
            the map.
          </p>

          <div className="mt-6 surface p-4">
            {/* Decorative: every place and count in it is listed, as text and
                as links, in the panel beside it. */}
            <svg
              viewBox="-260 -260 520 520"
              className="mx-auto block w-full max-w-[560px]"
              aria-hidden="true"
            >
              {/* Rings */}
              {BANDS.map((band) => (
                <circle
                  key={band.id}
                  r={RING[band.id]}
                  fill="none"
                  stroke={band.colour}
                  strokeWidth={0.6}
                  strokeDasharray="2 6"
                  opacity={0.4}
                />
              ))}

              {/* Spokes from the centre to each place */}
              {positioned.map((p) => (
                <line
                  key={`line-${p.id}`}
                  x1={0}
                  y1={0}
                  x2={p.x}
                  y2={p.y}
                  stroke={p.band.colour}
                  strokeWidth={0.4}
                  opacity={0.18}
                />
              ))}

              {/* The mool at the centre */}
              <circle r={13} fill="var(--color-kumkum)" opacity={0.9} />
              <circle r={20} fill="none" stroke="var(--color-kumkum)" strokeWidth={0.8} opacity={0.5} />

              {positioned.map((p) => (
                <g key={p.id}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={p.size}
                    fill={p.band.colour}
                    opacity={0.72}
                  />
                  <title>{`${p.place.name} — ${p.count} people`}</title>
                  {p.count > maxPlace * 0.18 && (
                    <text
                      x={p.x}
                      y={p.y + p.size + 9}
                      textAnchor="middle"
                      fontSize={8.5}
                      fill="var(--fg-soft)"
                    >
                      {p.place.name}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        </div>

        <aside className="space-y-4">
          {byBand.map((band) => (
            <div key={band.id} className="surface p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 font-display text-[1.15rem] font-medium">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: band.colour }}
                    aria-hidden
                  />
                  {band.label}
                </h3>
                <span className="text-[0.85rem] tabular-nums text-[var(--fg-faint)]">
                  {Math.round((band.total / grandTotal) * 100)}%
                </span>
              </div>
              <p className="mt-1.5 text-[0.85rem] leading-relaxed text-[var(--fg-faint)]">
                {band.note}
              </p>
              <ul className="mt-2.5 space-y-0.5">
                {band.places.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/search?mool=${encodeURIComponent(p.id)}`}
                      className="state-layer -mx-1.5 flex min-h-[32px] items-center justify-between gap-2 rounded-[var(--shape-xs)] px-1.5 text-[0.9rem] text-[var(--fg-soft)]"
                    >
                      <span className="truncate">{p.place.name}</span>
                      <span className="shrink-0 text-[0.8rem] tabular-nums text-[var(--fg-faint)]">
                        {p.count}
                      </span>
                    </Link>
                  </li>
                ))}
                {band.places.length > 6 && (
                  <li className="px-1.5 pt-1 text-[0.8rem] text-[var(--fg-faint)]">
                    and {band.places.length - 6} more
                  </li>
                )}
              </ul>
            </div>
          ))}
        </aside>
      </section>

      {/* ----------------------------------------------- The temples */}
      {temples.length > 0 && (
        <section className="mt-16">
          <h2 className="font-display text-[1.75rem] font-medium">
            What the families left behind, and still name
          </h2>
          <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
            The households in this archive scattered from Goa across four
            centuries, and the thing almost none of them let go of was the
            kuladevata. A family that has forgotten its village can nearly
            always still tell you its deity — which is why it is the single
            most reliable way to reconnect two branches that lost each other,
            and why it is worth seeing the buildings rather than only reading
            the names.
          </p>
          <p className="mt-2 max-w-3xl text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
            Many of these images were carried inland to Ponda and Bicholim in
            the sixteenth and seventeenth centuries, ahead of the destruction of
            temples in the Old Conquests. Where that happened, the village the
            deity came from is named below — and it is very often the mool a
            family still gives, four hundred years after anyone last lived
            there.
          </p>

          <TempleGallery
            temples={temples}
            placeName={(id) => (id ? archive.places.get(id)?.name : undefined)}
            countFor={(t) =>
              t.kuladevataId
                ? kuladevataCounts.get(t.kuladevataId)
                : t.mathId
                  ? mathCounts.get(t.mathId)
                  : undefined
            }
          />

          <p className="mt-6 max-w-3xl text-[0.85rem] leading-relaxed text-[var(--fg-faint)]">
            These photographs are other people&rsquo;s work, gathered from
            Wikimedia Commons under free licences and reproduced here with the
            photographer and licence attached to each one. The temples are not
            a complete list — several of the deities named in this archive have
            no freely licensed photograph yet. If you have taken one, releasing
            it on Commons puts it here and everywhere else it is needed.
          </p>
        </section>
      )}

      <section className="mt-14 surface p-6">
        <h2 className="font-display text-[1.5rem] font-medium">
          A caution about this chart
        </h2>
        <p className="mt-2.5 max-w-3xl text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
          It shows where the archive has records, not where the community is.
          Families who kept written records, and families whose descendants are
          online today, are both over-represented; the branches that stayed in
          the villages are the ones least likely to have been written down. Read
          it as a picture of this archive&rsquo;s coverage, and help correct it
          by{" "}
          <Link href="/contribute" className="link-underline text-[var(--accent)]">
            adding the branches it is missing
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
