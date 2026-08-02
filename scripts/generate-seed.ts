/**
 * Generates the demonstration dataset.
 *
 * IMPORTANT: every person produced here is fictional and carries `sample: true`.
 * The *structures* are authentic — gotras, mathas, kuladevatas, mool villages,
 * surname patterns, naming conventions, migration routes and the shape of a
 * Konkani family over six generations — but no real person is described. Real
 * records replace these files; the archive shows a standing notice for as long
 * as sample data is the only thing present.
 *
 * Run with:  npm run data:seed
 */

import fs from "node:fs";
import path from "node:path";
import type { Person, Confidence, Gender, Source } from "../src/lib/types.ts";

/* ------------------------------------------------------------------ */
/* Deterministic randomness — same output on every run                 */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x5a4a5357); // "SRSW"

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

function pickMany<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Name pools                                                          */
/* ------------------------------------------------------------------ */

const MALE_OLD = [
  "Narayan", "Vasudev", "Krishna", "Ganesh", "Shridhar", "Anant", "Damodar",
  "Govind", "Ramchandra", "Venkatesh", "Shrinivas", "Raghunath", "Purushottam",
  "Vishnu", "Madhav", "Keshav", "Balkrishna", "Laxman", "Sadanand", "Gopal",
  "Janardan", "Mukund", "Vithal", "Dattatreya", "Trimbak", "Bhalchandra",
  "Chandrashekhar", "Manjunath", "Subraya", "Nagesh", "Ramkrishna", "Sitaram",
  "Yeshwant", "Waman", "Achyut", "Dinkar", "Hari", "Jagannath", "Kashinath",
  "Mahadev", "Padmanabh", "Rajaram", "Shantaram", "Vishwanath", "Umanath",
];

const MALE_MID = [
  "Suresh", "Ramesh", "Dinesh", "Mahesh", "Prakash", "Ashok", "Arun", "Vasant",
  "Vinayak", "Vivek", "Sudhir", "Sanjeev", "Anil", "Sunil", "Ravi", "Mohan",
  "Deepak", "Girish", "Harish", "Jayant", "Kiran", "Nitin", "Pramod", "Rajeev",
  "Satish", "Shashank", "Ulhas", "Uday", "Chandrakant", "Bhaskar", "Mangesh",
  "Prabhakar", "Shreekant", "Vinod", "Avinash", "Milind", "Nandan",
];

const MALE_NEW = [
  "Rohan", "Nikhil", "Aditya", "Karthik", "Siddharth", "Varun", "Aniket",
  "Sameer", "Rahul", "Amit", "Tejas", "Chinmay", "Ameya", "Pranav", "Kaustubh",
  "Shreyas", "Anirudh", "Advait", "Ishaan", "Aarav", "Vedant", "Atharva",
  "Neel", "Yash", "Sarvesh", "Omkar", "Soham", "Hrishikesh",
];

const FEMALE_OLD = [
  "Radhabai", "Lakshmibai", "Sitabai", "Parvatibai", "Anandibai", "Gangabai",
  "Yamunabai", "Kashibai", "Rukminibai", "Saraswatibai", "Janakibai",
  "Sunderabai", "Ambabai", "Godavaribai", "Tarabai", "Umabai", "Venubai",
  "Shantabai", "Bhagirathibai", "Indirabai", "Krishnabai", "Manjulabai",
  "Narmadabai", "Padmavatibai", "Ratnabai", "Savitribai", "Vithabai", "Kaveribai",
];

const FEMALE_MID = [
  "Shanta", "Sushila", "Kamala", "Vimala", "Sarojini", "Indira", "Malati",
  "Usha", "Prema", "Nalini", "Shobha", "Sudha", "Lata", "Vasanti", "Kunda",
  "Meera", "Asha", "Rekha", "Vaishali", "Smita", "Anuradha", "Jyoti",
  "Sulochana", "Rohini", "Vrinda", "Shailaja", "Nirmala", "Pushpa",
];

const FEMALE_NEW = [
  "Aditi", "Anjali", "Deepika", "Kavita", "Madhura", "Namrata", "Pooja",
  "Radhika", "Sneha", "Swati", "Trupti", "Vidya", "Shruti", "Ananya", "Ishani",
  "Meghana", "Nandini", "Prachi", "Rucha", "Samruddhi", "Tanvi", "Vaidehi",
  "Saanvi", "Aarohi", "Diya", "Ira", "Gauri", "Manasi",
];

function givenName(gender: "M" | "F", year: number): string {
  if (gender === "M") {
    if (year < 1905) return pick(MALE_OLD);
    if (year < 1965) return pick(chance(0.25) ? MALE_OLD : MALE_MID);
    return pick(chance(0.2) ? MALE_MID : MALE_NEW);
  }
  if (year < 1915) return pick(FEMALE_OLD);
  if (year < 1970) return pick(chance(0.2) ? FEMALE_OLD : FEMALE_MID);
  return pick(chance(0.2) ? FEMALE_MID : FEMALE_NEW);
}

