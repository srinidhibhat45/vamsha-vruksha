/**
 * Core domain model for the Saraswat Lineage archive.
 *
 * Design notes
 * ------------
 * 1. A *Person* record is the unit of contribution. Contributors think in terms
 *    of "my father was X, my mother was Y", so parentage lives on the person as
 *    `fatherId` / `motherId` rather than on a family node. Family/union nodes
 *    are *derived* at index time (see lib/graph.ts) because the tree renderer
 *    needs them, but nobody has to author them by hand.
 *
 * 2. Everything culturally specific (gotra, math, kuladevata, mool) is a
 *    reference to an entry in data/reference/*.json. That keeps spellings
 *    consistent across thousands of submissions — "Bharadwaj" and "Bhāradvāja"
 *    resolve to the same node, which is what makes the directory pages useful.
 *
 * 3. Every record carries provenance: who submitted it, what it is based on,
 *    and how confident we are. A community archive without provenance decays
 *    into folklore within a year.
 */

export type Gender = "M" | "F" | "X" | "?";

/** How much weight a reader should give a record. Shown as a chip on the card. */
export type Confidence =
  | "verified" // backed by a document (register, horoscope, gazette, certificate)
  | "attested" // multiple independent family members agree
  | "oral" // single oral account, family memory
  | "unverified"; // submitted, not yet corroborated

export type LifeStatus = "living" | "deceased" | "unknown";

/**
 * Dates in genealogy are frequently partial or fuzzy: "circa 1890",
 * "before 1947", "Shaka 1832". We keep the original string the contributor
 * wrote *and* a sortable numeric year so the timeline still works.
 */
export interface FuzzyDate {
  /** As written by the contributor, e.g. "c. 1897" or "Chaitra Shukla 5, Shaka 1819". */
  raw?: string;
  /** Best-guess Gregorian year for sorting/filtering. */
  year?: number;
  month?: number;
  day?: number;
  /** Qualifier that changes how the date should be read. */
  qualifier?: "exact" | "circa" | "before" | "after" | "between";
  /** Upper bound when qualifier is "between". */
  toYear?: number;
  /** Traditional calendar note: samvatsara, tithi, nakshatra. */
  panchanga?: string;
}

export interface PlaceRef {
  /** id into data/reference/places.json */
  id?: string;
  /** free text if the place is not (yet) in the reference list */
  label?: string;
}

export interface Source {
  kind:
    | "document"
    | "oral"
    | "photograph"
    | "book"
    | "temple-record"
    | "matha-record"
    | "gravestone"
    | "web"
    | "other";
  title: string;
  detail?: string;
  url?: string;
  /** Who holds the original. */
  heldBy?: string;
  year?: number;
}

export interface SpouseLink {
  personId: string;
  /** Stable id shared by both partners so the union renders once. */
  unionId?: string;
  status?: "married" | "widowed" | "separated" | "unknown";
  date?: FuzzyDate;
  place?: PlaceRef;
}

export interface PersonName {
  /** Personal name, e.g. "Narayan". */
  given: string;
  /** Family name, e.g. "Kamath". Optional — many older records have none. */
  surname?: string;
  /** Patronymic middle name, the Konkani convention: Narayan *Vasudev* Kamath. */
  patronymic?: string;
  /** What the card shows. Computed if absent. */
  display?: string;
  /** Name at birth, for people whose name changed at marriage. */
  birthName?: string;
  /** Nicknames, anglicised spellings, alternate transliterations. */
  aka?: string[];
  /** Native-script renderings — these are searchable too. */
  devanagari?: string;
  kannada?: string;
}

/**
 * A stored image.
 *
 * `thumbUrl` is not an optimisation detail that belongs in a rendering layer:
 * the archive stores exactly two renditions of every photograph a contributor
 * sends, and which one a page asks for is a property of the record. `bytes`
 * and the dimensions are kept because a maintainer auditing storage years from
 * now should not have to fetch every image to find out what is in the bucket.
 */
export interface PhotoRef {
  url: string;
  /** Small rendition — cards, search results, the tree. */
  thumbUrl?: string;
  caption?: string;
  credit?: string;
  year?: number;
  width?: number;
  height?: number;
  bytes?: number;
}

export interface Person {
  id: string;
  name: PersonName;
  gender: Gender;
  status?: LifeStatus;

  birth?: { date?: FuzzyDate; place?: PlaceRef };
  death?: { date?: FuzzyDate; place?: PlaceRef; note?: string };

