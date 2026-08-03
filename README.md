# Vansh Vriksha — the Saraswat Lineage Archive

A public, free, no-login family tree and archive for Saraswat families — Goud
Saraswat, Chitrapur (Bhanap), Rajapur, Kudaldeshkar and their kin — wherever in
the world they now live.

Everything is readable by anyone. Anyone can contribute, without an account.
Every record carries its provenance: who said it, what it is based on, and how
much weight to give it.

```bash
npm install
npm run data:seed     # generate the demonstration dataset (already committed)
npm run dev           # http://localhost:3000
```

---

## What is here

| Route | What it does |
| --- | --- |
| `/` | Landing page: search, statistics, family lines, ways in |
| `/tree` | The viewer — pan/zoom canvas, ancestors, descendants, hourglass |
| `/search` | Spelling-tolerant search with facets on every lineage field |
| `/person/[id]` | Full record: family, timeline, male-line descent, sources |
| `/lineages` | Every connected family line in the archive |
| `/directory/[facet]` | Indexes of surnames, gotras, kuladevatas, mool villages, mathas |
| `/relate` | How any two people are related, in English and Konkani |
| `/diaspora` | Where the community went, by generation |
| `/contribute` | Submission form — no account needed |
| `/admin` | Maintainer tools: review queue and record editing, behind a sign-in |
| `/about` | Method, biases, privacy, glossary |

---

## The four ideas this is built on

**1. Genealogy is a graph problem, so keep the graph in memory.**
Every interesting question — six generations of descendants, the path between
two people, which families share a kuladevata — is a traversal. The whole
archive loads into memory at boot (`src/lib/archive.ts`), so those answers take
microseconds instead of recursive SQL. Half a million people is a few hundred
megabytes of plain objects.

**2. Records live in git, not in a database.**
`data/people/*.json` is the archive. Every change to every person has an author,
a date and a reason attached to it forever. When two cousins disagree about a
birth year in 2035, the history says who claimed what and on what basis. This is
the single most important design decision in the project.

**3. Roman spellings of Konkani names vary predictably, so fold them.**
`src/lib/translit.ts` reduces a name along the axes that actually vary —
aspiration (bh/b, th/t), sibilants (sh/s), long vowels (aa/a, ee/i, oo/u), v/w,
the Sanskrit final -a, ksh/x — then allows a bounded edit distance on top.
*Shreenivas*, *Srinivasa*, *Sreenivas* and *Shrinivas* are one name; *Laxmi*
finds *Lakshmi*. Spellings that diverged through different colonial
orthographies rather than through pronunciation (Shenoy/Sinai, Kamath/Camotim)
are linked by hand.

**4. Children belong to a couple, not to a parent.**
The layout engine (`src/lib/layout.ts`) draws union nodes: a couple sits side by
side, a junction sits between and below them, children hang off the junction.
Two marriages produce two visibly separate sets of children. Forcing genealogy
into a plain tree makes half-siblings look like full siblings, which is the
distinction families care most about.

---

## Loading real data

The archive currently holds a **generated demonstration dataset**. Every person
in it is fictional and carries `"sample": true`; the site shows a standing
notice for as long as that is the only thing present, and the notice disappears
by itself when one real record arrives.

What is *not* invented: the gotras and their pravaras, the four mathas, the Goan
temples and the villages their deities came from, the surname patterns, the
patronymic naming convention, and the migration route from Goa down the Karavali
coast to Bombay and then abroad. Those are real and live in `data/reference/`.

```bash
rm data/people/sample-*.json

npm run import:gedcom -- ~/family.ged        # from any genealogy program
npm run import:csv    -- ~/family.csv        # from a spreadsheet
# …or hand-write JSON into data/people/

npm run data:check                           # always run this before committing
```

Both importers resolve free text onto the controlled vocabularies, so
`Shri Mangesh Temple` → `mangesh`, `Bhardwaj` → `bharadwaja` and `Cortalim` →
`kushasthali`. Anything they cannot match is reported rather than silently
slugified.

### `npm run data:check`

The validator is the thing that keeps an open archive from decaying. It catches:

- **Referential errors** — a `fatherId` pointing at nobody, a gotra spelled a new way
- **Chronological impossibilities** — a child born before their mother, a marriage after a death, a parent aged nine
- **Ancestry cycles** — someone who ends up as their own ancestor

None of these are visible when you read a single record; all of them are obvious
when you check the graph. It exits non-zero on errors and is wired into
`npm run build`, so a broken archive cannot ship.

---

## Contributions and moderation

Submissions append to `data/submissions/queue.jsonl` — append-only, so
concurrent writes cannot corrupt each other. Nothing is published automatically.

> The failure mode of an open family tree is not spam. It is a confidently wrong
> parent link that quietly rewrites three hundred people's ancestry and is
> believed because it is written down.

