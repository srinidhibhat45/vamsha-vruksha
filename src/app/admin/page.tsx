import type { Metadata } from "next";
import { isReviewer, queueCounts, readSubmissions } from "@/lib/submissions";
import { ReviewQueue } from "@/components/ReviewQueue";

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = Promise<{ key?: string }>;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const { key } = await searchParams;

  if (!isReviewer(key)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <h1 className="font-display text-[1.9rem] font-medium">Review queue</h1>
        <p className="mt-3 text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Moderation is the one part of this archive that is not open. Reach it
          with the maintainer&rsquo;s key appended to the address, as{" "}
          <code className="rounded bg-[var(--bg-inset)] px-1.5 py-0.5 text-[0.85rem]">
            /admin?key=…
          </code>
          .
        </p>
        <p className="mt-3 text-[0.9rem] text-[var(--fg-faint)]">
          {process.env.ARCHIVE_REVIEW_KEY
            ? "A key is configured on this deployment."
            : "No key is configured yet. Set ARCHIVE_REVIEW_KEY in the environment to enable review."}
        </p>
      </div>
    );
  }

  const submissions = readSubmissions();
  const counts = queueCounts();

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10">
      <header>
        <p className="eyebrow">Maintainers only</p>
        <h1 className="mt-2 font-display text-[2.2rem] font-medium">Review queue</h1>
        <p className="mt-2 text-[1rem] text-[var(--fg-soft)]">
          {counts.pending} waiting · {counts.approved} approved ·{" "}
          {counts.rejected} rejected · {counts.total} in all.
        </p>
        <p className="mt-3 max-w-2xl text-[0.92rem] leading-relaxed text-[var(--fg-faint)]">
          Approving marks a submission ready to be written into
          <code className="mx-1 rounded bg-[var(--bg-inset)] px-1 py-0.5">
            data/people/
          </code>
          and committed. Keeping the promotion step manual is deliberate: git is
          the archive&rsquo;s provenance log, and a commit with a human name on
          it is worth more than an automated write.
        </p>
      </header>

      <div className="mt-8">
        <ReviewQueue submissions={submissions} reviewKey={key!} />
      </div>
    </div>
  );
}
