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
 * One person, as a card in a list of results.
 *
 * The problem this replaces: the four lineage facts were rendered as four
 * same-weight coloured pills in a row. Colour was the only thing separating
 * "Kaundinya gotra" from "Shri Mangesh" from "Kushasthali", the words were
 * 11px, and a reader who does not already know which of those is a deity and
 * which is a village had no way to find out. Four pills also read as four
 * tags of the same kind, which they are not.
 *
 * So the facts are now a labelled grid. The field name is above its value,
 * the value is set at reading size, and the colour is a supporting cue rather
 * than the whole signal. It costs two lines of height and returns the ability
 * to scan a column of results for a village.
 *
 * Ordering is deliberate: name, then when, then which family, then the four
 * fields that reconnect branches, then how well attested. That is the order a
 * reader checks them in.
 */

const FIELD_TONE: Record<string, string> = {
  Gotra: "var(--color-samudra)",
  "Mool village": "var(--color-tulsi)",
  Kuladevata: "var(--accent)",
  Matha: "var(--color-laterite)",
};

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="fact-label">{label}</dt>
      <dd
        className="fact-value truncate border-l-2 pl-2"
        style={{ borderColor: FIELD_TONE[label] ?? "var(--line-strong)" }}
        title={value}
      >
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

  return (
    <Link
      href={`/person/${person.id}`}
      className="group flex gap-4 border-b border-[var(--line)] px-4 py-4 transition-colors last:border-0 hover:bg-[var(--bg-sunken)] focus-visible:bg-[var(--bg-sunken)]"
    >
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

      <span className="min-w-0 flex-1">
        {/* Name and dates ------------------------------------------- */}
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[1.25rem] font-medium leading-snug group-hover:text-[var(--accent)]">
            {fullName(person)}
          </span>
          <span className="text-[0.9rem] tabular-nums text-[var(--fg-soft)]">
            {years}
          </span>
          {person.status === "living" && (
            <span className="chip chip-sm chip-accent">living</span>
          )}
        </span>

        {/* Which family, and what they were known for ---------------- */}
        {(lineageLabel || person.epithet || note) && (
          <span className="mt-1 block text-[0.9rem] leading-relaxed text-[var(--fg-soft)]">
            {lineageLabel && <span>{lineageLabel}</span>}
            {lineageLabel && (person.epithet || note) && (
              <span className="text-[var(--fg-faint)]"> — </span>
            )}
            {(person.epithet || note) && (
              <em className="not-italic">{person.epithet ?? note}</em>
            )}
          </span>
        )}

        {/* The four fields that reconnect branches ------------------- */}
        {facts.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-4">
            {facts.map((f) => (
              <Fact key={f.label} label={f.label} value={f.value} />
            ))}
          </dl>
        )}

        {/* Provenance ------------------------------------------------ */}
        <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-[var(--fg-faint)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                background: confidenceTone ?? "transparent",
                border: confidenceTone ? "none" : "1px solid currentColor",
              }}
              aria-hidden
            />
            {CONFIDENCE_LABEL[person.confidence]}
          </span>
          {person.occupations?.[0] && <span>{person.occupations[0]}</span>}
        </span>
      </span>
    </Link>
  );
}
