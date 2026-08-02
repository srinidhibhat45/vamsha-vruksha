/**
 * GEDCOM importer.
 *
 *   npm run import:gedcom -- path/to/family.ged [output-name]
 *
 * GEDCOM is the lingua franca of genealogy software — Family Tree Maker,
 * Gramps, Ancestry, MyHeritage, RootsMagic all export it. Supporting it means a
 * family that has already spent ten years building a tree somewhere else can
 * bring it here in one command instead of retyping it.
 *
 * The Saraswat-specific fields (gotra, matha, kuladevata, mool) have no place
 * in the standard, so most exports will not carry them. Where a program has
 * stored them as custom tags — _GOTRA, _MATHA, _KULADEVATA, _MOOL, or as
 * "gotra: Bharadwaja" inside a NOTE — they are picked up; otherwise the fields
 * come through empty and can be filled in afterwards.
 */

import fs from "node:fs";
import path from "node:path";
import type { FuzzyDate, Gender, Person, Source } from "../src/lib/types.ts";
import { makeResolver } from "../src/lib/refmatch.ts";

/** Values that could not be matched to a controlled vocabulary. */
const unmatched = new Map<string, Set<string>>();
const resolve = makeResolver(unmatched);

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

interface GedNode {
  level: number;
  tag: string;
  xref?: string;
  value: string;
  children: GedNode[];
}

function parseGedcom(text: string): GedNode[] {
  const roots: GedNode[] = [];
  const stack: GedNode[] = [];

  // GEDCOM files come from every operating system ever made; normalise first.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // "0 @I1@ INDI" or "1 NAME Narayan /Kamath/"
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s(.*))?$/);
    if (!match) continue;

    const [, levelStr, xref, tag, value = ""] = match;
    const level = Number(levelStr);
    const node: GedNode = { level, tag, xref, value, children: [] };

    // CONC continues the previous value without a space; CONT adds a newline.
    if (tag === "CONC" || tag === "CONT") {
      const parent = stack[stack.length - 1];
      if (parent) {
        parent.value += (tag === "CONT" ? "\n" : "") + value;
      }
      continue;
    }

    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }

  return roots;
}

const child = (node: GedNode, tag: string): GedNode | undefined =>
  node.children.find((c) => c.tag === tag);

const childrenOf = (node: GedNode, tag: string): GedNode[] =>
  node.children.filter((c) => c.tag === tag);

const valueOf = (node: GedNode, tag: string): string | undefined =>
  child(node, tag)?.value.trim() || undefined;

/* ------------------------------------------------------------------ */
/* Field mapping                                                       */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

function parseDate(raw: string | undefined): FuzzyDate | undefined {
  if (!raw) return undefined;
  const text = raw.trim();
  if (!text) return undefined;

  let qualifier: FuzzyDate["qualifier"] = "exact";
  let body = text.toUpperCase();

  if (/^(ABT|EST|CAL)\b/.test(body)) {
    qualifier = "circa";
    body = body.replace(/^(ABT|EST|CAL)\s*/, "");
  } else if (/^BEF\b/.test(body)) {
    qualifier = "before";
    body = body.replace(/^BEF\s*/, "");
  } else if (/^AFT\b/.test(body)) {
    qualifier = "after";
    body = body.replace(/^AFT\s*/, "");
  } else if (/^(BET|FROM)\b/.test(body)) {
    qualifier = "between";
  }

  const years = body.match(/\b(\d{3,4})\b/g);
  if (!years?.length) return { raw: text, qualifier };

  const year = Number(years[0]);
  const toYear = years[1] ? Number(years[1]) : undefined;
  const monthMatch = body.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/);
  const dayMatch = body.match(/\b(\d{1,2})\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/);

  return {
    raw: text,
    year,
    toYear,
    month: monthMatch ? MONTHS[monthMatch[1]] : undefined,
    day: dayMatch ? Number(dayMatch[1]) : undefined,
    qualifier,
  };
}

