import type { Metadata } from "next";
import { getArchive } from "@/lib/archive";
import { listPending } from "@/lib/vocabStore";
import { VocabularyQueue } from "@/components/admin/VocabularyQueue";

export const metadata: Metadata = { title: "Vocabulary" };
export const dynamic = "force-dynamic";

export default function VocabularyPage() {
  const entries = listPending();
  const archive = getArchive();

  const confirmed = (
    items: Iterable<{ id: string; name: string; pending?: boolean; region?: string }>,
  ) =>
    [...items]
      .filter((i) => !i.pending)
      .map((i) => ({
        id: i.id,
        label: i.region ? `${i.name} — ${i.region}` : i.name,
      }));

  return (
    <div className="mx-auto max-w-[900px] px-4 py-9">
      <header>
        <h1 className="font-display text-[2.1rem] font-medium">
          Names waiting on you
        </h1>
        <p className="mt-2 max-w-2xl text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
          The gotra, kuladevata, matha, community and village lists are
          controlled vocabularies — one entry per thing, so a directory page
          gathers a whole family rather than four spellings of it. They are also
          incomplete, and always will be: the person who knows the missing name
          is the contributor looking at a dropdown that does not have it.
        </p>
        <p className="mt-2 max-w-2xl text-[0.94rem] leading-relaxed text-[var(--fg-faint)]">
          So they can type it. What they typed is recorded against their own
          family immediately and lands here, out of everybody else&rsquo;s
          dropdown, until you confirm it, merge it into the entry it is a
          spelling of, or discard it. Merging and discarding both move the
          records that already use it — you will not leave anything pointing at
          a name that has gone.
        </p>
      </header>

      <div className="mt-7">
        <VocabularyQueue
          entries={entries}
          confirmedBy={{
            gotras: confirmed(archive.gotras.values()),
            maths: confirmed(archive.maths.values()),
            communities: confirmed(archive.communities.values()),
            kuladevatas: confirmed(archive.kuladevatas.values()),
            places: confirmed(archive.places.values()),
          }}
        />
      </div>
    </div>
  );
}