  /** Sacred lineage — id into reference/gotras.json */
  gotra?: string;
  /** Rishi pravara, usually 3 or 5 names. Derived from gotra if absent. */
  pravara?: string[];
  /** Sub-community — id into reference/communities.json (gsb, chitrapur, ...) */
  community?: string;
  /** Monastic seat the family owes allegiance to — reference/maths.json */
  math?: string;
  /** Family deity — reference/kuladevatas.json */
  kuladevata?: string;
  /** Ancestral village ("mool"/"mūl gaon") — reference/places.json */
  mool?: string;
  /** Vedic school: rigveda / yajurveda(shukla|krishna) / samaveda */
  veda?: string;
  /** Sutra: ashvalayana, apastamba, bodhayana, ... */
  sutra?: string;

  /** Where they lived, in order. Drives the diaspora view. */
  residences?: PlaceRef[];
  occupations?: string[];
  /** Free-form paragraph shown on the expanded profile, not on the card. */
  bio?: string;
  /** Short one-liner shown when a card is expanded in the tree. */
  epithet?: string;

  fatherId?: string;
  motherId?: string;
  spouses?: SpouseLink[];

  /** Relationship to parents when not biological. */
  parentage?: "biological" | "adopted" | "step" | "unknown";

  photo?: PhotoRef;
  /** Additional images, documents. */
  media?: { url: string; kind: "photo" | "document"; caption?: string }[];

  sources?: Source[];
  confidence: Confidence;
  /** Display name of the contributor, or "Community archive". */
  contributedBy?: string;
  notes?: string;

  createdAt?: string;
  updatedAt?: string;
  /** True for the generated demonstration dataset. Never true for real records. */
  sample?: boolean;
}

/* ------------------------------------------------------------------ */
/* Derived structures — built by lib/graph.ts, never authored by hand. */
/* ------------------------------------------------------------------ */

export interface Union {
  id: string;
  /** 1 or 2 partner ids. Single-parent families produce a one-partner union. */
  partners: string[];
  childIds: string[];
  status?: SpouseLink["status"];
  date?: FuzzyDate;
  place?: PlaceRef;
}

/** A connected component of the kinship graph — one extended family. */
export interface Lineage {
  id: string;
  /** Best-guess earliest known ancestor, used to title the lineage. */
  apexId: string;
  label: string;
  memberIds: string[];
  size: number;
  generations: number;
  surnames: string[];
  gotras: string[];
  maths: string[];
  mools: string[];
  earliestYear?: number;
  latestYear?: number;
}

/* ------------------------------------------------------------------ */
/* Reference vocabularies                                              */
/* ------------------------------------------------------------------ */

/**
 * Carried by every reference vocabulary entry that a contributor, rather than
 * a maintainer, put there — see lib/vocabulary.ts and lib/vocabStore.ts.
 *
 * `pending` is what keeps the entry out of everybody else's dropdown until a
 * maintainer has checked the spelling and filled in what a contributor's form
 * cannot supply (a pravara, a temple, coordinates). It does not stop the entry
 * from being *used*: the record that proposed it already names it, and any
 * page rendering that record shows the name exactly as written.
 */
interface Proposable {
  pending?: boolean;
  /** Who proposed it, for the maintainer's approval screen. */
  proposedBy?: string;
}

export interface Gotra extends Proposable {
  id: string;
  name: string;
  devanagari?: string;
  rishi?: string;
  pravara?: string[];
  note?: string;
}

export interface Math extends Proposable {
  id: string;
  name: string;
  devanagari?: string;
  seat?: string;
  tradition?: "vaishnava" | "smarta" | "other";
  founded?: string;
  note?: string;
  communities?: string[];
}

export interface Community extends Proposable {
  id: string;
  name: string;
  alsoKnownAs?: string[];
  region?: string;
  note?: string;
}

export interface Kuladevata extends Proposable {
  id: string;
  name: string;
  devanagari?: string;
  temple?: string;
  placeId?: string;
  deityOf?: string;
  note?: string;
}

export interface Place extends Proposable {
  id: string;
  name: string;
  alt?: string[];
  region?: string;
  country?: string;
  /** [lat, lon] — powers the diaspora map. */
  coords?: [number, number];
  /** "mool" places are ancestral Konkan/Goa villages; "diaspora" are later. */
  kind?: "mool" | "settlement" | "diaspora";
  note?: string;
}

/**
 * A photograph of a place that belongs to the community rather than to a
 * family — a kuladevata's temple, a matha.
 *
 * The licence fields are not decoration. Every image here is somebody else's
 * work used under a licence that requires attribution, and an archive that
 * strips that is doing to photographers exactly what it exists to stop
 * happening to ancestors. Author, licence and the page it came from are stored
 * with the file and rendered wherever the image is.
 */
