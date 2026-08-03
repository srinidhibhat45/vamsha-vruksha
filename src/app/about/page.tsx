import type { Metadata } from "next";
import { AppLink as Link } from "@/components/AppLink";
import { getArchive } from "@/lib/archive";
import { KastiRule } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "About the archive",
  description:
    "How this lineage archive is built, what it holds, what it is biased towards, and how to add to it.",
};

const GLOSSARY = [
  { term: "Vansh vriksha", deva: "वंशवृक्ष", gloss: "Family tree — literally 'lineage tree'." },
  { term: "Gotra", deva: "गोत्र", gloss: "The rishi a patriline descends from. Passed father to child, unchanged by marriage." },
  { term: "Pravara", deva: "प्रवर", gloss: "The list of ancestral sages recited with a gotra, usually three or five names." },
  { term: "Kuladevata", deva: "कुलदेवता", gloss: "The family deity — for many families a specific named temple rather than a deity in general." },
  { term: "Mool", deva: "मूळ", gloss: "Root — the ancestral village a family names as its origin." },
  { term: "Matha", deva: "मठ", gloss: "The monastic seat a family owes allegiance to." },
  { term: "Vahi", deva: "वही", gloss: "A household ledger. Often the only written record of births and deaths before civil registration." },
  { term: "Mahajan", deva: "महाजन", gloss: "A hereditary trustee of a temple, a role attached to particular families." },
  { term: "Bhanap", deva: "भानप", gloss: "The community's own name for Chitrapur Saraswats." },
  { term: "Munji", deva: "मुंज", gloss: "The thread ceremony, upanayana." },
  { term: "Ajjo / Ajji", deva: "आज्जो / आज्जी", gloss: "Grandfather / grandmother." },
  { term: "Mama / Kaka", deva: "मामा / काका", gloss: "Mother's brother / father's younger brother — two different words, two different roles." },
];

