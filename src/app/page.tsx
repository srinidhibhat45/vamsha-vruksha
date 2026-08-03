import Link from "next/link";
import { getArchive, fullName, birthYear } from "@/lib/archive";
import { HeroSearch } from "@/components/HeroSearch";
import {
  Deepa,
  GotraMark,
  KastiRule,
  KuladevataMark,
  Mandala,
  MarkBranch,
  MarkHourglass,
  MarkKeys,
  MarkQuill,
  MoolMark,
  SurnameMark,
} from "@/components/Ornament";

/**
 * Two rules shape what this page is allowed to put in front of a reader.
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
 * Six sections of cards that share one border radius, one background and one
 * heading size is six sections a reader cannot tell apart — they scroll past
 * as a single grey wall, and nothing on the page is findable a second time.
 * So each band here owns a colour, a ground texture and a mark, and the three
 * kinds of card have three different silhouettes: the indexes are capped and
 * medallioned, a family line has a spine down its leading edge, and an old
 * record is a ruled index card with its year set large. Colour never carries
 * a fact on its own — every mark sits beside its own words.
 */

export default function HomePage() {
  const archive = getArchive();
  const s = archive.stats;

  // Alphabetical, explicitly. Never the largest first.
  const lines = [...archive.lineageList]
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 6);

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
            fair to count. Given the kolam ground so the strip reads as a
            plinth under the hero rather than as the next section. */}
        <div className="relative border-t border-[var(--line)] bg-[var(--bg-sunken)] ground-kolam">
          <dl className="mx-auto flex max-w-[1400px] flex-wrap justify-center gap-x-10 gap-y-5 px-4 py-7">
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
                    ? ""
                    : "border-l border-[var(--line)] pl-10 max-sm:border-0 max-sm:pl-0"
                }
              >
                <dd className="font-display text-[1.7rem] font-medium leading-none text-[var(--fg)]">
                  {stat.value}
                </dd>
                <dt className="mt-1.5 text-[0.8rem] text-[var(--fg-faint)]">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------- Who this is for */}
      <section className="ground-grain">
        <div className="mx-auto max-w-[1400px] px-4 py-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-16">
            <div className="max-w-2xl">
              <SectionHead
                eyebrow="Why this exists"
                mark={<MarkHourglass className="h-[1.05rem] w-[1.05rem]" />}
                facet="var(--color-samudra)"
              />
              <h2 className="mt-3 font-display text-[2rem] font-medium leading-tight">
                Memory has a half-life, and the joins are what get lost first.
              </h2>
              <div className="mt-5 space-y-4 text-[1rem] leading-[1.75] text-[var(--fg-soft)]">
                <p>
                  Most families can name four generations without help. The
                  fifth is a first name and a village. The sixth is gone — and
                  with it goes the only evidence that two branches now living in
                  different countries were one household within living memory.
                </p>
                <p>
                  Two families that lost touch in 1910 will usually still agree
                  on three things: the sage their line descends from, the deity
                  the household turns to first, and the village they name as
                  their root. Those three fields do more to reconnect a
                  scattered family than any amount of names and dates, which is
                  why this archive is organised around them.
                </p>
                <p>Written down once, none of it decays again.</p>
              </div>
            </div>

            <aside className="m3-card m3-card-elevated self-start">
              <div className="m3-card-head">
                <span
                  className="section-mark"
                  style={{ ["--facet" as string]: "var(--color-tulsi)" }}
                  aria-hidden
                >
                  <Tick className="h-4 w-4" />
                </span>
                <h3 className="m3-card-title">Who this is for</h3>
              </div>
              <div className="m3-card-body">
                <p className="text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
                  Anyone with a family. There is no community you have to belong
                  to, no list you have to be on, and nothing to prove before you
                  can add a record.
                </p>
                <ul className="mt-5 space-y-3 text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
                  <li className="flex gap-3">
                    <Tick className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-tulsi)]" />
                    <span>
                      Free to read in full, with no account and no membership.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Tick className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-tulsi)]" />
                    <span>
                      Open to correction by anyone, with a reason attached to
                      every change.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <Tick className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-tulsi)]" />
                    <span>
                      Every record says where it came from and how sure of it we
                      are.
                    </span>
                  </li>
                </ul>
                <Link href="/about" className="btn btn-outlined mt-6 w-full">
                  How the archive works
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <KastiRule className="mx-auto max-w-[1400px] px-4" />

      {/* ----------------------------------------------------- Ways in */}
      <section className="mx-auto max-w-[1400px] px-4 py-16">
        <div className="max-w-2xl">
          <SectionHead
            eyebrow="Find a way in"
            mark={<MarkKeys className="h-[1.05rem] w-[1.05rem]" />}
            facet="var(--color-kumkum)"
          />
          <h2 className="mt-3 font-display text-[2rem] font-medium leading-tight">
            Four things a family tends to remember
          </h2>
          <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
            Even when the names have run out, these usually survive — and any
            one of them narrows a search from thousands of people to dozens.
            Each index below lists everything the archive holds, in alphabetical
            order.
          </p>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <WayIn
            title="Surname"
            konkani="आडनांव"
            href="/directory/surname"
            count={s.bySurname.length}
            facet="var(--color-kumkum)"
            mark={<SurnameMark className="h-6 w-6" />}
            body="Usually either an office a family once held, or the village it came from. Both are strong evidence of where a branch sits."
          />
          <WayIn
            title="Gotra"
            konkani="गोत्र"
            href="/directory/gotra"
            count={s.byGotra.length}
            facet="var(--color-samudra)"
            mark={<GotraMark className="h-6 w-6" />}
            body="The rishi a line descends from. Passed father to child and never changed by marriage, so it survives centuries of migration intact."
          />
          <WayIn
            title="Kuladevata"
            konkani="कुलदेवता"
            href="/directory/kuladevata"
            count={s.byKuladevata.length}
            facet="var(--color-haldi)"
            mark={<KuladevataMark className="h-6 w-6" />}
            body="The family deity, and the temple it sits in. A household that has forgotten its village has usually not forgotten this."
          />
          <WayIn
            title="Mool village"
            konkani="मूळ गांव"
            href="/directory/mool"
            count={s.byMool.length}
            facet="var(--color-tulsi)"
            mark={<MoolMark className="h-6 w-6" />}
            body="The place a family names as its root, however many generations ago it left, and however far down the coast it went after."
          />
        </div>
      </section>

      {/* ----------------------------------------------------- Lineages */}
      <section className="border-y border-[var(--line)] bg-[var(--bg-sunken)] ground-weave">
        <div className="mx-auto max-w-[1400px] px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-xl">
              <SectionHead
                eyebrow="Browse"
                mark={<MarkBranch className="h-[1.05rem] w-[1.05rem]" />}
                facet="var(--color-laterite)"
              />
              <h2 className="mt-3 font-display text-[2rem] font-medium leading-tight">
                Family lines
              </h2>
              <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
                A line here is not a surname — it is one connected web of
                relatives. Where two families married, their records join and
                the two lines become one. Shown alphabetically; none of them is
                a headline.
              </p>
            </div>
            <Link href="/lineages" className="btn btn-outlined shrink-0">
              All {s.lineages} lines
            </Link>
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((l) => {
              const apex = archive.people.get(l.apexId);
              return (
                <li key={l.id}>
                  <Link
                    href={`/tree?lineage=${l.id}`}
                    className="line-card group h-full"
                  >
                    <div className="flex min-w-0 flex-1 flex-col py-4 pr-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-display text-[1.2rem] font-medium leading-snug group-hover:text-[var(--accent)]">
                          {l.label}
                        </h3>
                        <span className="chip chip-sm chip-accent shrink-0">
                          {l.size}
                          <span className="sr-only"> people</span>
                        </span>
                      </div>

                      {apex && (
                        <p className="mt-2 text-[0.9rem] text-[var(--fg-soft)]">
                          from{" "}
                          <strong className="font-semibold text-[var(--fg)]">
                            {fullName(apex)}
                          </strong>
                          {birthYear(apex) && `, born ${birthYear(apex)}`}
                        </p>
                      )}

                      {/* One pip per generation. A count you can see the size
                          of without reading it. */}
                      <div className="mt-auto flex items-center gap-2.5 pt-4">
                        <span
                          className="flex items-center gap-[3px]"
                          aria-hidden
                        >
                          {Array.from({
                            length: Math.min(l.generations, 12),
                          }).map((_, i) => (
                            <span key={i} className="gen-pip" />
                          ))}
                        </span>
                        <span className="text-[0.8rem] text-[var(--fg-faint)]">
                          {l.generations} generations
                          {l.earliestYear && l.latestYear
                            ? ` · ${l.earliestYear}–${l.latestYear}`
                            : ""}
                        </span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* -------------------------------------------------------- Oldest */}
      {oldest.length > 0 && (
        <section className="mx-auto max-w-[1400px] px-4 py-16">
          <div className="max-w-2xl">
            <SectionHead
              eyebrow="Furthest back"
              mark={<Deepa className="h-[1.05rem] w-[1.05rem]" />}
              facet="var(--color-gold)"
            />
            <h2 className="mt-3 font-display text-[2rem] font-medium leading-tight">
              The oldest names in the archive
            </h2>
            <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
              Every line stops somewhere. These are the earliest ancestors
              anyone has been able to name — if your family holds a household
              ledger or a temple register that reaches further back, it is worth
              more than you think.
            </p>
          </div>
          <ul className="mt-8 grid gap-4 sm:grid-cols-3">
            {oldest.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/person/${p.id}`}
                  className="stub-card group block h-full p-5"
                >
                  {/* The year is the subject of this card, so it is set as
                      the subject and the name reads under it. */}
                  <span className="block font-display text-[2rem] font-medium leading-none tabular-nums text-[var(--accent)]">
                    {birthYear(p)}
                  </span>
                  <span className="mt-2.5 block font-display text-[1.15rem] font-medium leading-snug group-hover:text-[var(--accent)]">
                    {fullName(p)}
                  </span>
                  <span className="mt-1 block text-[0.83rem] text-[var(--fg-faint)]">
                    born{" "}
                    {p.mool
                      ? `in ${archive.places.get(p.mool)?.name ?? p.mool}`
                      : "— place not recorded"}
                  </span>
                  {p.epithet && (
                    <span className="mt-3 block border-t border-[var(--line)] pt-3 text-[0.88rem] italic leading-relaxed text-[var(--fg-soft)]">
                      {p.epithet}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ------------------------------------------------------ Contribute */}
      <section className="relative overflow-hidden border-t border-[var(--line)] bg-[var(--bg-sunken)]">
        <div
          className="mandala-bed opacity-[0.1]"
          style={{
            maskImage: "radial-gradient(ellipse 60% 90% at 88% 50%, #000 20%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 60% 90% at 88% 50%, #000 20%, transparent 72%)",
          }}
        >
          <Mandala className="ml-[55%] h-[42rem] w-[42rem] max-w-none shrink-0" folds={12} />
        </div>

        <div className="relative mx-auto max-w-[1400px] px-4 py-16">
          <div className="max-w-2xl">
            <SectionHead
              eyebrow={
                <>
                  <span className="deva" lang="kok">
                    योगदान
                  </span>{" "}
                  · Contribute
                </>
              }
              mark={<MarkQuill className="h-[1.05rem] w-[1.05rem]" />}
              facet="var(--accent)"
            />
            <h2 className="mt-3 font-display text-[2rem] font-medium leading-tight sm:text-[2.4rem]">
              You know something this archive does not.
            </h2>
            <p className="mt-4 text-[1.05rem] leading-relaxed text-[var(--fg-soft)]">
              A grandmother&rsquo;s maiden name. The village on an old land
              document. Which brother went to the city in 1938 and which stayed.
              Send one fact or a hundred — every submission is read by a person
              before it goes in, and every record says where it came from.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
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

/** An eyebrow with its section's mark beside it. */
function SectionHead({
  eyebrow,
  mark,
  facet,
}: {
  eyebrow: React.ReactNode;
  mark: React.ReactNode;
  facet: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="section-mark"
        style={{ ["--facet" as string]: facet }}
        aria-hidden
      >
        {mark}
      </span>
      <p className="eyebrow">{eyebrow}</p>
    </div>
  );
}

function Tick({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m4 10.5 4 4 8-9" />
    </svg>
  );
}

function WayIn({
  title,
  konkani,
  href,
  count,
  body,
  facet,
  mark,
}: {
  title: string;
  konkani: string;
  href: string;
  count: number;
  body: string;
  facet: string;
  mark: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="facet-card group p-5"
      style={{ ["--facet" as string]: facet }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="facet-medallion" aria-hidden>
          {mark}
        </span>
        <span className="deva text-[0.95rem] text-[var(--fg-faint)]" lang="kok">
          {konkani}
        </span>
      </div>

      <h3 className="mt-4 font-display text-[1.25rem] font-medium">{title}</h3>

      <p className="mt-2 text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
        {body}
      </p>

      <p className="facet-link mt-auto pt-4 text-[0.85rem] font-medium">
        Browse all {count.toLocaleString()}
        <span
          className="inline-block transition-transform group-hover:translate-x-1"
          aria-hidden
        >
          {" "}
          →
        </span>
      </p>
    </Link>
  );
}