export interface TempleImage {
  /** Path under /public, e.g. "/temples/mangueshi.jpg". */
  src: string;
  width?: number;
  height?: number;
  /** Photographer or uploader, as the source names them. */
  credit: string;
  /** Licence short code, e.g. "CC BY-SA 4.0", "Public domain". */
  license: string;
  licenseUrl?: string;
  /** The page the file came from, for anyone re-checking the licence. */
  source: string;
}

export interface Temple {
  id: string;
  name: string;
  devanagari?: string;
  /** id into kuladevatas.json — the deity whose temple this is. */
  kuladevataId?: string;
  /** id into maths.json, for the monastic seats. */
  mathId?: string;
  /** id into places.json — where it stands now. */
  placeId?: string;
  /** id into places.json — the village the deity was carried from. */
  originPlaceId?: string;
  image?: TempleImage;
  /** Two or three sentences: what it is, and why this family would know it. */
  blurb?: string;
}

export interface ReferenceData {
  gotras: Gotra[];
  maths: Math[];
  communities: Community[];
  kuladevatas: Kuladevata[];
  places: Place[];
  temples: Temple[];
}

/* ------------------------------------------------------------------ */
/* Submissions                                                         */
/* ------------------------------------------------------------------ */

export type SubmissionKind =
  | "new-person"
  | "correction"
  | "add-relationship"
  | "story"
  | "photo"
  /** A whole household or branch, submitted in one piece. See FamilyDraft. */
  | "family-tree";

/**
 * `changes-requested` is the one a moderation queue cannot do without. Most
 * submissions are neither right nor wrong — they are a real family memory with
 * a date nobody can place, and the only useful reply is to ask. Without it a
 * reviewer has to choose between publishing something they doubt and rejecting
 * a contributor who was telling the truth.
 */
export type SubmissionStatus =
  | "pending"
  | "changes-requested"
  | "approved"
  | "rejected"
  | "merged";

/* ------------------------------------------------------------------ */
/* Family drafts — a whole branch, authored in one piece                */
/* ------------------------------------------------------------------ */

/**
 * One person inside a draft family, before anything is written.
 *
 * The interesting field is `key`. A contributor entering four generations at
 * once is describing people who do not have archive ids yet but who refer to
 * each other constantly — this child's father is that row above. So a draft
 * carries its own private namespace: `key` is unique within the draft only,
 * relationships point at keys, and the whole set of keys is resolved to real
 * ids in a single pass when the draft is published.
 *
 * `existingId` is the other half of that idea and the reason duplicates stay
 * out. A draft row can *be* somebody already in the archive — the grandfather
 * everyone hangs off is usually already there — and marking the row as that
 * person means the publish step links to them rather than minting a second
 * copy. Every row therefore resolves to exactly one archive id, whether or not
 * that id existed before.
 */
export interface DraftPerson {
  /** Unique within this draft, meaningless outside it. */
  key: string;
  /** Set when this row is a record that already exists. Nothing is created. */
  existingId?: string;

  given: string;
  patronymic?: string;
  surname?: string;
  devanagari?: string;
  aka?: string[];
  gender?: Gender;
  status?: LifeStatus;

  birthYear?: number;
  birthNote?: string;
  birthPlace?: string;
  deathYear?: number;
  deathPlace?: string;

  gotra?: string;
  community?: string;
  math?: string;
  kuladevata?: string;
  mool?: string;
  veda?: string;
  sutra?: string;

  occupations?: string[];
  residences?: string[];
  epithet?: string;
  bio?: string;
  photo?: PhotoRef;

  /** Draft keys, or the id of a person already in the archive. */
  fatherKey?: string;
  motherKey?: string;
  spouseKeys?: { key: string; year?: number }[];

  confidence?: Confidence;
}

export interface FamilyDraft {
  people: DraftPerson[];
  /** What the contributor wants a reviewer to know about the branch as a whole. */
  note?: string;
  /** Provenance for the branch, copied onto every record it creates. */
  sources?: { kind: Source["kind"]; title: string; detail?: string }[];
}

export interface Submission {
  id: string;
  kind: SubmissionKind;
  status: SubmissionStatus;
  /** The person being edited, for corrections. */
  targetId?: string;
  payload: Record<string, unknown>;
  submitter: {
    name: string;
    email?: string;
    relationship?: string;
    consent: boolean;
  };
  message?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewerNote?: string;
  /** Id of the record this submission created or updated, once published. */
  appliedTo?: string;
  appliedAt?: string;
}
