import Link from "next/link";
import {
  CONFIDENCE_LABEL,
  birthYear,
  deathYear,
  fullName,
  getArchive,
  initials,
} from "@/lib/archive";
import type { Person } from "@/lib/types";

/**
 * One person, as a row in a list of results.
 *
 * ------------------------------------------------------------------
 * The layout, and why it is a grid rather than a stack.
 *
 * A result carries two unrelated kinds of fact: who this is — name, dates,
 * which family, what they were remembered for — and where they sit in the
 * lineage system — gotra, village, kuladevata, matha. Stacked one under the
 * other in a single column they read as one undifferentiated spill of text,
 * and nothing in the twenty rows below lines up with anything in this one.
 *
 * So the row is a grid: identity on the left, the four lineage coordinates in
 * a fixed column on the right behind a hairline, in the same place in every
 * row. That is what makes a column of results scannable — you can run your
 * eye down "Mool village" alone and never read a name. Below `lg` the right
 * column drops underneath, still on its own grid.
 *
 * The four facts used to be four coloured pills, then four colour-barred
 * values. Both made colour do work that the field name does better and
 * neither survived being repeated twenty times down a page. The field name
 * is now the only label the value needs.
 * ------------------------------------------------------------------
 */

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="fact-label">{label}</dt>
      <dd className="mt-0.5 truncate text-[0.875rem] leading-snug" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function PersonRow({
  person,
  note,
  lineageLabel,
}: {
  person: Person;
  note?: string;
  lineageLabel?: string;
}) {
  const archive = getArchive();
  const b = birthYear(person);
  const d = deathYear(person);
  const years =
    b && d
      ? `${b}–${d}`
      : b
        ? person.status === "living"
          ? `born ${b}`
          : `${b}–`
        : d
          ? `died ${d}`
          : "dates unknown";

  const accent =
    person.gender === "F"
      ? "var(--color-kumkum)"
      : person.gender === "M"
        ? "var(--color-samudra)"
        : "var(--color-gold)";

  const facts = [
    {
      label: "Gotra",
      value: person.gotra
        ? (archive.gotras.get(person.gotra)?.name ?? person.gotra)
        : undefined,
    },
    {
      label: "Mool village",
      value: person.mool
        ? (archive.places.get(person.mool)?.name ?? person.mool)
        : undefined,
    },
    {
      label: "Kuladevata",
      value: person.kuladevata
        ? (archive.kuladevatas.get(person.kuladevata)?.name ??
          person.kuladevata)
        : undefined,
    },
    {
      label: "Matha",
      value: person.math
        ? (archive.maths.get(person.math)?.name ?? person.math)
        : undefined,
    },
  ].filter((f) => f.value);

  const confidenceTone =
    person.confidence === "verified"
      ? "var(--color-tulsi)"
      : person.confidence === "attested"
        ? "var(--color-gold)"
        : undefined;

  const subtitle = person.epithet ?? note;

  return (
    <Link
      href={`/person/${person.id}`}
      className="group grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 border-b border-[var(--line)] px-5 py-5 transition-colors last:border-0 hover:bg-[var(--bg-sunken)] focus-visible:bg-[var(--bg-sunken)] lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,21rem)] lg:gap-x-6"
    >
      {/* Monogram ---------------------------------------------------- */}
      <span
        className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[0.85rem] font-semibold"
        style={{
          background: `color-mix(in oklab, ${accent} 13%, var(--bg-inset))`,
          color: `color-mix(in oklab, ${accent} 58%, var(--fg))`,
          border: `1px solid color-mix(in oklab, ${accent} 34%, transparent)`,
        }}
        aria-hidden
      >
        {initials(person)}
      </span>

      {/* Who ---------------------------------------------------------- */}
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[1.2rem] font-medium leading-snug group-hover:text-[var(--accent)]">
            {fullName(person)}
          </span>
          <span className="text-[0.875rem] tabular-nums text-[var(--fg-soft)]">
            {years}
          </span>
          {person.status === "living" && (
            <span className="chip chip-sm chip-accent">living</span>
          )}
        </span>

        {(lineageLabel || subtitle) && (
          <span className="mt-1.5 block text-[0.875rem] leading-relaxed text-[var(--fg-soft)]">
            {lineageLabel}
            {lineageLabel && subtitle && (
              <span className="text-[var(--fg-faint)]"> — </span>
            )}
            {subtitle}
          </span>
        )}

        {/* Provenance, and what they did. The two things that qualify a
            record rather than locate it. */}
        <span className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8rem] text-[var(--fg-faint)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{
                background: confidenceTone ?? "transparent",
                border: confidenceTone ? "none" : "1px solid currentColor",
              }}
              aria-hidden
            />
            {CONFIDENCE_LABEL[person.confidence]}
          </span>
          {person.occupations?.[0] && (
            <>
              <span aria-hidden>·</span>
              <span>{person.occupations[0]}</span>
            </>
          )}
        </span>
      </span>

      {/* Where they sit in the lineage system -------------------------- */}
      {facts.length > 0 && (
        <dl className="col-start-2 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-[var(--line)] pt-3.5 lg:col-start-3 lg:mt-0.5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          {facts.map((f) => (
            <Fact key={f.label} label={f.label} value={f.value} />
          ))}
        </dl>
      )}
    </Link>
  );
}
