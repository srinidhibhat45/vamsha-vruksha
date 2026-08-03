import type { Metadata } from "next";
import { queueCounts, readSubmissions } from "@/lib/submissions";
import { ReviewQueue } from "@/components/admin/ReviewQueue";

export const metadata: Metadata = { title: "Review queue" };
export const dynamic = "force-dynamic";

type Params = Promise<{ status?: string }>;

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const { status } = await searchParams;
  const submissions = readSubmissions();
  const counts = queueCounts();

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-9">
      <header>
        <h1 className="font-display text-[2.1rem] font-medium">Review queue</h1>
        <p className="mt-2 text-[0.98rem] text-[var(--fg-soft)]">
          {counts.pending} waiting · {counts.changesRequested} sent back ·{" "}
          {counts.merged} published · {counts.rejected} declined
        </p>
        <p className="mt-3 max-w-2xl text-[0.9rem] leading-relaxed text-[var(--fg-faint)]">
          Approving writes the submission into{" "}
          <code className="rounded bg-[var(--bg-inset)] px-1 py-0.5">
            data/people/
          </code>{" "}
          and it appears on the site straight away. Commit the change afterwards
          — git is what gives the archive a record of who claimed what, and a
          commit with a human name on it is worth more than an automated write.
        </p>
      </header>

      <div className="mt-7">
        <ReviewQueue submissions={submissions} initialFilter={status ?? "pending"} />
      </div>
    </div>
  );
}
