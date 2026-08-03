import { AppLink as Link } from "@/components/AppLink";
import type { Archive } from "@/lib/archive";
import { getArchive, fullName, birthYear } from "@/lib/archive";
import type { Lineage } from "@/lib/types";
import { displayImage } from "@/lib/media";
import { HeroSearch } from "@/components/HeroSearch";
import { LineageGlyph } from "@/components/LineageGlyph";
import {
  GotraMark,
  KuladevataMark,
  Mandala,
  MoolMark,
  SurnameMark,
} from "@/components/Ornament";

/**
 * Three rules shape what this page is allowed to put in front of a reader.
 *
 * It does not name particular communities. An archive that opens by listing
 * four of them has already told everyone else that it was built for somebody
 * else, and the whole point of a shared record is that there is no somebody
 * else. The vocabularies the data is organised by — gotra, kuladevata, mool,
 * matha — are described, never enumerated as a membership list.
 *
 * It does not rank families. `lineageList` and every facet come out of the
 * archive sorted by size, so a plain `.slice(0, 6)` here would quietly turn
 * the front page into a leaderboard of the six largest families and the
 * eighteen commonest surnames — a small archive's biggest contributors
 * becoming its public face. Anything shown here is either alphabetical and
 * said to be alphabetical, or a property of the record itself.
 *
 * ------------------------------------------------------------------
 * A third rule, about the look of it.
 *
 * Everything below the hero is a register: ruled rows, aligned columns,
 * figures set in the display face, and no cards at all. That is not a style
 * preference. This page's content is four indexes with counts, ten lineages
 * with spans and generation depths, and three dated records — which is to
 * say it is *tabular*, and it was being served as three separate grids of
 * rounded boxes that shared a shadow, a radius and an icon bubble and could
 * not be told apart or compared down the page.
 *
 * Sections are distinguished by structure and by a numeral on a rule, not by
 * a colour each. The accent is reserved for one meaning: this is something
 * you can follow. Nothing decorative uses it.
 */