/* ------------------------------------------------------------------ */
/* Occupations                                                         */
/* ------------------------------------------------------------------ */

const WORK_OLD = [
  "temple priest", "village accountant", "areca and pepper trader",
  "ayurvedic vaidya", "Sanskrit scholar", "landholder", "revenue clerk",
  "shipping agent at Basrur", "salt-pan holder", "purohit",
  "keeper of the temple accounts", "cardamom broker", "schoolmaster",
];

const WORK_MID = [
  "schoolteacher", "railway clerk", "bank officer", "advocate", "physician",
  "professor of mathematics", "civil engineer", "journalist", "civil servant",
  "cooperative bank manager", "textile mill supervisor", "Konkani writer",
  "Hindustani vocalist", "chartered accountant", "postmaster", "surveyor",
  "headmistress", "homoeopath", "insurance agent", "port officer",
];

const WORK_NEW = [
  "software engineer", "physician", "architect", "chartered accountant",
  "product manager", "research scientist", "entrepreneur", "dentist",
  "professor", "data scientist", "graphic designer", "civil engineer",
  "pharmacist", "documentary film-maker", "clinical psychologist",
  "marine engineer", "chef", "classical dancer", "veterinarian",
];

function occupation(year: number): string[] {
  if (year < 1900) return [pick(WORK_OLD)];
  if (year < 1960) return chance(0.15) ? pickMany(WORK_MID, 2) : [pick(WORK_MID)];
  return chance(0.15) ? pickMany(WORK_NEW, 2) : [pick(WORK_NEW)];
}

/* ------------------------------------------------------------------ */
/* Lineage definitions                                                 */
/* ------------------------------------------------------------------ */

interface LineageSpec {
  slug: string;
  surname: string;
  community: "gsb" | "chitrapur" | "rajapur";
  gotra: string;
  math: string;
  kuladevata: string;
  mool: string;
  /** Where the family settled after leaving the mool village, in order. */
  route: string[];
  apexBirth: number;
  target: number;
  note: string;
}

