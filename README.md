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
| `/diaspora` | Where the community went, by generation — and the temples they still name |
| `/contribute` | Submission form — one person, or a whole family at once. No account needed |
| `/admin` | Maintainer tools: review queue, record editing, whole-family entry, vocabulary proposals, behind a sign-in |
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

### Whole families, in one piece

The commonest real contribution is not *"here is my grandfather"* — it is
*"here are my grandparents, their six children, who each of them married, and
which ones went to Bombay"*, learned in one afternoon with an elderly relative.
Sent one person at a time that is thirty forms, each unable to name a parent
who has not been published yet.

So **Add a whole family** (`/contribute`) and **Add a family** (`/admin/people/family`)
take the branch as one object. Both run the same builder — `src/components/family/FamilyBuilder.tsx` —
and the only difference is the far end: a contributor's draft goes to the queue,
a maintainer's is written straight to the archive.

Three things make it work:

- **Relationships are stated by where you add somebody**, not typed into a field.
  The buttons say *add her father*, *add a child*, *add a marriage*, so a link
  cannot be dangling or half-entered, and nothing depends on publication order.
- **A row can be somebody already in the archive.** Branches almost always hang
  off a person who is already recorded, and that row is *linked* rather than
  retyped — which is the whole mechanism keeping a second copy of one
  grandfather out of the database.
- **The drawing is the workspace.** Cards are selected on the tree, the four
  relationship buttons appear around the selected card, and the form for
  whoever is selected sits beside the drawing rather than under it. The canvas
  pans, pinches and zooms on the same hook the reader's tree uses
  (`src/components/tree/usePanZoom.ts`), and it is laid out by
  `src/lib/draftLayout.ts`, which guarantees every person in the draft is drawn
  — including the ones a depth-limited walk from an apex cannot reach.
  Children are added from the *junction* under a couple, so a child can never
  be attached to the wrong marriage.

Drafts carry draft-local keys and are resolved to real ids in a single pass by
`createFamily` in `src/lib/peopleStore.ts` — every id minted against one
snapshot, every relationship rewritten, one atomic write. `checkDraft`
(`src/lib/family.ts`) refuses contradictions (a child born before their father,
an ancestry cycle) and merely *warns* about improbabilities (a mother of
thirteen), because real families produce records that look wrong and are not.

### Not ending up with two of the same ancestor

The most damaging thing that happens to a community archive is a duplicated
person: from then on half the descendants hang off one copy and half off the
other, and it is very hard to unpick years later.

`src/lib/match.ts` is the defence, and it is a different problem from search.
Search is asked by a reader who will recognise the record when they see it;
this is asked on behalf of somebody halfway through typing a name in, where a
missed match is expensive and silent. It scores against **every name surface a
record carries** — display name, `aka` list, birth name, Devanagari — so an
ancestor recorded under a nickname is still found, and it reports *which* one
hit, because "recorded here as Nanu" is what tells a contributor this is their
man. On top of the phonetic folding it uses the surname families that folding
cannot bridge (Shenoy/Sinai, Kamath/Camotim), and then the lineage fields:
gotra, mool and kuladevata agreeing is strong evidence *for*, and a gotra
disagreeing is strong evidence *against*, since it is patrilineal and does not
change.

What is shown is never the score. It is the reasons — *same gotra and mool, and
her father's name matches* — because a contributor can check that against what
they know and cannot check 87%. And the suggestion carries an action: linking
this row to that record, rather than a warning after the fact.

### Photographs

Optional everywhere, and compressed in the browser before upload
(`src/lib/imageCompress.ts`): 1600px on the long edge, walked down towards
~340 KB, with a 400px thumbnail. Re-encoding via canvas also **strips EXIF**,
which is a privacy fix rather than a size one — phone photographs carry the GPS
coordinates of where they were taken, and a public, search-indexed archive that
quietly publishes contributors' home addresses would be a serious harm nobody
uploading a picture of their grandmother knows they are risking.

Storage is behind `src/lib/mediaStore.ts`: Netlify Blobs in a deployment,
`data/media/` on a laptop, chosen from the environment. Records always store
`/api/media/<key>` rather than a bucket url, so the storage can change in a
decade without rewriting every record that points at a photograph.

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

