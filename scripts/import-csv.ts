/**
 * Spreadsheet importer.
 *
 *   npm run import:csv -- path/to/family.csv [output-name]
 *
 * Most family trees do not start in genealogy software. They start in a
 * spreadsheet that somebody's uncle has been maintaining since 2004, and the
 * quickest way to get a real family into this archive is to accept that file
 * as it is.
 *
 * Recognised columns (case- and space-insensitive; all optional but `id` and
 * `given`):
 *
 *   id, given, patronymic, surname, devanagari, aka, sex, status,
 *   birth_year, birth_place, birth_note, death_year, death_place,
 *   gotra, math, kuladevata, mool, community, veda, sutra,
 *   father_id, mother_id, spouse_id, marriage_year,
 *   occupations, residences, epithet, bio, notes, confidence, source
 *
 * `father_id`, `mother_id` and `spouse_id` refer to the `id` column of other
 * rows in the same file. Multi-value columns (aka, occupations, residences)
 * are semicolon separated.
 */

import fs from "node:fs";
import path from "node:path";
import type { Confidence, Gender, Person } from "../src/lib/types.ts";
import { makeResolver } from "../src/lib/refmatch.ts";

/** Values that could not be matched to a controlled vocabulary. */
const unmatched = new Map<string, Set<string>>();
const resolve = makeResolver(unmatched);

/* ------------------------------------------------------------------ */
/* CSV parsing — RFC 4180, quotes and embedded newlines included       */
/* ------------------------------------------------------------------ */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const source = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim()));
}

const normaliseHeader = (h: string) =>
  h.toLowerCase().trim().replace(/[\s-]+/g, "_");

const slug = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const multi = (s: string | undefined) =>
  s
    ? s.split(";").map((x) => x.trim()).filter(Boolean)
    : undefined;

const year = (s: string | undefined) => {
  if (!s) return undefined;
  const n = Number(String(s).match(/\d{3,4}/)?.[0]);
  return Number.isFinite(n) ? n : undefined;
};

/* ------------------------------------------------------------------ */

