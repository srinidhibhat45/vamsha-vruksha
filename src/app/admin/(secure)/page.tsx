import Link from "next/link";
import { getArchive } from "@/lib/archive";
import { usingDefaultCredentials } from "@/lib/adminAuth";
import { queueCounts, readSubmissions } from "@/lib/submissions";
import { formatDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: number | string;
  detail?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="fact-label">{label}</p>
      <p className="mt-1 font-display text-[2rem] font-medium leading-none tabular-nums">
        {value}
      </p>
      {detail && (
        <p className="mt-1.5 text-[0.82rem] leading-snug text-[var(--fg-faint)]">
          {detail}
        </p>
      )}
    </>
  );

  return href ? (
    <Link href={href} className="surface block p-4 transition-colors hover:border-[var(--accent)]">
      {body}
    </Link>
  ) : (
    <div className="surface p-4">{body}</div>
  );
}

export default async function AdminHomePage() {
  const archive = getArchive();
  const counts = queueCounts();
  const recent = readSubmissions().slice(0, 5);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-9">
      <header>
        <h1 className="font-display text-[2.1rem] font-medium">Overview</h1>
        <p className="mt-2 text-[0.98rem] text-[var(--fg-soft)]">
          What is waiting, and what is already here.
        </p>
      </header>

      {usingDefaultCredentials() && (
        <div className="surface mt-6 border-[var(--accent)] p-4">
          <p className="text-[0.92rem] leading-relaxed">
            <strong className="font-medium">
              Still signing in with admin / admin.
            </strong>{" "}
            Fine while this is on your machine. Before it is reachable from
            anywhere else, set <code>ADMIN_USERNAME</code> and{" "}
            <code>ADMIN_PASSWORD</code> in <code>.env.local</code> — anyone who
            finds this page can otherwise rewrite the archive.
          </p>
        </div>
      )}

      <section className="mt-7">
        <h2 className="eyebrow">Queue</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Waiting"
            value={counts.pending}
            detail="Nobody has looked at these yet"
            href="/admin/queue?status=pending"
          />
          <Stat
            label="Sent back"
            value={counts.changesRequested}
            detail="Asked the contributor for more"
            href="/admin/queue?status=changes-requested"
          />
          <Stat
            label="Published"
            value={counts.merged}
            detail="Written into the archive"
            href="/admin/queue?status=merged"
          />
          <Stat
            label="Declined"
            value={counts.rejected}
            href="/admin/queue?status=rejected"
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="eyebrow">Archive</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="People" value={archive.stats.people} href="/admin/people" />
          <Stat label="Lineages" value={archive.stats.lineages} />
          <Stat
            label="Living"
            value={archive.stats.living}
            detail="Status not recorded as deceased"
          />
          <Stat
            label="Earliest record"
            value={archive.stats.earliestYear ?? "—"}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/admin/people/new" className="btn btn-filled btn-sm">
            Add a person
          </Link>
          <Link href="/admin/people" className="btn btn-outlined btn-sm">
            Find a record
          </Link>
        </div>

        {archive.sampleOnly && (
          <p className="mt-4 text-[0.88rem] leading-relaxed text-[var(--fg-faint)]">
            Everything in the archive is still generated sample data. Real
            records will sit alongside it; the sample files are safe to delete
            once they do.
          </p>
        )}
      </section>

      <section className="mt-9">
        <div className="flex items-baseline justify-between">
          <h2 className="eyebrow">Latest submissions</h2>
          <Link href="/admin/queue" className="link-underline text-[0.88rem]">
            All of them
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="mt-3 text-[0.95rem] text-[var(--fg-faint)]">
            Nothing has been submitted yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--line)] rounded-[var(--shape-md)] border border-[var(--line)]">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="chip chip-sm">{s.status}</span>
                <span className="font-medium">
                  {String(s.payload.displayName ?? "(no name given)")}
                </span>
                <span className="text-[0.85rem] text-[var(--fg-faint)]">
                  {s.kind.replace(/-/g, " ")} · from {s.submitter.name}
                </span>
                <time
                  className="ml-auto text-[0.82rem] text-[var(--fg-faint)]"
                  dateTime={s.submittedAt}
                >
                  {formatDate(s.submittedAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