`/admin/vocabulary` is the third screen: the gotras, kuladevatas, mathas,
communities and villages contributors have typed because the list did not have
them. Each can be confirmed into the list, merged into the entry it is a
spelling of, or discarded — and merging and discarding both repoint the records
already using it, so nothing is ever left pointing at a name that has gone.

**Deploying to a serverless host** with an ephemeral filesystem means every
write in the app has to land somewhere that outlives one function
invocation. Three modules write, and each picks its backend from the
environment the same way `src/lib/mediaStore.ts` already did for
photographs — nothing to configure on Netlify itself, only the env vars in
`.env.local.example`'s deployment section, set once in the Netlify dashboard:

- `src/lib/submissions.ts` (the moderation queue) → Netlify Blobs. A raw,
  anonymous, unreviewed submission does not need git's provenance guarantees
  yet — that starts to matter once a maintainer has looked at it.
- `src/lib/peopleStore.ts` and `src/lib/vocabStore.ts` (everything that
  writes into `data/people/` and `data/reference/`, all of it behind the
  admin session) → a commit to this repository's GitHub remote, via
  `src/lib/github.ts`, when `GITHUB_TOKEN` is set. This is what turns
  "approving writes the record and it appears at once… commit the change
  afterwards" from a manual step a maintainer has to remember into something
  that happens automatically and still lands as a real, human-attributed
  commit — the archive's core design promise (an author, a date and a reason
  on every change) survives moving off a laptop. `src/lib/dataFiles.ts` is
  the shared seam: an in-memory overlay keeps a maintainer's own writes
  visible to themselves immediately, while Netlify's rebuild-on-push makes
  the change visible to everyone else within a couple of minutes.
- Photographs → Netlify Blobs, unchanged.

Without `GITHUB_TOKEN`, `peopleStore.ts`/`vocabStore.ts` fall back to writing
straight to the local filesystem, which is correct for `npm run dev` and
silently loses every admin write on Netlify — the same trap the queue used to
fall into. Set it before real maintainers start approving real submissions.

---

## Going to production

Everything below is already in the code; this is the checklist for turning
it on.

**Set in the Netlify dashboard, not in git:**

- `ADMIN_USERNAME`, `ADMIN_PASSWORD` — a production build (`NODE_ENV` is set
  to `production` by `next build`) refuses to authenticate the built-in
  `admin`/`admin` pair at all, so `/admin` is unreachable until these are set.
- `GITHUB_TOKEN` (and `GITHUB_REPO` if this deployment's repo is not
  `srinidhibhat45/vamsha-vruksha`) — without it, admin writes fall back to a
  filesystem that Netlify wipes on every cold start. See the deployment
  section above.
- `NEXT_PUBLIC_SITE_URL` — the real domain. Drives canonical links, the
  sitemap, robots.txt and Open Graph tags; get it wrong and search engines
  index the wrong host.

Full explanations of each are in `.env.local.example`.

**Already wired in, nothing to configure:**

- **Security headers** (`next.config.mjs`) — a Content-Security-Policy,
  `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`
  and a locked-down `Permissions-Policy`, sent on every response. The CSP's
  `script-src` carries `'unsafe-inline'` as a deliberate, documented
  trade-off — see the comment above `CSP` in that file for why a nonce-based
  policy is not compatible with this app's no-middleware design.
- **Rate limiting** (`src/lib/rateLimit.ts`) — `/api/submit`, `/api/media`
  and `/api/match` are IP-throttled in-memory, on top of the login throttle
  `/api/admin/login` already had. Honest about its limits in its own
  comment: per-instance, not distributed, a backstop against casual abuse
  rather than a determined attacker.
- **SEO** — `sitemap.xml` and `robots.txt` (both generated from the live
  archive, so a new record is in the sitemap on the next build), canonical
  URLs on every page, JSON-LD (`WebSite`+`SearchAction` site-wide, `Person`
  and `BreadcrumbList` on every record — see `src/components/JsonLd.tsx`),
  and a generated Open Graph image.
- **Privacy** — see the section below; enforced by review, not by code, which
  is why it is a policy a human applies rather than a validator rule.