Review at `/admin`, behind a single maintainer sign-in. There is one account,
set with `ADMIN_USERNAME` and `ADMIN_PASSWORD` (see `.env.local.example`); unset,
it falls back to `admin` / `admin`, which is fine on a laptop and unacceptable
anywhere else. The session is a signed, HttpOnly cookie — `src/lib/adminAuth.ts`.

A reviewer can approve, decline, or **ask for changes**, which is the one most
queues lack. Most submissions are neither right nor wrong: they are a real
family memory with a date nobody can place, and the only useful reply is to ask.

Approving writes the record into `data/people/` and it is live at once. Commit
afterwards — git is still the provenance log, and a commit with a human name on
it is worth more than an automated write.

Beyond the queue, `/admin/people` is the full record editor: add, correct,
remove, and mark someone deceased. Two rules there are worth knowing:

- A field cleared in the editor is cleared on the record — that is how a wrong
  gotra gets retracted. A field left out of a *submission* is ignored instead,
  so a contributor fixing a death year cannot blank a gotra by not retyping it.
- Deleting a person repairs every reference to them first. A dangling `fatherId`
  is worse than a missing record: the tree draws an edge to someone who is not
  there, and the lineage silently splits in two. The confirmation says how many
  links will be cut before you agree to it.

**Deploying to a serverless host** with an ephemeral filesystem means replacing
the write functions in `src/lib/submissions.ts` and `src/lib/peopleStore.ts`
with a database or object-store call. Nothing else in the app writes.

---

## Public JSON endpoints

An open archive should be readable by machines too. These are unauthenticated
and CORS-free by default:

| Endpoint | Returns |
| --- | --- |
| `GET /api/suggest?q=` | Type-ahead matches, spelling-tolerant |
| `GET /api/tree?lineage=L0001` | A whole lineage subgraph — people, unions, parentage |
| `GET /api/relate?a=&b=` | The relationship between two people, with Konkani terms |
| `POST /api/submit` | Contribute a record (goes to the moderation queue) |

The endpoints under `/api/admin/*` are not on this list. They require the
maintainer session and they write to disk.

---

## The data model

A `Person` (`src/lib/types.ts`) is the unit of contribution. Contributors think
in terms of *"my father was X"*, so parentage lives on the person as
`fatherId` / `motherId`. Union/family nodes are **derived** at load time because
the renderer needs them — nobody authors them by hand.

Everything culturally specific is a reference into `data/reference/`:

| File | What it holds |
| --- | --- |
| `gotras.json` | Gotras with their pravara lists |
| `maths.json` | The four principal mathas, plus Shringeri and Kanchi |
| `kuladevatas.json` | Family deities, their temples, and where each was moved from |
| `places.json` | Mool villages, Karavali settlements, diaspora cities, with coordinates |
| `communities.json` | Sub-communities within and adjacent to the Saraswat fold |
| `surnames.json` | Surname derivations — office-names and village-names |

That indirection is what makes the directory pages worth having: it stops
`Bharadwaj`, `Bhardwaj` and `Bhāradvāja` from becoming three separate entries.

---

## Known biases

Any genealogy records who got written down, not who lived. Three distortions
shape everything here, and `/about#bias` states them on the site itself:

- **It follows sons.** Daughters' children were recorded in the husband's
  family. Half the tree is missing at every generation and it is always the same
  half. The seed generator reproduces this deliberately rather than pretending
  to a symmetry the sources do not have.
- **It follows literacy and money.** Families that kept a vahi or endowed a
  temple left paper. The branch that stayed in the village and farmed did not.
- **It follows whoever is online now.** Read `/diaspora` as a picture of this
  archive's coverage, not of the community.

---

## Privacy

Public and search-indexed by design. Living people are recorded with name, year
and family links only — never addresses, phone numbers, exact dates of birth,
identity numbers, health or finances. Children get a name and a parent link and
nothing else. Anyone can ask to be reduced to a name or removed entirely.

---

## Layout

```
data/
  reference/       controlled vocabularies — the cultural backbone
  people/          the archive itself, one file per family
  submissions/     moderation queue (gitignored)
scripts/
  generate-seed.ts   demonstration dataset
  validate.ts        integrity check — run before every commit
  import-gedcom.ts   from genealogy software
  import-csv.ts      from a spreadsheet
src/lib/
  types.ts         the domain model
  archive.ts       loading, unions, lineages, generations, statistics
  translit.ts      phonetic folding for romanised Indic names
  search.ts        inverted index over literal + phonetic keys, with facets
  kinship.ts       relationship solver with Konkani kin terms
  layout.ts        union-aware tidy tree layout (no React, no Node)
  refmatch.ts      resolves free text onto the vocabularies
  treeSource.ts    the payload the viewer runs on
  submissions.ts   the moderation queue
```

`src/lib/layout.ts` deliberately imports nothing from React or Node: the same
code runs on the server and in the browser, which is why re-rooting the tree on
any person is instant and needs no round trip.

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4. Four runtime
dependencies. No database, no ORM, no state library, no chart library, no
component library. The tree, the diaspora chart and every ornament are hand-written SVG.
