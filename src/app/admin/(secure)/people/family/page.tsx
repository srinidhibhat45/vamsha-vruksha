import type { Metadata } from "next";
import { AppLink as Link } from "@/components/AppLink";
import { buildRefs } from "@/lib/refs";
import { FamilyEditor } from "@/components/admin/FamilyEditor";

export const metadata: Metadata = { title: "Add a family" };
export const dynamic = "force-dynamic";

export default function NewFamilyPage() {
  return (
    <div className="mx-auto max-w-[1560px] px-4 py-9">
      <header>
        <h1 className="font-display text-[2.1rem] font-medium">Add a family</h1>
        <p className="mt-2 max-w-2xl text-[0.98rem] leading-relaxed text-[var(--fg-soft)]">
          For entering a household or a branch in one sitting — a register page,
          a family that has just sent in its tree, a line copied out of a
          notebook. Add one person, then build outward: the relationships are
          recorded by where you add somebody rather than by filling in ids, and
          everything is written in a single pass at the end.
        </p>
        <p className="mt-2 max-w-2xl text-[0.9rem] leading-relaxed text-[var(--fg-faint)]">
          Anyone already in the archive should be brought in with the search box
          rather than retyped, so the branch attaches to what is already here.{" "}
          <Link href="/admin/people/new" className="link-underline">
            One person at a time
          </Link>{" "}
          is still the right tool for a single record with a lot of detail.
        </p>
      </header>

      <div className="mt-7">
        <FamilyEditor refs={buildRefs()} />
      </div>
    </div>
  );
}
