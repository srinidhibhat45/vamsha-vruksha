/**
 * Integrity check for the archive.
 *
 * Run before committing contributed records:  npm run data:check
 *
 * A public genealogy archive accumulates two kinds of error. The first is
 * referential — a father id that points at nobody, a gotra spelled a new way.
 * The second is chronological, and it is the one that quietly destroys an
 * archive: a child born before their mother, a marriage after a death, a person
 * who ends up as their own ancestor. None of these are visible when you read a
 * single record; all of them are obvious when you check the graph.
 */

import {
  getArchive,
  fullName,
  birthYear,
  deathYear,
} from "../src/lib/archive.ts";

interface Problem {
  severity: "error" | "warning";
  personId: string;
  person: string;
  message: string;
}

function main() {
  const archive = getArchive();
  const problems: Problem[] = [];

  const add = (
    severity: Problem["severity"],
    id: string,
    message: string,
  ) => {
    const p = archive.people.get(id);
    problems.push({
      severity,
      personId: id,
      person: p ? fullName(p) : id,
      message,
    });
  };

  /* -------------------- referential integrity -------------------- */

  for (const p of archive.personList) {
    for (const [field, value] of [
      ["fatherId", p.fatherId],
      ["motherId", p.motherId],
    ] as const) {
      if (value && !archive.people.has(value)) {
        add("error", p.id, `${field} points at unknown person "${value}"`);
      }
    }
    for (const s of p.spouses ?? []) {
      if (!archive.people.has(s.personId)) {
        add("error", p.id, `spouse points at unknown person "${s.personId}"`);
      } else {
        const other = archive.people.get(s.personId)!;
        const reciprocated = (other.spouses ?? []).some(
          (x) => x.personId === p.id,
        );
        if (!reciprocated) {
          add(
            "warning",
            p.id,
            `marriage to ${fullName(other)} is not recorded on the other record`,
          );
        }
      }
    }

    if (p.gotra && !archive.gotras.has(p.gotra))
      add("error", p.id, `unknown gotra "${p.gotra}"`);
    if (p.math && !archive.maths.has(p.math))
      add("error", p.id, `unknown math "${p.math}"`);
    if (p.community && !archive.communities.has(p.community))
      add("error", p.id, `unknown community "${p.community}"`);
    if (p.kuladevata && !archive.kuladevatas.has(p.kuladevata))
      add("error", p.id, `unknown kuladevata "${p.kuladevata}"`);
    if (p.mool && !archive.places.has(p.mool))
      add("error", p.id, `unknown mool place "${p.mool}"`);
    for (const r of p.residences ?? []) {
      if (r.id && !archive.places.has(r.id))
        add("warning", p.id, `unknown residence place "${r.id}"`);
    }
    if (p.birth?.place?.id && !archive.places.has(p.birth.place.id))
      add("warning", p.id, `unknown birth place "${p.birth.place.id}"`);

    if (p.fatherId && p.fatherId === p.motherId)
      add("error", p.id, "father and mother are the same person");
    if (p.fatherId === p.id || p.motherId === p.id)
      add("error", p.id, "is recorded as their own parent");
  }

  /* -------------------- chronology -------------------- */

  for (const p of archive.personList) {
    const b = birthYear(p);
    const d = deathYear(p);

    if (b && d && d < b) add("error", p.id, `died (${d}) before born (${b})`);
    if (b && b > 2030) add("error", p.id, `birth year ${b} is in the future`);
    if (b && d && d - b > 115)
      add("warning", p.id, `lived ${d - b} years — check the dates`);
    if (p.status === "living" && d)
      add("warning", p.id, "marked living but has a death year");

    for (const parentId of [p.fatherId, p.motherId]) {
      if (!parentId) continue;
      const parent = archive.people.get(parentId);
      if (!parent) continue;
      const pb = birthYear(parent);
      const pd = deathYear(parent);
      if (b && pb) {
        const gap = b - pb;
        if (gap < 12)
          add(
            "error",
            p.id,
            `born ${gap} years after ${fullName(parent)} — parent too young`,
          );
        else if (gap > 65)
          add(
            "warning",
            p.id,
            `born ${gap} years after ${fullName(parent)} — unusually late`,
          );
      }
      // A father may die before the birth; a mother may not.
      if (b && pd && parent.gender === "F" && b > pd) {
        add(
          "error",
          p.id,
          `born ${b}, after mother ${fullName(parent)} died in ${pd}`,
        );
      }
      if (b && pd && parent.gender === "M" && b > pd + 1) {
        add(
          "warning",
          p.id,
          `born ${b}, more than a year after father ${fullName(parent)} died in ${pd}`,
        );
      }
    }

    for (const s of p.spouses ?? []) {
      const year = s.date?.year;
      if (!year) continue;
      if (b && year < b + 10)
        add("error", p.id, `married in ${year}, aged ${year - b}`);
      if (d && year > d) add("error", p.id, `married in ${year}, after dying in ${d}`);
    }
  }

  /* -------------------- cycles -------------------- */

  const state = new Map<string, 0 | 1 | 2>(); // 0 unvisited, 1 on stack, 2 done
  const cycles: string[] = [];

  const walk = (id: string, stack: string[]) => {
    const s = state.get(id) ?? 0;
    if (s === 2) return;
    if (s === 1) {
      cycles.push([...stack.slice(stack.indexOf(id)), id].join(" → "));
      return;
    }
    state.set(id, 1);
    const p = archive.people.get(id);
    for (const parent of [p?.fatherId, p?.motherId]) {
      if (parent && archive.people.has(parent)) walk(parent, [...stack, id]);
    }
    state.set(id, 2);
  };

  for (const p of archive.personList) walk(p.id, []);

  for (const cycle of cycles) {
    problems.push({
      severity: "error",
      personId: "",
      person: "",
      message: `ancestry cycle: ${cycle}`,
    });
  }

  /* -------------------- report -------------------- */

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");
  const s = archive.stats;

  console.log("");
  console.log(`  people        ${s.people}`);
  console.log(`  unions        ${s.unions}`);
  console.log(`  lineages      ${s.lineages} (largest ${s.largestLineage})`);
  console.log(`  generations   up to ${s.maxGenerations}`);
  console.log(`  years         ${s.earliestYear}–${s.latestYear}`);
  console.log(`  living        ${s.living}`);
  console.log(`  surnames      ${s.bySurname.length}`);
  console.log(`  gotras        ${s.byGotra.length}`);
  console.log(`  mool villages ${s.byMool.length}`);
  console.log("");

  const show = (list: Problem[], label: string, limit = 15) => {
    if (!list.length) return;
    console.log(`${label} (${list.length}):`);
    for (const p of list.slice(0, limit)) {
      console.log(`  ${p.person ? p.person + " — " : ""}${p.message}`);
    }
    if (list.length > limit) console.log(`  … and ${list.length - limit} more`);
    console.log("");
  };

  show(errors, "ERRORS");
  show(warnings, "Warnings");

  if (!errors.length && !warnings.length) {
    console.log("No problems found.\n");
  }

  process.exit(errors.length ? 1 : 0);
}

main();