`npm run build` runs `npm run data:check` first either way, so a broken
archive — or a TypeScript error introduced anywhere in the above — cannot
ship regardless of which of these are configured.

---

## Public JSON endpoints

An open archive should be readable by machines too. These are unauthenticated
and CORS-free by default:

| Endpoint | Returns |
| --- | --- |
| `GET /api/suggest?q=` | Type-ahead matches, spelling-tolerant |
| `GET /api/tree?lineage=L0001` | A whole lineage subgraph — people, unions, parentage |
| `GET /api/relate?a=&b=` | The relationship between two people, with Konkani terms |
| `POST /api/match` | Records that may already be the person being described — name, dates, lineage fields and relatives, answered with reasons |
| `POST /api/submit` | Contribute a record or a whole family (goes to the moderation queue) |
| `POST /api/media` | Upload a contributed photograph; returns the url a submission references |
| `GET /api/media/<key>` | Serve a stored photograph |

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
| `temples.json` | Photographs of the temples and mathas, with photographer and licence |

### When the list does not have it

A controlled vocabulary is what stops one gotra becoming four spellings, and it
is also never complete — the person who knows the missing kuladevata is the one
looking at a dropdown that lacks it. So every one of these fields takes a typed
answer as well as a chosen one. What was typed is carried as `new:<what they
wrote>` (`src/lib/vocabulary.ts`) and resolved when the submission is published
(`src/lib/vocabStore.ts`): a spelling the matcher already recognises resolves
onto the existing entry, and anything else is appended to the vocabulary file
with `"pending": true`.

A pending entry is used by the record that proposed it and shown wherever that
record is, but it is filtered out of every dropdown until a maintainer confirms
it at `/admin/vocabulary`, where it can also be merged into an existing entry or
discarded — both of which repoint the records already carrying it. Matching for
proposals is deliberately **strict** (exact phonetic key only): the fuzzy passes
that serve a reviewed bulk import would silently rewrite *Kolambe* into *Kollam*
here, with nobody ever told.

### The temple photographs

`data/reference/temple-sources.json` says which Commons file belongs to which
deity and what to say about it; `npm run media:temples` fetches each one,
compresses it to 1400px, and writes `data/reference/temples.json` with the
photographer, the licence and the source page recorded per image. The files land
in `public/temples/` and **are committed** — an archive that depends on somebody
else's server still serving a photograph in 2050 has not preserved anything.

The script will not publish an image whose licence or author it could not read,
and `npm run data:check` fails the build if a committed temple entry has lost
either — attribution is a licence condition, and an archive that exists to keep
people's names attached to what they did does not get to strip a photographer's.

They earn their place beyond decoration: the kuladevata is the field most likely
to reconnect two branches that lost each other, because a family that has
forgotten its village has almost never forgotten its deity. They appear on
`/diaspora`, in `/directory/kuladevata`, and on the record of anyone who names
one. Several deities in `kuladevatas.json` have no freely licensed photograph
yet — those entries simply render without one.

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
  draftLayout.ts   generation layout for a family being entered — draws everyone
  family.ts        whole-family drafts: shape, coherence checks, preview source
  refmatch.ts      resolves free text onto the vocabularies
  vocabulary.ts    the shape of a typed-not-chosen reference value
  vocabStore.ts    resolving those, and the maintainer's confirm/merge/discard
  treeSource.ts    the payload the viewer runs on
  submissions.ts   the moderation queue
```

`src/lib/layout.ts` deliberately imports nothing from React or Node: the same
code runs on the server and in the browser, which is why re-rooting the tree on
any person is instant and needs no round trip.

`draftLayout.ts` is a second layout rather than a flag on the first, because
reading and entering want opposite guarantees. `layout.ts` walks outward from a
focus person to a depth — right for a reader asking about somebody, and wrong
for a draft, where anyone the walk cannot reach (a row not joined up yet, a
married-in spouse's father) silently vanishes from the drawing that is supposed
to be showing you your own work. `draftLayout.ts` works in generations instead
and draws **every** person exactly once. Both emit the same node and link
shapes, so one canvas renders either.

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4. Four runtime
dependencies. No database, no ORM, no state library, no chart library, no
component library. The tree, the diaspora chart and every ornament are hand-written SVG.
