import type { Metadata } from "next";
import { fullName, getArchive } from "@/lib/archive";
import { buildRefs } from "@/lib/refs";
import { ContributeForm } from "@/components/ContributeForm";
import { Vrindavan } from "@/components/Ornament";

export const metadata: Metadata = {
  title: "Contribute",
  description:
    "Add a person, correct a record, or send a story to the archive. No account needed.",
};

type Params = Promise<{ correct?: string }>;

export default async function ContributePage({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;
  const archive = getArchive();

  // Shared with the maintainer's editor, so both offer the same vocabularies.
  const refs = buildRefs();

  const target = params.correct ? archive.people.get(params.correct) : undefined;

  return (
    <div className="mx-auto max-w-[860px] px-4 py-12">
      <header className="relative">
        <Vrindavan className="pointer-events-none absolute -right-4 -top-6 h-40 w-32 text-[var(--accent)] opacity-[0.09]" />
        <p className="eyebrow">
          <span className="deva" lang="kok">
            योगदान
          </span>{" "}
          · Contribute
        </p>
        <h1 className="mt-2 font-display text-[2.6rem] font-medium leading-tight">
          {target ? "Correct a record" : "Add what you know"}
        </h1>
        <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-[var(--fg-soft)]">
          There is no account to make and no fee. Fill in as much as you know
          and leave the rest blank — a name and a village is a real
          contribution, and a great many records here started as exactly that.
        </p>
      </header>

      <div className="my-9 grid gap-4 sm:grid-cols-3">
        {[
          {
            n: "1",
            title: "You send it",
            body: "Whatever you have. Partial is fine; wrong-but-flagged is better than missing.",
          },
          {
            n: "2",
            title: "A person reads it",
            body: "Checked against what is already here, and against the dates. Duplicates get merged, not stacked.",
          },
          {
            n: "3",
            title: "It goes in with your name on it",
            body: "Every record shows who contributed it and what it is based on, so the next reader can judge for themselves.",
          },
        ].map((step) => (
          <div
            key={step.n}
            className="rounded-[var(--shape-md)] border border-[var(--line)] p-4"
          >
            <span className="font-display text-[1.75rem] font-medium text-[var(--accent)]" aria-hidden>
              {step.n}
            </span>
            <h2 className="mt-1 font-display text-[1.2rem] font-medium">{step.title}</h2>
            <p className="mt-1.5 text-[0.9rem] leading-relaxed text-[var(--fg-soft)]">
              {step.body}
            </p>
          </div>
        ))}
      </div>

      <div
        id="correct"
        className="mb-6 rounded-[var(--shape-md)] border border-[var(--outline-soft)] bg-[var(--bg-sunken)] p-4"
      >
        <h2 className="font-display text-[1.2rem] font-medium">
          Before you add a living person
        </h2>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
          Ask them. This archive is fully public and search engines will index
          it. Names, years and family links for people who have agreed are
          welcome; addresses, phone numbers, exact dates of birth and anything
          that reads as a private matter are not, and will be removed in review.
          If you would rather a living relative appeared as a name only, say so
          in the note at the bottom and that is what will happen.
        </p>
      </div>

      <ContributeForm
        refs={refs}
        correctTarget={
          target ? { id: target.id, name: fullName(target) } : undefined
        }
      />
    </div>
  );
}