/** GEDCOM writes surnames between slashes: "Narayan Vasudev /Kamath/". */
function parseName(value: string): {
  given: string;
  surname?: string;
  patronymic?: string;
} {
  const surnameMatch = value.match(/\/([^/]*)\//);
  const surname = surnameMatch?.[1]?.trim() || undefined;
  const rest = value.replace(/\/[^/]*\//, " ").replace(/\s+/g, " ").trim();
  const parts = rest.split(" ").filter(Boolean);

  return {
    given: parts[0] ?? rest ?? "Unknown",
    // Konkani names carry the father's given name in the middle; if there are
    // three parts, the middle one is almost certainly that rather than a
    // Western-style second forename.
    patronymic: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
    surname,
  };
}

/** Look for Saraswat fields in custom tags, then in free-text notes. */
function extractCustom(node: GedNode): Partial<Person> {
  const out: Partial<Person> = {};

  // Free text is resolved onto the archive's vocabularies, so "Shri Mangesh"
  // becomes `mangesh` and "Bharadwaj" becomes `bharadwaja` rather than each
  // spelling minting its own directory entry.
  const direct: [string, keyof Person, Parameters<typeof resolve>[0] | null][] = [
    ["_GOTRA", "gotra", "gotras"],
    ["_MATHA", "math", "maths"],
    ["_MATH", "math", "maths"],
    ["_KULADEVATA", "kuladevata", "kuladevatas"],
    ["_KULDEV", "kuladevata", "kuladevatas"],
    ["_MOOL", "mool", "places"],
    ["_VEDA", "veda", null],
    ["_SUTRA", "sutra", null],
  ];
  for (const [tag, field, vocabulary] of direct) {
    const v = valueOf(node, tag);
    if (!v) continue;
    (out as Record<string, unknown>)[field] = vocabulary
      ? resolve(vocabulary, v)
      : v;
  }

  const notes = childrenOf(node, "NOTE")
    .map((n) => n.value)
    .join("\n");
  if (notes) {
    out.notes = notes.trim();
    const patterns: [RegExp, keyof Person, Parameters<typeof resolve>[0]][] = [
      [/gotra\s*[:=]\s*([A-Za-z ]+)/i, "gotra", "gotras"],
      [/kuladev(?:ata|i)?\s*[:=]\s*([A-Za-z .]+)/i, "kuladevata", "kuladevatas"],
      [/mat(?:h|ha)\s*[:=]\s*([A-Za-z .]+)/i, "math", "maths"],
      [/mool\s*(?:gaon|village)?\s*[:=]\s*([A-Za-z ]+)/i, "mool", "places"],
    ];
    for (const [re, field, vocabulary] of patterns) {
      if ((out as Record<string, unknown>)[field]) continue;
      const m = notes.match(re);
      if (m) (out as Record<string, unknown>)[field] = resolve(vocabulary, m[1]);
    }
  }

  return out;
}

function idFor(xref: string, prefix: string): string {
  return `${prefix}-${xref.replace(/@/g, "").toLowerCase()}`;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
  const [, , input, outputName] = process.argv;
  if (!input) {
    console.error(
      "Usage: npm run import:gedcom -- path/to/family.ged [output-name]",
    );
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`No such file: ${input}`);
    process.exit(1);
  }

  const prefix =
    outputName ??
    path.basename(input).replace(/\.ged(com)?$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const roots = parseGedcom(fs.readFileSync(input, "utf8"));
  const individuals = roots.filter((n) => n.tag === "INDI" && n.xref);
  const families = roots.filter((n) => n.tag === "FAM" && n.xref);

  const people = new Map<string, Person>();

  for (const node of individuals) {
    const id = idFor(node.xref!, prefix);
    const nameNode = child(node, "NAME");
    const name = parseName(nameNode?.value ?? "Unknown");

    const sex = valueOf(node, "SEX");
    const gender: Gender = sex === "M" ? "M" : sex === "F" ? "F" : "?";

    const birthNode = child(node, "BIRT");
    const deathNode = child(node, "DEAT");

    const sources: Source[] = childrenOf(node, "SOUR").map((s) => ({
      kind: "document" as const,
      title: s.value.trim() || "Source cited in the GEDCOM file",
    }));

    const occupations = childrenOf(node, "OCCU")
      .map((o) => o.value.trim())
      .filter(Boolean);

    const residences = childrenOf(node, "RESI")
      .map((r) => valueOf(r, "PLAC"))
      .filter((x): x is string => !!x)
      .map((label) => ({ label }));

    const person: Person = {
      id,
      name: {
        given: name.given,
        patronymic: name.patronymic,
        surname: name.surname,
        display: [name.given, name.patronymic, name.surname]
          .filter(Boolean)
          .join(" "),
      },
      gender,
      status: deathNode ? "deceased" : "unknown",
      birth: birthNode
        ? {
            date: parseDate(valueOf(birthNode, "DATE")),
            place: valueOf(birthNode, "PLAC")
              ? { label: valueOf(birthNode, "PLAC") }
              : undefined,
          }
        : undefined,
      death: deathNode
        ? {
            date: parseDate(valueOf(deathNode, "DATE")),
            place: valueOf(deathNode, "PLAC")
              ? { label: valueOf(deathNode, "PLAC") }
              : undefined,
          }
        : undefined,
      occupations: occupations.length ? occupations : undefined,
      residences: residences.length ? residences : undefined,
      sources: sources.length ? sources : undefined,
      // Imported records have not been checked by anyone here. Marking them
      // "unverified" is the honest default; a reviewer can promote them.
      confidence: "unverified",
      contributedBy: `GEDCOM import (${path.basename(input)})`,
      updatedAt: new Date().toISOString().slice(0, 10),
      ...extractCustom(node),
    };

    people.set(node.xref!, person);
  }

  // Families give us parentage and marriages.
  let marriages = 0;
  let parentLinks = 0;

  for (const fam of families) {
    const husband = valueOf(fam, "HUSB");
    const wife = valueOf(fam, "WIFE");
    const marrNode = child(fam, "MARR");
    const marriageDate = marrNode ? parseDate(valueOf(marrNode, "DATE")) : undefined;
    const marriagePlace = marrNode ? valueOf(marrNode, "PLAC") : undefined;

    if (husband && wife && people.has(husband) && people.has(wife)) {
      const h = people.get(husband)!;
      const w = people.get(wife)!;
      const link = {
        status: "married" as const,
        date: marriageDate,
        place: marriagePlace ? { label: marriagePlace } : undefined,
      };
      h.spouses = [...(h.spouses ?? []), { personId: w.id, ...link }];
      w.spouses = [...(w.spouses ?? []), { personId: h.id, ...link }];
      marriages++;
    }

    for (const c of childrenOf(fam, "CHIL")) {
      const childRef = c.value.trim();
      const kid = people.get(childRef);
      if (!kid) continue;
      if (husband && people.has(husband)) kid.fatherId = people.get(husband)!.id;
      if (wife && people.has(wife)) kid.motherId = people.get(wife)!.id;
      parentLinks++;
    }
  }

  const list = [...people.values()];
  const outDir = path.join(process.cwd(), "data", "people");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${prefix}.json`);

  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        _note: `Imported from ${path.basename(input)} on ${new Date().toISOString().slice(0, 10)}. Every record is marked "unverified" until a person has checked it. Gotra, matha, kuladevata and mool are usually absent from GEDCOM and need filling in.`,
        people: list,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`Imported ${list.length} people from ${input}`);
  console.log(`  ${marriages} marriages, ${parentLinks} parent links`);
  console.log(`  written to data/people/${prefix}.json`);

  if (unmatched.size) {
    console.log("");
    console.log("These values did not match the archive's vocabularies and were");
    console.log("kept as-is. Either add them to data/reference/, or correct the");
    console.log("spelling in the source file and import again:");
    for (const [vocabulary, values] of unmatched) {
      console.log(`  ${vocabulary}: ${[...values].join(", ")}`);
    }
  }
  console.log("");
  console.log("Next: run  npm run data:check  to look for impossible dates,");
  console.log("broken links and ancestry loops before committing.");
}

main();