const LINEAGES: LineageSpec[] = [
  {
    slug: "kamath-kushasthali", surname: "Kamath", community: "gsb",
    gotra: "kaundinya", math: "kashi-math", kuladevata: "mangesh", mool: "kushasthali",
    route: ["kushasthali", "priol", "karwar", "mangalore", "mumbai", "bay-area"],
    apexBirth: 1782, target: 210,
    note: "A Kamath household that left Kushasthali for Ponda during the temple migrations and moved down the coast to Karwar in the eighteenth century.",
  },
  {
    slug: "pai-keloshi", surname: "Pai", community: "gsb",
    gotra: "bharadwaja", math: "partagali-math", kuladevata: "shantadurga", mool: "keloshi",
    route: ["keloshi", "kavale", "kumta", "udupi", "mumbai", "dubai"],
    apexBirth: 1795, target: 175,
    note: "Traders in areca and pepper who kept a house at Kavale and a warehouse at Kumta.",
  },
  {
    slug: "nadkarni-hattangadi", surname: "Nadkarni", community: "chitrapur",
    gotra: "kaushika", math: "chitrapur-math", kuladevata: "bhavani-shankar", mool: "shirali",
    route: ["shirali", "honnavar", "kumta", "mumbai", "london"],
    apexBirth: 1801, target: 165,
    note: "A Chitrapur Saraswat family of district accountants — the office the surname is named for.",
  },
  {
    slug: "shenoy-mathagram", surname: "Shenoy", community: "gsb",
    gotra: "vatsa", math: "kashi-math", kuladevata: "damodar", mool: "mathagram",
    route: ["mathagram", "zambaulim", "karwar", "mumbai", "toronto"],
    apexBirth: 1788, target: 155,
    note: "Recorded in Portuguese-era documents as Sinai; the family kept both spellings well into the twentieth century.",
  },
  {
    slug: "prabhu-loutolim", surname: "Prabhu", community: "gsb",
    gotra: "kashyapa", math: "kavale-math", kuladevata: "ramnath", mool: "loutolim",
    route: ["loutolim", "bandora", "ponda", "panaji", "pune", "melbourne"],
    apexBirth: 1806, target: 130,
    note: "Smarta family of the Kavale seat; several generations served as temple mahajans at Ramnathi.",
  },
  {
    slug: "bhat-verna", surname: "Bhat", community: "gsb",
    gotra: "atri", math: "partagali-math", kuladevata: "mahalasa", mool: "verna",
    route: ["verna", "mardol", "ankola", "hubli", "bengaluru", "new-jersey"],
    apexBirth: 1793, target: 145,
    note: "A priestly line attached to the Mahalasa temple at Mardol after the move from Verna.",
  },
  {
    slug: "kaikini-chitrapur", surname: "Kaikini", community: "chitrapur",
    gotra: "gautama", math: "chitrapur-math", kuladevata: "bhavani-shankar", mool: "shirali",
    route: ["shirali", "bhatkal", "kumta", "mumbai", "pune", "seattle"],
    apexBirth: 1812, target: 120,
    note: "Named for the village of Kaikini near Bhatkal; teachers and lawyers for four generations.",
  },
  {
    slug: "shanbhag-cuncolim", surname: "Shanbhag", community: "gsb",
    gotra: "vasishta", math: "kavale-math", kuladevata: "shantadurga-kunkalikarin", mool: "cuncolim",
    route: ["cuncolim", "fatorpa", "canacona", "karwar", "belgaum", "muscat"],
    apexBirth: 1799, target: 115,
    note: "Village accountants — shanbhog — of the Cuncolim group of villages.",
  },
  {
    slug: "baliga-divar", surname: "Baliga", community: "gsb",
    gotra: "shandilya", math: "kashi-math", kuladevata: "saptakoteshwar", mool: "divar",
    route: ["divar", "narve", "sanquelim", "mangalore", "chennai", "singapore"],
    apexBirth: 1817, target: 105,
    note: "Left Divar island when the Saptakoteshwar image was moved to Narve.",
  },
  {
    slug: "padukone-chitrapur", surname: "Padukone", community: "chitrapur",
    gotra: "jamadagni", math: "chitrapur-math", kuladevata: "bhavani-shankar", mool: "shirali",
    route: ["shirali", "haldipur", "kundapur", "mangalore", "bengaluru", "sydney"],
    apexBirth: 1824, target: 95,
    note: "A Chitrapur family named for its ancestral village, long settled around Kundapur.",
  },
  {
    slug: "mallya-chorao", surname: "Mallya", community: "gsb",
    gotra: "angirasa", math: "partagali-math", kuladevata: "devki-krishna", mool: "chorao",
    route: ["chorao", "marcel", "karkala", "mangalore", "hyderabad", "dubai"],
    apexBirth: 1809, target: 90,
    note: "Followed the Devki Krishna image from Chorao to Mashel.",
  },
  {
    slug: "wagle-rajapur", surname: "Wagle", community: "rajapur",
    gotra: "harita", math: "kavale-math", kuladevata: "vijayadurga", mool: "keri",
    route: ["keri", "sawantwadi", "ratnagiri", "mumbai", "delhi", "london"],
    apexBirth: 1821, target: 85,
    note: "A Rajapur Saraswat family of the southern Maharashtra coast.",
  },
  {
    slug: "kudva-barkur", surname: "Kudva", community: "gsb",
    gotra: "srivatsa", math: "kashi-math", kuladevata: "venkataramana", mool: "madkai",
    route: ["madkai", "basrur", "barkur", "udupi", "mumbai", "chicago"],
    apexBirth: 1833, target: 80,
    note: "Settled at Barkur when it was still a working port on the Seeta river.",
  },
  {
    slug: "hegde-ankola", surname: "Hegde", community: "gsb",
    gotra: "mudgala", math: "partagali-math", kuladevata: "mallikarjun", mool: "canacona",
    route: ["canacona", "karwar", "ankola", "gokarna", "hubli", "bengaluru"],
    apexBirth: 1828, target: 75,
    note: "Headmen — heggade — of a group of villages south of Karwar.",
  },
  {
    slug: "chandavarkar-honnavar", surname: "Chandavarkar", community: "chitrapur",
    gotra: "kaundinya", math: "chitrapur-math", kuladevata: "bhavani-shankar", mool: "shirali",
    route: ["shirali", "honnavar", "dharwad", "mumbai", "boston"],
    apexBirth: 1836, target: 70,
    note: "From Chandavar near Honnavar; several generations in the law and in education.",
  },
  {
    slug: "trasi-kundapur", surname: "Trasi", community: "chitrapur",
    gotra: "vishwamitra", math: "chitrapur-math", kuladevata: "bhavani-shankar", mool: "shirali",
    route: ["shirali", "trasi-village", "kundapur", "mangalore", "mumbai", "auckland"],
    apexBirth: 1841, target: 60,
    note: "Named for the coastal village of Trasi, north of Kundapur.",
  },
];

/** Surnames that marry in — a wife keeps her birth surname in the record. */
const MARRY_IN_GSB = [
  "Kamath", "Pai", "Shenoy", "Prabhu", "Nayak", "Bhat", "Kini", "Kudva",
  "Baliga", "Shanbhag", "Mallya", "Rao", "Adiga", "Bhandarkar", "Hegde", "Karkal",
];
const MARRY_IN_CHITRAPUR = [
  "Nadkarni", "Hattangadi", "Kaikini", "Padukone", "Chandavarkar", "Koppikar",
  "Savur", "Trasi", "Gulvady", "Heblekar", "Basrur", "Kallianpur", "Mavinkurve",
  "Bijur", "Talgeri", "Murdeshwar", "Sirur", "Kalbag", "Karnad", "Dhareshwar",
];

