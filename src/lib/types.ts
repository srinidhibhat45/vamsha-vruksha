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

  photo?: { url: string; caption?: string; credit?: string; year?: number };
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

export interface Gotra {
  id: string;
  name: string;
  devanagari?: string;
  rishi?: string;
  pravara?: string[];
  note?: string;
}

export interface Math {
  id: string;
  name: string;
  devanagari?: string;
  seat?: string;
  tradition?: "vaishnava" | "smarta" | "other";
  founded?: string;
  note?: string;
  communities?: string[];
}

export interface Community {
  id: string;
  name: string;
  alsoKnownAs?: string[];
  region?: string;
  note?: string;
}

export interface Kuladevata {
  id: string;
  name: string;
  devanagari?: string;
  temple?: string;
  placeId?: string;
  deityOf?: string;
  note?: string;
}

export interface Place {
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

export interface ReferenceData {
  gotras: Gotra[];
  maths: Math[];
  communities: Community[];
  kuladevatas: Kuladevata[];
  places: Place[];
}

/* ------------------------------------------------------------------ */
/* Submissions                                                         */
/* ------------------------------------------------------------------ */

export type SubmissionKind =
  | "new-person"
  | "correction"
  | "add-relationship"
  | "story"
  | "photo";

export interface Submission {
  id: string;
  kind: SubmissionKind;
  status: "pending" | "approved" | "rejected" | "merged";
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
}
