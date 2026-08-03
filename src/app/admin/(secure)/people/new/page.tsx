import type { Metadata } from "next";
import { buildRefs } from "@/lib/refs";
import { EMPTY_PERSON, PersonEditor } from "@/components/admin/PersonEditor";

export const metadata: Metadata = { title: "Add a person" };
export const dynamic = "force-dynamic";

export default async function NewPersonPage() {
  return (
    <div className="mx-auto max-w-[860px] px-4 py-9">
      <header>
        <h1 className="font-display text-[2.1rem] font-medium">Add a person</h1>
        <p className="mt-2 max-w-2xl text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
          A name is enough to start. Everything else can be filled in later, and
          a record that says only what is known is worth more than one padded
          with guesses.
        </p>
      </header>

      <div className="mt-7">
        <PersonEditor refs={buildRefs()} initial={EMPTY_PERSON} />
      </div>
    </div>
  );
}