const ALL_GOTRAS = [
  "bharadwaja", "kaundinya", "kaushika", "vatsa", "kashyapa", "atri", "gautama",
  "vasishta", "jamadagni", "vishwamitra", "angirasa", "shandilya", "harita",
  "bhargava", "garga", "mudgala", "kutsa", "srivatsa", "dhananjaya", "parashara",
];

const VEDAS = ["Rigveda", "Krishna Yajurveda", "Shukla Yajurveda", "Samaveda"];
const SUTRAS = ["Ashvalayana", "Apastamba", "Bodhayana", "Drahyayana"];

/* ------------------------------------------------------------------ */
/* Life simulation                                                     */
/* ------------------------------------------------------------------ */

const THIS_YEAR = 2026;

function marriageAge(gender: Gender, birth: number): number {
  if (birth < 1900) return gender === "M" ? between(18, 25) : between(13, 18);
  if (birth < 1950) return gender === "M" ? between(22, 28) : between(16, 22);
  if (birth < 1985) return gender === "M" ? between(24, 30) : between(20, 26);
  return gender === "M" ? between(27, 33) : between(25, 31);
}

function childCount(birth: number): number {
  if (birth < 1880) return between(3, 8);
  if (birth < 1920) return between(3, 7);
  if (birth < 1950) return between(2, 5);
  if (birth < 1980) return between(1, 3);
  if (birth < 2000) return between(1, 2);
  return between(0, 2);
}

function lifespanFor(birth: number): number {
  // Rough, era-appropriate, with a long tail. Infant mortality is modelled
  // separately because it changes the shape of nineteenth-century families.
  if (birth < 1900) return chance(0.18) ? between(0, 12) : between(38, 82);
  if (birth < 1940) return chance(0.09) ? between(0, 14) : between(48, 88);
  if (birth < 1975) return chance(0.03) ? between(1, 30) : between(58, 94);
  return between(60, 96);
}

function confidenceFor(birth: number): Confidence {
  if (birth < 1860) return chance(0.25) ? "oral" : "unverified";
  if (birth < 1910) return pick(["oral", "oral", "attested"] as const);
  if (birth < 1960) return pick(["attested", "attested", "verified", "oral"] as const);
  return pick(["verified", "attested", "attested"] as const);
}