export default function HomePage() {
  const archive = getArchive();
  const s = archive.stats;

  // Alphabetical, explicitly. Never the largest first. Three, because the
  // section says "three of N" — the number here and the number in that
  // sentence have to be the same one.
  const lines = [...archive.lineageList]
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 3);

  /*
    Three temples, named rather than sorted.

    The rule against ranking on this page is about families: the archive must
    not put its biggest contributors on the front. Which photographs lead a
    page is a different question, and taking these alphabetically answered it
    badly — it opened on a promotional collage with a banner across it and a
    street view with a camera datestamp burned into the corner, because that
    is where the alphabet happened to land.

    So these three are chosen as pictures. They are also the temples the copy
    beside them refers to, and the ones a Saraswat household is most likely to
    recognise on sight. The gallery on /diaspora still shows every one.
  */
  const FEATURED_TEMPLES = ["mangesh", "shantadurga", "ramnath"];
  const temples = FEATURED_TEMPLES.map((id) => archive.temples.get(id)).filter(
    (t): t is NonNullable<typeof t> => !!t?.image,
  );

  const oldest = [...archive.personList]
    .filter((p) => birthYear(p))
    .sort((a, b) => birthYear(a)! - birthYear(b)!)
    .slice(0, 3);

  const searchExamples = ["Shreenivas", "Laxmi", "Kamath", "Kushasthali"];

  return (
    <>
      {/* ---------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-[var(--line)]">
        {/* The mandala is the page's ground, not an illustration beside the
            words: it sits under everything, masked to a soft ellipse so the
            centre of the page stays quiet enough to read. */}
        <div className="mandala-bed">
          {/* Sized off the band's own height, so the whole figure is in
              frame at any viewport — a mandala cropped to its middle rings
              stops reading as a mandala and starts reading as clutter. */}
          <Mandala
            className="mandala-turn aspect-square h-[128%] w-auto max-w-none shrink-0"
            folds={16}
          />
        </div>

        <div className="relative mx-auto max-w-[980px] px-4 pb-16 pt-14 text-center md:pb-20 md:pt-20">
          <p className="eyebrow">A public lineage archive</p>

          <h1 className="mx-auto mt-4 max-w-[15ch] font-display text-[2.7rem] font-medium leading-[1.05] tracking-[-0.015em] sm:max-w-none sm:text-[3.6rem]">
            One tree, with room
            <br className="hidden sm:block" /> on it for every family.
          </h1>

          <p className="deva mt-3 text-2xl text-[var(--accent)]" lang="kok">
            वंशवृक्ष
          </p>

          <p className="mx-auto mt-5 max-w-[46rem] text-[1.05rem] leading-relaxed text-[var(--fg-soft)]">
            Every household keeps a piece of it — a name in a horoscope, a
            village nobody has visited in eighty years, a great-grandmother
            whose surname is the only clue left. Put in the one name you are
            sure of and see what it already joins onto.
          </p>

          {/* The reason the page exists. Everything below it is deliberately
              a text button. */}
          <div className="mt-9">
            <HeroSearch examples={searchExamples} centred />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
            <Link href="/tree" className="btn btn-text btn-lg">
              Open the tree
            </Link>
            <span className="text-[var(--line-strong)]" aria-hidden>
              ·
            </span>
            <Link href="/contribute" className="btn btn-text btn-lg">
              Add your family
            </Link>
            <span className="text-[var(--line-strong)]" aria-hidden>
              ·
            </span>
            <Link href="/relate" className="btn btn-text btn-lg">
              How am I related to…?
            </Link>
          </div>
        </div>

        {/* Figures for the archive itself — the one thing on this page it is
            fair to count. Set as a ruled strip of tabular numerals rather
            than a textured plinth: they are the first register on the page
            and they should look like the ones below them. */}
        <div className="relative border-t border-[var(--line)] bg-[var(--bg-sunken)]">
          <dl className="mx-auto grid max-w-[1400px] grid-cols-2 gap-y-6 px-4 py-8 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { value: s.people.toLocaleString(), label: "people recorded" },
              { value: s.lineages.toLocaleString(), label: "family lines" },
              { value: `${s.maxGenerations}`, label: "generations deep" },
              {
                value: s.earliestYear ? `${s.earliestYear}` : "—",
                label: "earliest birth",
              },
              { value: `${s.byMool.length}`, label: "ancestral villages" },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={
                  i === 0
                    ? "px-1"
                    : "border-l border-[var(--line-strong)] px-1 pl-5 lg:pl-8"
                }
              >
                <dd className="figure text-[1.85rem] text-[var(--fg)]">
                  {stat.value}
                </dd>
                <dt className="col-label mt-2">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------- I · Why this exists */}
      <section className="mx-auto max-w-[1400px] px-4 pb-14 pt-16">
        <BandHead numeral="I" eyebrow="Why this exists" />

        {/* An editorial opening: the claim hangs in its own column and the
            argument runs beside it at a reading measure. Two columns of
            unequal weight, which is what a page of prose looks like when
            somebody has set it rather than stacked it. */}
        <div className="mt-9 grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          <div>
            <h2 className="font-display text-[2.15rem] font-medium leading-[1.12] tracking-[-0.012em] sm:text-[2.5rem]">
              Memory has a half-life, and the joins are what get lost first.
            </h2>
            <p className="col-label mt-8">Who this is for</p>
            <p className="mt-2.5 max-w-[26rem] text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
              Anyone with a family. There is no community you have to belong to,
              no list you have to be on, and nothing to prove before you can add
              a record.
            </p>
          </div>

          <div className="max-w-[38rem] space-y-5 text-[1.02rem] leading-[1.75] text-[var(--fg-soft)]">
            <p>
              Most families can name four generations without help. The fifth is
              a first name and a village. The sixth is gone — and with it goes
              the only evidence that two branches now living in different
              countries were one household within living memory.
            </p>
            <p>
              Two families that lost touch in 1910 will usually still agree on
              three things: the sage their line descends from, the deity the
              household turns to first, and the village they name as their root.
              Those three fields do more to reconnect a scattered family than
              any amount of names and dates, which is why this archive is
              organised around them.
            </p>
            <p className="font-display text-[1.2rem] italic leading-snug text-[var(--fg)]">
              Written down once, none of it decays again.
            </p>
          </div>
        </div>

        {/* The three commitments, as a ruled footing to the argument rather
            than as a boxed aside with a tick beside each line. */}
        <ul className="mt-12 grid gap-x-10 gap-y-7 border-t border-[var(--outline-soft)] pt-7 sm:grid-cols-3">
          {[
            {
              head: "Free to read",
              body: "The whole archive, in full, with no account and no membership.",
            },
            {
              head: "Open to correction",
              body: "Anyone may correct a record, and every change carries a reason.",
            },
            {
              head: "Sourced",
              body: "Each record says where it came from and how sure of it we are.",
            },
          ].map((c, i) => (
            <li
              key={c.head}
              className={
                i === 0 ? "" : "sm:border-l sm:border-[var(--line)] sm:pl-10"
              }
            >
              <h3 className="font-display text-[1.05rem] font-medium">
                {c.head}
              </h3>
              <p className="mt-1.5 text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
                {c.body}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-8">
          <Link
            href="/about"
            className="group inline-flex items-baseline gap-2 font-display text-[1.05rem] text-[var(--accent)] underline decoration-[color-mix(in_oklab,var(--accent)_35%,transparent)] underline-offset-[6px] hover:decoration-[var(--accent)]"
          >
            How the archive works
            <span className="reg-arrow" aria-hidden>
              →
            </span>
          </Link>
        </p>
      </section>

      {/* ---------------------------------------------- II · The indexes */}
      <section className="border-y border-[var(--line)] bg-[var(--bg-sunken)]">
        <div
          className="mx-auto max-w-[1400px] px-4 py-16"
          style={{ ["--band-paper" as string]: "var(--bg-sunken)" }}
        >
          <BandHead numeral="II" eyebrow="Find a way in" />

          <div className="mt-8 grid gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-end">
            <h2 className="font-display text-[2.15rem] font-medium leading-[1.12] tracking-[-0.012em]">
              Four things a family tends to remember
            </h2>
            <p className="max-w-[34rem] text-[1rem] leading-relaxed text-[var(--fg-soft)]">
              Even when the names have run out, these usually survive — and any
              one of them narrows a search from thousands of people to dozens.
              Each index lists everything the archive holds, in alphabetical
              order.
            </p>
          </div>

          <div className="reg mt-10">
            <WayIn
              konkani="आडनांव"
              title="Surname"
              href="/directory/surname"
              count={s.bySurname.length}
              unit="surnames"
              mark={<SurnameMark className="h-7 w-7" />}
              body="Usually either an office a family once held, or the village it came from. Both are strong evidence of where a branch sits."
            />
            <WayIn
              konkani="गोत्र"
              title="Gotra"
              href="/directory/gotra"
              count={s.byGotra.length}
              unit="gotras"
              mark={<GotraMark className="h-7 w-7" />}
              body="The rishi a line descends from. Passed father to child and never changed by marriage, so it survives centuries of migration intact."
            />
            <WayIn
              konkani="कुलदेवता"
              title="Kuladevata"
              href="/directory/kuladevata"
              count={s.byKuladevata.length}
              unit="deities"
              mark={<KuladevataMark className="h-7 w-7" />}
              body="The family deity, and the temple it sits in. A household that has forgotten its village has usually not forgotten this."
            />
            <WayIn
              konkani="मूळ गांव"
              title="Mool village"
              href="/directory/mool"
              count={s.byMool.length}
              unit="villages"
              mark={<MoolMark className="h-7 w-7" />}
              body="The place a family names as its root, however many generations ago it left, and however far down the coast it went after."
            />
          </div>
        </div>
      </section>

      {/* -------------------------------------------- III · Family lines */}
      <section className="mx-auto max-w-[1400px] px-4 py-16">
        <BandHead numeral="III" eyebrow="Browse" />

        <div className="mt-8 grid gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-end">
          <h2 className="font-display text-[2.15rem] font-medium leading-[1.12] tracking-[-0.012em]">
            Every family has a shape
          </h2>
          <p className="max-w-[34rem] text-[1rem] leading-relaxed text-[var(--fg-soft)]">
            A line is not a surname — it is one connected web of relatives, and
            where two families married their records join and the two become
            one. Nine generations of two brothers looks nothing like five
            generations of eleven children, so each line is drawn as itself.
          </p>
        </div>

        {/*
          Three, not the whole index.

          This used to be a full-width ruled table, and a table is a promise:
          it says these are the records, here are the columns, read down them.
          With ten lines that was merely heavy; with a hundred it would be a
          lie, because the page would still be showing six and the reader would
          have no way to know that. So the home page shows a named, counted
          sample and sends you somewhere built for the rest — and it spends the
          room it saved on drawing each of the three properly.
        */}
        <ul className="mt-12 grid gap-x-12 gap-y-12 border-t border-[var(--outline-soft)] pt-10 md:grid-cols-3">
          {lines.map((l, i) => {
            const apex = archive.people.get(l.apexId);
            return (
              <li
                key={l.id}
                className={
                  i === 0 ? "" : "md:border-l md:border-[var(--line)] md:pl-12"
                }
              >
                <Link href={`/tree?lineage=${l.id}`} className="group block">
                  <LineageGlyph
                    profile={generationProfile(archive, l)}
                    className="h-[3.6rem] w-auto text-[var(--accent)] opacity-80 transition-opacity group-hover:opacity-100"
                  />

                  <h3 className="mt-5 font-display text-[1.3rem] font-medium leading-snug group-hover:text-[var(--accent)]">
                    {l.label}
                  </h3>

                  {apex && (
                    <p className="mt-2 text-[0.92rem] leading-snug text-[var(--fg-soft)]">
                      from{" "}
                      <span className="font-semibold text-[var(--fg)]">
                        {fullName(apex)}
                      </span>
                      {birthYear(apex) ? `, born ${birthYear(apex)}` : ""}
                    </p>
                  )}

                  {/* The three comparable figures, aligned across all three
                      entries so the eye can still run across them. */}
                  <dl className="mt-5 flex gap-7 border-t border-[var(--line)] pt-4">
                    <div>
                      <dd className="figure text-[1.3rem] text-[var(--fg)]">
                        {l.size.toLocaleString()}
                      </dd>
                      <dt className="col-label mt-1">people</dt>
                    </div>
                    <div>
                      <dd className="figure text-[1.3rem] text-[var(--fg)]">
                        {l.generations}
                      </dd>
                      <dt className="col-label mt-1">generations</dt>
                    </div>
                    <div className="min-w-0">
                      <dd className="figure whitespace-nowrap text-[1.3rem] text-[var(--fg)]">
                        {l.earliestYear && l.latestYear
                          ? `${l.earliestYear}–${l.latestYear}`
                          : "—"}
                      </dd>
                      <dt className="col-label mt-1">recorded</dt>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 border-t border-[var(--line)] pt-6 text-[1rem] text-[var(--fg-soft)]">
          Three of {s.lineages.toLocaleString()} lines, taken alphabetically —
          the home page does not rank families.{" "}
          <Link
            href="/lineages"
            className="group whitespace-nowrap font-display text-[1.05rem] text-[var(--accent)] underline decoration-[color-mix(in_oklab,var(--accent)_35%,transparent)] underline-offset-[6px] hover:decoration-[var(--accent)]"
          >
            Browse the full index
            <span className="reg-arrow ml-1.5" aria-hidden>
              →
            </span>
          </Link>
        </p>
      </section>

      {/* ------------------------------------------------ IV · The temples */}
      {temples.length > 0 && (
        <section className="border-y border-[var(--line)] bg-[var(--bg-sunken)] ground-kolam">
          <div
            className="mx-auto max-w-[1400px] px-4 py-16"
            style={{ ["--band-paper" as string]: "var(--bg-sunken)" }}
          >
            <BandHead numeral="IV" eyebrow="Kuladevata" />

            <div className="mt-8 grid gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-end">
              <h2 className="font-display text-[2.15rem] font-medium leading-[1.12] tracking-[-0.012em]">
                The buildings behind the field
              </h2>
              <p className="max-w-[34rem] text-[1rem] leading-relaxed text-[var(--fg-soft)]">
                Names and dates are not what a fourteen-year-old will read. What
                they will look at is the temple their grandmother means when she
                says <em>Mangeshi</em> — and once they have, the kuladevata on a
                record stops being a form field and becomes a place with a lamp
                tower in front of it.
              </p>
            </div>

            <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {temples.map((temple) => {
                const image = displayImage(temple.image);
                const here = temple.placeId
                  ? archive.places.get(temple.placeId)?.name
                  : undefined;

                return (
                  <li key={temple.id}>
                    <Link
                      href={
                        temple.kuladevataId
                          ? `/search?kuladevata=${temple.kuladevataId}`
                          : "/diaspora"
                      }
                      className="group block"
                    >
                      {image && (
                        <figure className="overflow-hidden rounded-[var(--shape-sm)] border border-[var(--line)]">
                          {/*
                            Plain <img> against a pre-sized file, so no
                            optimiser runs per request on Netlify. Width and
                            height are the derivative's own — a few sources
                            are narrower than 900px and keep their size — so
                            the box is reserved correctly and nothing shifts.
                          */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={image.src}
                            alt={`${temple.name}${here ? `, ${here}` : ""}`}
                            width={image.width}
                            height={image.height}
                            loading="lazy"
                            decoding="async"
                            className="aspect-[5/3] w-full bg-[var(--bg-inset)] object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                          />
                        </figure>
                      )}

                      <div className="mt-4 flex items-baseline justify-between gap-3">
                        <h3 className="font-display text-[1.2rem] font-medium leading-snug group-hover:text-[var(--accent)]">
                          {temple.name}
                        </h3>
                        {temple.devanagari && (
                          <span
                            className="deva shrink-0 text-[0.95rem] text-[var(--fg-faint)]"
                            lang="kok"
                          >
                            {temple.devanagari}
                          </span>
                        )}
                      </div>

                      {here && <p className="col-label mt-1.5">{here}</p>}
                    </Link>

                    {/* Somebody else's photograph, under a licence that asks
                        for their name. An archive that exists to keep names
                        attached to what people did does not get to strip one. */}
                    {image && (
                      <p className="mt-2 text-[0.72rem] leading-snug text-[var(--fg-faint)]">
                        Photograph {image.credit} ·{" "}
                        {image.licenseUrl ? (
                          <a
                            href={image.licenseUrl}
                            rel="license noopener noreferrer"
                            target="_blank"
                            className="underline underline-offset-2"
                          >
                            {image.license}
                          </a>
                        ) : (
                          image.license
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="mt-9">
              <Link
                href="/diaspora"
                className="group inline-flex items-baseline gap-2 font-display text-[1.05rem] text-[var(--accent)] underline decoration-[color-mix(in_oklab,var(--accent)_35%,transparent)] underline-offset-[6px] hover:decoration-[var(--accent)]"
              >
                Where these families went, and the temples they left behind
                <span className="reg-arrow" aria-hidden>
                  →
                </span>
              </Link>
            </p>
          </div>
        </section>
      )}

      {/* -------------------------------------------- V · Furthest back */}
      {oldest.length > 0 && (
        <section className="border-y border-[var(--line)] bg-[var(--bg-sunken)]">
          <div
            className="mx-auto max-w-[1400px] px-4 py-16"
            style={{ ["--band-paper" as string]: "var(--bg-sunken)" }}
          >
            <BandHead numeral="V" eyebrow="Furthest back" />

            <div className="mt-8 grid gap-x-16 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-end">
              <h2 className="font-display text-[2.15rem] font-medium leading-[1.12] tracking-[-0.012em]">
                The oldest names in the archive
              </h2>
              <p className="max-w-[34rem] text-[1rem] leading-relaxed text-[var(--fg-soft)]">
                Every line stops somewhere. These are the earliest ancestors
                anyone has been able to name — if your family holds a household
                ledger or a temple register that reaches further back, it is
                worth more than you think.
              </p>
            </div>

            {/* Three dated records, set as catalogue entries hanging off one
                rule: the year is the subject, so it is the largest thing in
                the entry and every one of them sits on the same baseline. */}
            <ul className="mt-10 grid gap-x-12 gap-y-10 border-t border-[var(--outline-soft)] pt-8 sm:grid-cols-3">
              {oldest.map((p, i) => (
                <li
                  key={p.id}
                  className={
                    i === 0
                      ? ""
                      : "sm:border-l sm:border-[var(--line)] sm:pl-12"
                  }
                >
                  <Link href={`/person/${p.id}`} className="group block">
                    <span className="figure block text-[3.4rem] text-[var(--accent)]">
                      {birthYear(p)}
                    </span>
                    {/* The rule closes the figure, so every entry has the
                        same structure whether or not the record carries an
                        epithet — hanging it off the epithet instead left the
                        middle column looking like a rendering fault. */}
                    <span
                      className="mt-4 block h-px w-16 bg-[var(--outline-soft)]"
                      aria-hidden
                    />
                    <span className="mt-4 block font-display text-[1.2rem] font-medium leading-snug group-hover:underline group-hover:decoration-[var(--accent)] group-hover:underline-offset-4">
                      {fullName(p)}
                    </span>
                    <span className="col-label mt-2.5 block">
                      {p.mool
                        ? `born in ${archive.places.get(p.mool)?.name ?? p.mool}`
                        : "birthplace not recorded"}
                    </span>
                    {p.epithet && (
                      <span className="mt-4 block max-w-[22rem] text-[0.9rem] italic leading-relaxed text-[var(--fg-soft)]">
                        {p.epithet}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ----------------------------------------------- VI · Contribute */}
      <section className="mx-auto max-w-[1400px] px-4 py-16">
        <BandHead
          numeral="VI"
          eyebrow={
            <>
              <span className="deva" lang="kok">
                योगदान
              </span>{" "}
              · Contribute
            </>
          }
        />

        <div className="mt-9 grid gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
          <div>
            <h2 className="font-display text-[2.3rem] font-medium leading-[1.1] tracking-[-0.012em] sm:text-[2.7rem]">
              You know something this archive does not.
            </h2>
            <p className="col-label mt-8">Held so far</p>
            <p className="mt-2 font-display text-[1.05rem] text-[var(--fg-soft)]">
              {s.people.toLocaleString()} people, across {s.lineages} lines,
              reaching back to {s.earliestYear ?? "—"}.
            </p>
          </div>

          <div className="max-w-[38rem]">
            <p className="text-[1.05rem] leading-[1.75] text-[var(--fg-soft)]">
              A grandmother&rsquo;s maiden name. The village on an old land
              document. Which brother went to the city in 1938 and which stayed.
              Send one fact or a hundred — every submission is read by a person
              before it goes in, and every record says where it came from.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/contribute" className="btn btn-filled btn-lg">
                Add what you know
              </Link>
              <Link href="/search" className="btn btn-outlined btn-lg">
                Look for someone first
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** A section's opening rule, with its numeral and name set on the line. */
function BandHead({
  numeral,
  eyebrow,
}: {
  numeral: string;
  eyebrow: React.ReactNode;
}) {
  return (
    <div className="band-head">
      <span className="band-numeral">{numeral}</span>
      <p className="eyebrow">{eyebrow}</p>
    </div>
  );
}

/**
 * One index, as a row in a ruled register.
 *
 * The Konkani term leads, because in an archive organised around these four
 * words that is what the entry is called; the English name sits under it as
 * the gloss. The count is set as a figure at the end of the row so the four
 * of them form a column you can read on its own.
 */
function WayIn({
  konkani,
  title,
  href,
  count,
  unit,
  mark,
  body,
}: {
  konkani: string;
  title: string;
  href: string;
  count: number;
  unit: string;
  mark: React.ReactNode;
  body: string;
}) {
  return (
    /*
      Two layouts from one DOM order. Narrow, the entry stacks: mark, term and
      count on the first line, the definition across the second. Wide, all
      five cells sit on one row, which is what makes the counts read as a
      column — hence the explicit column placement rather than source order.
    */
    <Link
      href={href}
      className="reg-row group grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-4 px-3 py-6 md:grid-cols-[auto_minmax(7.5rem,11rem)_minmax(0,1fr)_auto_2rem] md:gap-x-8 md:gap-y-0 md:py-7"
    >
      <span className="index-mark md:col-start-1 md:row-start-1" aria-hidden>
        {mark}
      </span>

      <div className="min-w-0 md:col-start-2 md:row-start-1">
        <span
          className="deva block text-[1.5rem] leading-tight text-[var(--fg)]"
          lang="kok"
        >
          {konkani}
        </span>
        <span className="mt-1 block font-display text-[1.15rem] font-medium text-[var(--fg)] group-hover:text-[var(--accent)]">
          {title}
        </span>
      </div>

      <div className="text-right md:col-start-4 md:row-start-1">
        <span className="figure block text-[2.1rem] text-[var(--fg)]">
          {count.toLocaleString()}
        </span>
        <span className="col-label mt-1.5 block">{unit}</span>
      </div>

      <p className="col-span-3 max-w-[42rem] text-[0.95rem] leading-relaxed text-[var(--fg-soft)] md:col-span-1 md:col-start-3 md:row-start-1">
        {body}
      </p>

      <span
        className="reg-arrow hidden text-right text-[1.15rem] md:col-start-5 md:row-start-1 md:block"
        aria-hidden
      >
        →
      </span>
    </Link>
  );
}

/**
 * How many people sit in each generation of a lineage, oldest first.
 *
 * The one number a lineage card cannot get from the Lineage record itself:
 * `generations` says how deep it runs, `size` how many people, but neither
 * says whether those people are spread evenly or bunched into one enormous
 * fourth generation. That distribution is the family's shape, and it is what
 * LineageGlyph draws.
 */
function generationProfile(archive: Archive, lineage: Lineage): number[] {
  const counts = new Map<number, number>();
  for (const id of lineage.memberIds) {
    const g = archive.generationOf.get(id);
    if (g == null) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return Array.from({ length: lineage.generations }, (_, i) => counts.get(i) ?? 0);
}