export default function AboutPage() {
  const archive = getArchive();
  const s = archive.stats;

  return (
    <div className="mx-auto max-w-[820px] px-4 py-12">
      <header>
        <p className="eyebrow">
          <span className="deva" lang="kok">
            विशीं
          </span>{" "}
          · About
        </p>
        <h1 className="mt-2 font-display text-[2.6rem] font-medium leading-tight">
          About this archive
        </h1>
        <p className="mt-4 text-[1.1rem] leading-relaxed text-[var(--fg-soft)]">
          A public, free, permanently open record of families — any family, from
          any community, wherever in the world it now lives. There is no login,
          no membership, and no paywall, and there is not going to be one.
        </p>
      </header>

      <section id="everyone" className="mt-10 scroll-mt-24">
        <h2 className="font-display text-[1.75rem] font-medium">
          Who it is for
        </h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Everyone. The archive is not the property of one community and does
          not keep a section for any of them. Its vocabularies — gotra,
          kuladevata, mool village, matha — are recorded because they are what
          households actually remember and what reconnects branches that lost
          touch, not as a test of who belongs. A family that uses none of them
          is as welcome as one that uses all four; leave the fields blank and
          the record still stands.
        </p>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Where you see a term you do not use, read it as one community&rsquo;s
          word for something most families have some version of. The glossary at
          the foot of this page explains every one of them.
        </p>
      </section>

      <KastiRule className="my-10" />

      {archive.sampleOnly && (
        <section id="sample" className="scroll-mt-24">
          <div className="rounded-[var(--shape-lg)] border-2 border-[var(--accent)] p-6">
            <h2 className="font-display text-[1.75rem] font-medium text-[var(--accent)]">
              What you are looking at is demonstration data
            </h2>
            <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
              Every one of the {s.people.toLocaleString()} people currently in
              this archive is <strong>fictional</strong>. They were generated so
              that the tree, the search and the relationship finder could be
              built and tested against something realistic before real families
              trust it with their records.
            </p>
            <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
              What is <em>not</em> invented is everything around them. The
              gotras and their pravaras, the four mathas, the Goan temples and
              the villages their deities came from, the surname patterns, the
              patronymic naming convention, the migration route from Goa down
              the Karavali coast to Bombay and then abroad — those are real, and
              they are the part that took the work.
            </p>
            <div className="mt-5 rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-4">
              <h3 className="text-[0.95rem] font-semibold">
                To replace it with real records
              </h3>
              <ol className="mt-2 space-y-2 text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
                <li>
                  1. Delete{" "}
                  <code className="rounded bg-[var(--bg-inset)] px-1 py-0.5">
                    data/people/sample-*.json
                  </code>
                </li>
                <li>
                  2. Put real records in{" "}
                  <code className="rounded bg-[var(--bg-inset)] px-1 py-0.5">
                    data/people/
                  </code>{" "}
                  — hand-written JSON, or via{" "}
                  <code className="rounded bg-[var(--bg-inset)] px-1 py-0.5">
                    npm run import:gedcom
                  </code>{" "}
                  from any genealogy program, or{" "}
                  <code className="rounded bg-[var(--bg-inset)] px-1 py-0.5">
                    npm run import:csv
                  </code>{" "}
                  from a spreadsheet
                </li>
                <li>
                  3. Run{" "}
                  <code className="rounded bg-[var(--bg-inset)] px-1 py-0.5">
                    npm run data:check
                  </code>{" "}
                  — it catches impossible dates, broken links and ancestry loops
                </li>
              </ol>
              <p className="mt-3 text-[0.88rem] text-[var(--fg-faint)]">
                This banner disappears by itself as soon as a single
                non-sample record is present.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="font-display text-[1.75rem] font-medium">How it is put together</h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Records are plain JSON files kept in version control. That is an
          unglamorous choice with one large advantage: every change to every
          person has an author, a date and a reason attached to it forever. When
          two cousins disagree about a birth year in 2035, the history will say
          who claimed what and on what basis. A database row that was quietly
          edited cannot do that.
        </p>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          The whole archive is loaded into memory when the site starts, because
          every interesting question here is a graph traversal — six generations
          of descendants, the path between two people, which families share a
          kuladevata — and those are answered in microseconds against objects in
          memory rather than in round trips to a database.
        </p>
      </section>

      <section id="sources" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.75rem] font-medium">What counts as a source</h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Everything, as long as it is labelled. A record backed by a municipal
          register and a record backed by &ldquo;my grandmother said so&rdquo;
          are both worth having; what would ruin the archive is not being able
          to tell them apart. So every person carries one of four marks:
        </p>
        <dl className="mt-4 space-y-3">
          {[
            ["Documented", "var(--color-tulsi)", "A register, certificate, gazette entry, horoscope or matha vahi that someone can point to."],
            ["Corroborated", "var(--color-gold)", "More than one family member independently says the same thing."],
            ["Family memory", "transparent", "A single oral account. Usually right about who, looser about when."],
            ["Unverified", "transparent", "Recorded, but flagged so nobody builds a branch on top of it."],
          ].map(([label, colour, note]) => (
            <div key={label} className="flex gap-3">
              <span
                className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                style={{
                  background: colour,
                  border: colour === "transparent" ? "1px solid var(--fg-faint)" : "none",
                }}
                aria-hidden
              />
              <div>
                <dt className="text-[0.9rem] font-medium">{label}</dt>
                <dd className="text-[0.85rem] text-[var(--fg-soft)]">{note}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section id="bias" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.75rem] font-medium">What this record is biased towards</h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Any genealogy is a record of who got written down, which is never the
          same as who lived. Three distortions are worth naming out loud,
          because they shape everything you will see here:
        </p>
        <ul className="mt-4 space-y-4">
          <li>
            <h3 className="font-display text-[1.2rem] font-medium">It follows sons</h3>
            <p className="mt-1.5 text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
              Traditional registers track the male line. A daughter&rsquo;s
              children were recorded in her husband&rsquo;s family, so in her
              own family&rsquo;s book her line simply stops — not because it
              ended, but because it was written down elsewhere. Half the tree is
              missing at every generation, and it is always the same half.
              Adding the women&rsquo;s lines back is one of the most useful
              things a contributor can do.
            </p>
          </li>
          <li>
            <h3 className="font-display text-[1.2rem] font-medium">It follows literacy and money</h3>
            <p className="mt-1.5 text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
              Families that kept a vahi, endowed a temple or sent a son to
              Bombay are over-represented, because those acts left paper. The
              branch that stayed in the village and farmed is the branch least
              likely to appear.
            </p>
          </li>
          <li>
            <h3 className="font-display text-[1.2rem] font-medium">It follows whoever is online now</h3>
            <p className="mt-1.5 text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
              An archive built from submissions grows fastest where its
              contributors live. Read the{" "}
              <Link href="/diaspora" className="link-underline text-[var(--accent)]">
                diaspora chart
              </Link>{" "}
              as a picture of this archive&rsquo;s coverage, not of any
              population.
            </p>
          </li>
        </ul>
      </section>

      <section id="privacy" className="mt-12 scroll-mt-24">
        <h2 className="font-display text-[1.75rem] font-medium">Living people</h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Everything here is public and indexed by search engines. That is the
          point of it, and it is also the risk. The rules are short:
        </p>
        <ul className="mt-3 space-y-2.5 text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
          <li>
            — Ask a living person before adding them. Their name, year of birth
            and family links are enough for genealogy.
          </li>
          <li>
            — Never submit addresses, phone numbers, exact dates of birth,
            identity numbers, or anything to do with health, money or a family
            dispute. These are removed in review.
          </li>
          <li>
            — Anyone can ask to be reduced to a name, or removed entirely, and
            that will be done without argument. Write to the maintainers through
            the{" "}
            <Link href="/contribute" className="link-underline text-[var(--accent)]">
              contribute form
            </Link>
            .
          </li>
          <li>
            — Children are recorded as a name and a parent link only, and never
            with a school, a photograph or a location.
          </li>
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[1.75rem] font-medium">On names and spellings</h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          There is no correct roman spelling of a Konkani name, and pretending
          otherwise would lose half the matches. Search here folds a name down
          along the axes that actually vary — aspiration (bh/b, th/t), sibilants
          (sh/s), long vowels (aa/a, ee/i), v and w, the Sanskrit final -a, and
          ksh/x — so <em>Shreenivas</em>, <em>Srinivasa</em>,{" "}
          <em>Sreenivas</em> and <em>Shrinivas</em> are one name, and{" "}
          <em>Laxmi</em> finds <em>Lakshmi</em>. Spellings that diverged through
          different colonial orthographies rather than through pronunciation —
          Shenoy and Sinai, Kamath and Camotim — are linked by hand.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-[1.75rem] font-medium">A short glossary</h2>
        <dl className="mt-4 divide-y divide-[var(--line)]">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="grid gap-1 py-3 sm:grid-cols-[190px_1fr]">
              <dt>
                <span className="font-medium">{g.term}</span>
                <span className="deva ml-2 text-[var(--fg-faint)]" lang="kok">{g.deva}</span>
              </dt>
              <dd className="text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">{g.gloss}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12 surface rangoli-field p-8 text-center">
        <h2 className="font-display text-[1.9rem] font-medium leading-tight">
          The archive is only as good as what people send it
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[1.05rem] leading-relaxed text-[var(--fg-soft)]">
          If you have a vahi in a cupboard, a horoscope with a date on it, or an
          aunt who can still name six generations, that is the rarest material
          there is. Most of it will be gone within twenty years.
        </p>
        <Link href="/contribute" className="btn btn-filled btn-lg mt-7">
          Add what you have
        </Link>
      </section>
    </div>
  );
}