function main() {
  const [, , input, outputName] = process.argv;
  if (!input) {
    console.error("Usage: npm run import:csv -- path/to/family.csv [output-name]");
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`No such file: ${input}`);
    process.exit(1);
  }

  const prefix =
    outputName ??
    path.basename(input).replace(/\.csv$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const rows = parseCsv(fs.readFileSync(input, "utf8"));
  if (rows.length < 2) {
    console.error("The file needs a header row and at least one record.");
    process.exit(1);
  }

  const headers = rows[0].map(normaliseHeader);
  const records = rows.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = (cells[i] ?? "").trim();
      if (v) record[h] = v;
    });
    return record;
  });

  // Local ids in the sheet are namespaced so that importing two families does
  // not collide on "1", "2", "3".
  const localId = (v: string | undefined) =>
    v ? `${prefix}-${slug(v)}` : undefined;

  const seen = new Set<string>();
  const people: Person[] = [];
  const problems: string[] = [];

  for (const [index, r] of records.entries()) {
    const rawId = r.id ?? r.person_id ?? String(index + 1);
    const id = localId(rawId)!;
    if (seen.has(id)) {
      problems.push(`Row ${index + 2}: duplicate id "${rawId}" — skipped.`);
      continue;
    }
    if (!r.given && !r.name) {
      problems.push(`Row ${index + 2}: no given name — skipped.`);
      continue;
    }
    seen.add(id);

    const given = r.given ?? r.name!.split(/\s+/)[0];
    const sexRaw = (r.sex ?? r.gender ?? "").toUpperCase();
    const gender: Gender =
      sexRaw.startsWith("M") ? "M" : sexRaw.startsWith("F") ? "F" : "?";

    const confidence: Confidence = (
      ["verified", "attested", "oral", "unverified"] as const
    ).includes(r.confidence as Confidence)
      ? (r.confidence as Confidence)
      : "unverified";

    const birthY = year(r.birth_year ?? r.born);
    const deathY = year(r.death_year ?? r.died);

    const person: Person = {
      id,
      name: {
        given,
        patronymic: r.patronymic,
        surname: r.surname,
        devanagari: r.devanagari,
        aka: multi(r.aka),
        display: [given, r.patronymic, r.surname].filter(Boolean).join(" "),
      },
      gender,
      status:
        r.status === "living"
          ? "living"
          : deathY || r.status === "deceased"
            ? "deceased"
            : "unknown",
      birth:
        birthY || r.birth_place
          ? {
              date: birthY
                ? { year: birthY, qualifier: "exact", raw: r.birth_note }
                : undefined,
              place: r.birth_place ? { label: r.birth_place } : undefined,
            }
          : undefined,
      death:
        deathY || r.death_place
          ? {
              date: deathY ? { year: deathY, qualifier: "exact" } : undefined,
              place: r.death_place ? { label: r.death_place } : undefined,
            }
          : undefined,
      // Resolved against the controlled vocabularies so that "Bharadwaj",
      // "Bhardwaj" and "Bharadwaja" all land on one directory entry.
      gotra: resolve("gotras", r.gotra),
      math: resolve("maths", r.math),
      kuladevata: resolve("kuladevatas", r.kuladevata),
      mool: resolve("places", r.mool),
      community: resolve("communities", r.community),
      veda: r.veda,
      sutra: r.sutra,
      occupations: multi(r.occupations ?? r.occupation),
      residences: multi(r.residences)?.map((label) => ({ label })),
      epithet: r.epithet,
      bio: r.bio,
      notes: r.notes,
      fatherId: localId(r.father_id),
      motherId: localId(r.mother_id),
      sources: r.source
        ? [{ kind: "other", title: r.source }]
        : undefined,
      confidence,
      contributedBy: `CSV import (${path.basename(input)})`,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    if (r.spouse_id) {
      person.spouses = [
        {
          personId: localId(r.spouse_id)!,
          status: "married",
          date: year(r.marriage_year)
            ? { year: year(r.marriage_year), qualifier: "exact" }
            : undefined,
        },
      ];
    }

    people.push(person);
  }

  // Reciprocate marriages, so a sheet that records each couple once still
  // produces a graph where both partners know about it.
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const p of people) {
    for (const s of p.spouses ?? []) {
      const other = byId.get(s.personId);
      if (!other) continue;
      if (!(other.spouses ?? []).some((x) => x.personId === p.id)) {
        other.spouses = [
          ...(other.spouses ?? []),
          { personId: p.id, status: s.status, date: s.date },
        ];
      }
    }
  }

  // Warn about links pointing nowhere rather than silently dropping them.
  for (const p of people) {
    for (const [field, ref] of [
      ["father_id", p.fatherId],
      ["mother_id", p.motherId],
    ] as const) {
      if (ref && !byId.has(ref)) {
        problems.push(`${p.name.display}: ${field} points at a row that is not in this file.`);
      }
    }
  }

  const outDir = path.join(process.cwd(), "data", "people");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, `${prefix}.json`),
    JSON.stringify(
      {
        _note: `Imported from ${path.basename(input)} on ${new Date().toISOString().slice(0, 10)}. Records default to "unverified" unless the sheet said otherwise.`,
        people,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(`Imported ${people.length} people from ${input}`);
  console.log(`  written to data/people/${prefix}.json`);
  if (problems.length) {
    console.log("");
    console.log(`${problems.length} thing(s) to look at:`);
    for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
    if (problems.length > 20) console.log(`  … and ${problems.length - 20} more`);
  }
  if (unmatched.size) {
    console.log("");
    console.log("These values did not match the archive's vocabularies and were");
    console.log("kept as-is. Either add them to data/reference/, or correct the");
    console.log("spelling in the sheet and import again:");
    for (const [vocabulary, values] of unmatched) {
      console.log(`  ${vocabulary}: ${[...values].join(", ")}`);
    }
  }
  console.log("");
  console.log("Next: run  npm run data:check  before committing.");
}

main();