function sourcesFor(birth: number, spec: LineageSpec): Source[] {
  const out: Source[] = [];
  if (birth < 1900 && chance(0.35)) {
    out.push({
      kind: "oral",
      title: "Family recollection",
      detail: `Recorded from elders of the ${spec.surname} household at ${spec.route[0]}.`,
    });
  }
  if (birth < 1930 && chance(0.25)) {
    out.push({
      kind: "matha-record",
      title: "Matha vahi entry",
      detail: "Entry in the register kept at the family's matha.",
      heldBy: spec.math,
    });
  }
  if (birth >= 1900 && chance(0.3)) {
    out.push({
      kind: "document",
      title: chance(0.5) ? "Municipal birth register" : "School leaving certificate",
      year: birth + (chance(0.5) ? 0 : 15),
    });
  }
  if (chance(0.12)) {
    out.push({
      kind: "photograph",
      title: "Family group photograph",
      detail: "Undated studio portrait held by the family.",
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Biography snippets for a handful of people per lineage              */
/* ------------------------------------------------------------------ */

const BIO_TEMPLATES = [
  (n: string, s: LineageSpec, y: number) =>
    `${n} kept the family's accounts at ${placeName(s.route[1])} and is remembered for maintaining the household vahi in which most of the dates before ${y + 40} in this branch are recorded.`,
  (n: string, s: LineageSpec) =>
    `Moved the household from ${placeName(s.route[1])} to ${placeName(s.route[2])} after a failed monsoon, and is the first of the line recorded at the new place.`,
  (n: string, s: LineageSpec) =>
    `Served as a mahajan of the family's temple and travelled to ${placeName(s.mool)} for the annual festival every year until old age made the journey impossible.`,
  (n: string) =>
    `${n} was among the first women in the family to be sent to school, and later taught at the local girls' school for over thirty years.`,
  (n: string) =>
    `Took a degree at Bombay and entered the provincial service; the family's move to the city dates from this generation.`,
  (n: string, s: LineageSpec) =>
    `Kept up a correspondence in Konkani with cousins who had settled abroad; a bundle of these letters survives and is the source for several dates in this branch.`,
  (n: string) =>
    `Remembered in the family for an exceptional voice; sang at the temple on festival days for many years.`,
  (n: string) =>
    `Trained as a physician and ran a dispensary that treated the surrounding villages, often without charge.`,
];

let PLACE_NAMES: Record<string, string> = {};

function placeName(id: string): string {
  return PLACE_NAMES[id] ?? id;
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

let counter = 0;
function nextId(slug: string): string {
  counter += 1;
  return `${slug}-${String(counter).padStart(4, "0")}`;
}

interface Ctx {
  spec: LineageSpec;
  out: Person[];
  /** Expansions still allowed at each generation — see generateLineage. */
  budget: number[];
}

/** Residence chain: further along the migration route for later generations. */
function residencesFor(spec: LineageSpec, generation: number, birth: number) {
  const routeIndex = Math.min(
    spec.route.length - 1,
    Math.max(0, Math.floor((birth - spec.apexBirth) / 38) + (chance(0.3) ? 1 : 0)),
  );
  const stops = spec.route.slice(0, routeIndex + 1);
  // Most people are recorded at one or two places, not the whole chain.
  const keep = stops.slice(Math.max(0, stops.length - (chance(0.4) ? 2 : 1)));
  return keep.map((id) => ({ id }));
}

function makePerson(
  ctx: Ctx,
  opts: {
    gender: "M" | "F";
    birth: number;
    generation: number;
    fatherId?: string;
    motherId?: string;
    marriedIn?: boolean;
    surname?: string;
    gotra?: string;
    math?: string;
    kuladevata?: string;
    mool?: string;
    patronymic?: string;
    /**
     * Guarantees the person is still alive in this year. Used for spouses:
     * somebody who is about to be married cannot have died in infancy, and
     * without this the draw silently wiped out whole lineages at their root.
     */
    survivesTo?: number;
  },
): Person {
  const { spec } = ctx;
  const { gender, birth, generation } = opts;
  const given = givenName(gender, birth);
  const surname =
    opts.surname ??
    (opts.marriedIn
      ? pick(spec.community === "chitrapur" ? MARRY_IN_CHITRAPUR : MARRY_IN_GSB)
      : spec.surname);

  let deathY = birth + lifespanFor(birth);
  if (opts.survivesTo !== undefined && deathY <= opts.survivesTo) {
    deathY = opts.survivesTo + between(1, 45);
  }
  const span = deathY - birth;
  const isLiving = deathY >= THIS_YEAR && birth > THIS_YEAR - 100;
  const diedYoung = span < 16;

  const id = nextId(spec.slug);
  const confidence = confidenceFor(birth);

  const person: Person = {
    id,
    name: {
      given,
      surname,
      patronymic: opts.patronymic,
      display: [given, opts.patronymic, surname].filter(Boolean).join(" "),
    },
    gender,
    status: isLiving ? "living" : "deceased",
    birth: {
      date: {
        year: birth,
        qualifier: birth < 1880 ? "circa" : "exact",
        raw: birth < 1880 ? `c. ${birth}` : String(birth),
      },
      place: { id: spec.route[Math.min(
        spec.route.length - 1,
        Math.max(0, Math.floor((birth - spec.apexBirth) / 38)),
      )] },
    },
    community: spec.community,
    // Gotra descends in the male line; a woman who marries in keeps her own
    // gotra in the record, which is exactly what makes gotra useful for
    // reconnecting branches that lost touch.
    // Gotra, kuladevata and mool descend in the male line. A woman who marries
    // in keeps her own in the record — which is exactly what makes them useful
    // for reconnecting branches that lost touch, since her birth family can be
    // identified from them long after her surname stopped being used.
    gotra:
      opts.gotra ??
      (opts.marriedIn ? pick(ALL_GOTRAS.filter((g) => g !== spec.gotra)) : spec.gotra),
    math:
      opts.math ??
      (opts.marriedIn && chance(0.2)
        ? pick(["kashi-math", "partagali-math", "kavale-math"])
        : spec.math),
    kuladevata:
      opts.kuladevata ??
      (opts.marriedIn
        ? pick(["mangesh", "shantadurga", "mahalasa", "ramnath", "nagesh", "damodar", "kamakshi"])
        : spec.kuladevata),
    mool:
      opts.mool ??
      (opts.marriedIn && chance(0.6)
        ? pick(["kushasthali", "keloshi", "loutolim", "verna", "mathagram", "divar", "chorao", "cuncolim"])
        : spec.mool),
    veda: chance(0.7) ? pick(VEDAS) : undefined,
    sutra: chance(0.5) ? pick(SUTRAS) : undefined,
    residences: residencesFor(spec, generation, birth),
    confidence,
    contributedBy: "Community archive (sample)",
    sample: true,
    updatedAt: "2026-01-15",
  };

  if (!isLiving && !diedYoung) {
    person.death = {
      date: { year: deathY, qualifier: birth < 1900 ? "circa" : "exact" },
    };
  } else if (diedYoung) {
    person.death = {
      date: { year: deathY, qualifier: "circa" },
      note: "Died in infancy — recorded so that the birth order of the siblings is right.",
    };
    person.status = "deceased";
  }

  if (!diedYoung) {
    person.occupations = occupation(birth);
    const sources = sourcesFor(birth, spec);
    if (sources.length) person.sources = sources;
  }

  if (opts.fatherId) person.fatherId = opts.fatherId;
  if (opts.motherId) person.motherId = opts.motherId;

  // A handful of people per lineage get a paragraph — enough to show what a
  // filled-in record looks like without pretending everyone has one.
  if (!diedYoung && chance(0.07)) {
    person.bio = pick(BIO_TEMPLATES)(given, spec, birth);
  }
  if (!diedYoung && chance(0.1)) {
    person.epithet = pick([
      "kept the family vahi",
      "first of the line at " + placeName(spec.route[Math.min(2, spec.route.length - 1)]),
      "temple mahajan",
      "remembered for her singing",
      "sent the first letters home from abroad",
      "taught three generations of the family",
    ]);
  }

  ctx.out.push(person);
  return person;
}

function generateLineage(spec: LineageSpec): Person[] {
  // Depth, not breadth, is what makes a family tree worth looking at, but
  // unconstrained depth-first growth is explosive: at four children a
  // generation the first lineage swallowed the whole archive. So each
  // generation gets an expansion budget that grows geometrically — a handful of
  // recorded households in 1800 widening to dozens by 2000 — and branches
  // compete for it in birth order. That produces the shape real registers have:
  // deep, uneven, and thinning as you go back.
  const maxGen = Math.min(9, Math.max(5, Math.round((2008 - spec.apexBirth) / 30)));
  const growth = 1.75;
  const weights = Array.from({ length: maxGen }, (_, g) => Math.pow(growth, g));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const totalExpansions = Math.max(maxGen, Math.round(spec.target / 5.2));
  const budget = weights.map((w) =>
    Math.max(1, Math.round((totalExpansions * w) / weightSum)),
  );

  const ctx: Ctx = { spec, out: [], budget };

  const apex = makePerson(ctx, {
    gender: "M",
    birth: spec.apexBirth,
    generation: 0,
  });
  // The earliest recorded ancestor is, by definition, someone who lived long
  // enough to be remembered. Without this the infant-mortality draw could kill
  // a lineage at its root and leave a one-person family.
  apex.status = "deceased";
  apex.death = {
    date: { year: spec.apexBirth + between(52, 84), qualifier: "circa" },
  };
  apex.occupations = occupation(spec.apexBirth);
  apex.confidence = "oral";
  apex.epithet = "earliest ancestor recorded in this branch";
  apex.notes =
    "The line is not traced above this generation. Anyone holding a vahi, horoscope or matha register that reaches further back is asked to contribute it.";

  expandLine(ctx, apex, 0, maxGen, 0.75);
  return ctx.out;
}

/**
 * Give `person` a marriage and children, recursing into some of them.
 * Returns false when the person could not be expanded at all — died young, or
 * would not have married before the present day — so the caller can hand the
 * generation's expansion budget to a sibling instead of losing it.
 */
function expandLine(
  ctx: Ctx,
  person: Person,
  generation: number,
  maxGen: number,
  continueProb: number,
): boolean {
  const spec = ctx.spec;
  {
    const birth = person.birth?.date?.year ?? spec.apexBirth;
    const diedYoung = (person.death?.date?.year ?? 9999) - birth < 16;
    if (diedYoung) return false;
    if (birth > 2004) return false;

    // Marriages. Widowhood and remarriage were common before 1900.
    const marriages: { spouse: Person; year: number }[] = [];
    const firstMarriageYear = birth + marriageAge(person.gender, birth);
    if (firstMarriageYear > THIS_YEAR - 1) return false;
    // Nobody marries after their own death.
    if ((person.death?.date?.year ?? 9999) <= firstMarriageYear) return false;

    const spouseGender = person.gender === "M" ? "F" : "M";
    const spouseBirth =
      person.gender === "M"
        ? firstMarriageYear - between(14, 22)
        : firstMarriageYear - between(20, 28);

    const spouse = makePerson(ctx, {
      gender: spouseGender,
      birth: spouseBirth,
      generation,
      marriedIn: true,
      survivesTo: firstMarriageYear,
    });
    marriages.push({ spouse, year: firstMarriageYear });

    const spouseDeath = spouse.death?.date?.year;
    if (
      birth < 1930 &&
      spouseDeath &&
      spouseDeath < birth + 45 &&
      chance(0.55)
    ) {
      const remarryYear = spouseDeath + between(1, 3);
      if (remarryYear < THIS_YEAR - 1) {
        const second = makePerson(ctx, {
          gender: spouseGender,
          birth: remarryYear - between(14, 20),
          generation,
          marriedIn: true,
          survivesTo: remarryYear,
        });
        marriages.push({ spouse: second, year: remarryYear });
      }
    }

    person.spouses = marriages.map(({ spouse: s, year }) => ({
      personId: s.id,
      status: (s.death?.date?.year ?? 9999) < (person.death?.date?.year ?? 9999)
        ? ("widowed" as const)
        : ("married" as const),
      date: { year, qualifier: birth < 1900 ? ("circa" as const) : ("exact" as const) },
      place: { id: pick(spec.route.slice(0, 3)) },
    }));
    for (const { spouse: s, year } of marriages) {
      s.spouses = [
        {
          personId: person.id,
          status: "married",
          date: { year, qualifier: birth < 1900 ? "circa" : "exact" },
        },
      ];
    }

    // Children.
    const nextGen = generation + 1;
    const survivors: Person[] = [];
    let expandedAny = false;

    for (const { spouse: s, year } of marriages) {
      const father = person.gender === "M" ? person : s;
      const mother = person.gender === "M" ? s : person;
      const n = childCount(birth);
      let childYear = year + between(1, 3);

      for (let i = 0; i < n; i++) {
        if (childYear > 2018) break;
        const motherBirth = mother.birth?.date?.year ?? childYear - 25;
        if (childYear - motherBirth > 45) break;
        const motherDeath = mother.death?.date?.year;
        if (motherDeath && childYear > motherDeath) break;
        // A posthumous child is possible, but only for the year after.
        const fatherDeath = father.death?.date?.year;
        if (fatherDeath && childYear > fatherDeath + 1) break;

        const gender: "M" | "F" = chance(0.51) ? "M" : "F";
        // Surname, gotra, kuladevata and mool all follow the father. When it is
        // the daughter of the house who continues the line, her children carry
        // her husband's name — so the lineage keeps going under a new surname,
        // which is precisely how families lose track of each other.
        const child = makePerson(ctx, {
          gender,
          birth: childYear,
          generation: nextGen,
          fatherId: father.id,
          motherId: mother.id,
          patronymic: father.name.given,
          surname: father.name.surname,
          gotra: father.gotra,
          math: father.math,
          kuladevata: father.kuladevata,
          mool: father.mool,
        });
        childYear += between(2, 4);

        const survived =
          (child.death?.date?.year ?? 9999) - childYear >= 16 &&
          (child.birth!.date!.year ?? 0) <= 2004;
        if (!survived) continue;
        survivors.push(child);

        // Whose descendants get written down is not neutral. Patrilineal
        // registers follow sons; a daughter's children were recorded in her
        // husband's family, so her line goes quiet in this book even though it
        // continued perfectly well elsewhere. The generator reproduces that
        // bias deliberately rather than pretending to a symmetry the sources
        // do not have — and the archive says so plainly on the About page.
        const p = continueProb * (gender === "M" ? 1 : 0.35);
        if (nextGen < maxGen && (ctx.budget[nextGen] ?? 0) > 0 && chance(p)) {
          ctx.budget[nextGen]--;
          if (expandLine(ctx, child, nextGen, maxGen, continueProb)) {
            expandedAny = true;
          } else {
            ctx.budget[nextGen]++; // Refund — this child never married.
          }
        }
      }
    }

    // A household with surviving children does not vanish from the record
    // simply because the dice went the wrong way. If nothing continued but
    // someone could have, carry the line through the eldest surviving son —
    // or, failing that, the eldest surviving daughter.
    if (!expandedAny && nextGen < maxGen && (ctx.budget[nextGen] ?? 0) > 0) {
      const heir =
        survivors.find((c) => c.gender === "M") ?? survivors[0];
      if (heir) {
        ctx.budget[nextGen]--;
        if (!expandLine(ctx, heir, nextGen, maxGen, continueProb)) {
          ctx.budget[nextGen]++;
        }
      }
    }
  }

  return true;
}

/* ------------------------------------------------------------------ */
/* Cross-family marriages                                              */
/* ------------------------------------------------------------------ */

/**
 * Real community archives are not a set of tidy separate trees. Families
 * intermarry, and once two lineages share a marriage the archive can walk from
 * one to the other. We wire a small number of these deliberately, because a
 * viewer that has never been tested against a merged component will fall over
 * the first time a real one appears.
 */
function linkFamilies(all: Person[], byLineage: Map<string, Person[]>) {
  const specs = LINEAGES.map((s) => s.slug);
  const links: [string, string][] = [
    ["kamath-kushasthali", "pai-keloshi"],
    ["nadkarni-hattangadi", "kaikini-chitrapur"],
    ["shenoy-mathagram", "baliga-divar"],
    ["prabhu-loutolim", "shanbhag-cuncolim"],
    ["padukone-chitrapur", "chandavarkar-honnavar"],
    ["bhat-verna", "hegde-ankola"],
  ];

  const byId = new Map(all.map((p) => [p.id, p]));
  let made = 0;

  for (const [aSlug, bSlug] of links) {
    if (!specs.includes(aSlug) || !specs.includes(bSlug)) continue;
    const aPeople = byLineage.get(aSlug) ?? [];
    const bPeople = byLineage.get(bSlug) ?? [];

    // Find an unmarried woman in A born 1900-1975 and an unmarried man in B of
    // a compatible age, of different gotras (families observe gotra exogamy).
    const brides = aPeople.filter(
      (p) =>
        p.gender === "F" &&
        !p.spouses?.length &&
        (p.birth?.date?.year ?? 0) > 1900 &&
        (p.birth?.date?.year ?? 0) < 1975 &&
        (p.death?.date?.year ?? 9999) - (p.birth?.date?.year ?? 0) > 20,
    );
    const grooms = bPeople.filter(
      (p) =>
        p.gender === "M" &&
        !p.spouses?.length &&
        (p.birth?.date?.year ?? 0) > 1900 &&
        (p.birth?.date?.year ?? 0) < 1975 &&
        (p.death?.date?.year ?? 9999) - (p.birth?.date?.year ?? 0) > 20,
    );

    for (const bride of brides) {
      const by = bride.birth!.date!.year!;
      const groom = grooms.find((g) => {
        const gy = g.birth!.date!.year!;
        return gy >= by - 2 && gy <= by + 8 && g.gotra !== bride.gotra;
      });
      if (!groom) continue;

      const year = Math.max(by + 20, groom.birth!.date!.year! + 24);
      if (year > 2010) continue;

      bride.spouses = [
        { personId: groom.id, status: "married", date: { year, qualifier: "exact" } },
      ];
      groom.spouses = [
        { personId: bride.id, status: "married", date: { year, qualifier: "exact" } },
      ];
      bride.notes =
        "Married into another family recorded in this archive — the two lineages can be walked end to end from here.";

      // Give the couple a couple of children so the join is load-bearing.
      const spec = LINEAGES.find((s) => s.slug === bSlug)!;
      const ctx: Ctx = { spec, out: [], budget: [] };
      let childYear = year + 2;
      const kids = between(1, 3);
      const groomDeath = groom.death?.date?.year;
      const brideDeath = bride.death?.date?.year;
      for (let i = 0; i < kids && childYear < 2016; i++) {
        if (groomDeath && childYear > groomDeath + 1) break;
        if (brideDeath && childYear > brideDeath) break;
        const child = makePerson(ctx, {
          gender: chance(0.5) ? "M" : "F",
          birth: childYear,
          generation: 0,
          fatherId: groom.id,
          motherId: bride.id,
          patronymic: groom.name.given,
          surname: groom.name.surname,
          gotra: groom.gotra,
          math: groom.math,
          kuladevata: groom.kuladevata,
          mool: groom.mool,
        });
        childYear += between(2, 4);
        byId.set(child.id, child);
      }
      byLineage.get(bSlug)!.push(...ctx.out);
      all.push(...ctx.out);
      made++;
      break;
    }
  }

  return made;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  const root = process.cwd();
  const placesDoc = JSON.parse(
    fs.readFileSync(path.join(root, "data/reference/places.json"), "utf8"),
  );
  PLACE_NAMES = Object.fromEntries(
    placesDoc.items.map((p: { id: string; name: string }) => [p.id, p.name]),
  );
  // The Trasi lineage route names a village not in the reference list; fall
  // back to the town it is nearest so residences always resolve.
  PLACE_NAMES["trasi-village"] = "Trasi";

  const outDir = path.join(root, "data/people");
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) {
    if (f.startsWith("sample-") && f.endsWith(".json")) {
      fs.unlinkSync(path.join(outDir, f));
    }
  }

  const all: Person[] = [];
  const byLineage = new Map<string, Person[]>();

  for (const spec of LINEAGES) {
    const people = generateLineage(spec);
    byLineage.set(spec.slug, people);
    all.push(...people);
  }

  const joins = linkFamilies(all, byLineage);

  // Drop residences pointing at the placeholder village.
  for (const p of all) {
    if (p.residences) {
      p.residences = p.residences.filter((r) => r.id !== "trasi-village");
      if (!p.residences.length) delete p.residences;
    }
    if (p.birth?.place?.id === "trasi-village") p.birth.place = { id: "kundapur" };
  }

  for (const [slug, people] of byLineage) {
    const spec = LINEAGES.find((s) => s.slug === slug)!;
    fs.writeFileSync(
      path.join(outDir, `sample-${slug}.json`),
      JSON.stringify(
        {
          _note:
            "GENERATED SAMPLE DATA — every person here is fictional. The gotras, mathas, kuladevatas, villages and naming conventions are authentic; the individuals are not. Delete this file when real records replace it.",
          _lineage: spec.note,
          people,
        },
        null,
        2,
      ) + "\n",
    );
  }

  const living = all.filter((p) => p.status === "living").length;
  const years = all
    .map((p) => p.birth?.date?.year)
    .filter((y): y is number => y != null);

  console.log(`Generated ${all.length} people across ${LINEAGES.length} lineages`);
  console.log(`  births ${Math.min(...years)}–${Math.max(...years)}`);
  console.log(`  living: ${living}`);
  console.log(`  cross-family marriages wired: ${joins}`);
  console.log(`  written to data/people/sample-*.json`);
}

main();
