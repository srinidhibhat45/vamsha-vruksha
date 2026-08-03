import type { Metadata } from "next";
import Link from "next/link";
import { fullName, getArchive, lifespan } from "@/lib/archive";
import {
  PeopleTable,
  type AdminPersonRow,
} from "@/components/admin/PeopleTable";

export const metadata: Metadata = { title: "Records" };
export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const archive = getArchive();

  // How many links a deletion would sever, counted once here rather than by
  // the client asking per row — the whole graph is already in memory.
  const links = new Map<string, number>();
  const bump = (id: string) => links.set(id, (links.get(id) ?? 0) + 1);
  for (const p of archive.personList) {
    if (p.fatherId) bump(p.fatherId);
    if (p.motherId) bump(p.motherId);
    for (const s of p.spouses ?? []) bump(s.personId);
  }

  const rows: AdminPersonRow[] = archive.personList
    .map((p) => ({
      id: p.id,
      name: fullName(p),
      lifespan: lifespan(p),
      gender: p.gender,
      status: p.status ?? "unknown",
      surname: p.name.surname,
      gotraLabel: p.gotra ? archive.gotras.get(p.gotra)?.name ?? p.gotra : undefined,
      moolLabel: p.mool ? archive.places.get(p.mool)?.name ?? p.mool : undefined,
      confidence: p.confidence,
      sample: p.sample,
      links: links.get(p.id) ?? 0,
      updatedAt: p.updatedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-9">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.1rem] font-medium">Records</h1>
          <p className="mt-2 text-[0.98rem] text-[var(--fg-soft)]">
            Every person in the archive. Edits here are written straight to disk
            and are live on the site immediately.
          </p>
        </div>
        <Link href="/admin/people/new" className="btn btn-filled">
          Add a person
        </Link>
      </header>

      <div className="mt-7">
        <PeopleTable rows={rows} />
      </div>
    </div>
  );
}
