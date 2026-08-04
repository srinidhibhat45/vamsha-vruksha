"use client";

import { AppLink as Link } from "@/components/AppLink";
import { useEffect, useId, useRef, useState } from "react";
import { Select } from "../ui/Select";
import { MatchHint } from "../MatchHint";
import { PhotoField } from "../PhotoField";
import {
  conventionalName,
  describeDraft,
  displayOf,
  nameMatches,
} from "@/lib/family";
import type { ContributeRefs } from "../ContributeForm";
import type { DraftMarriage } from "./FamilyBuilder";
import type { DraftPerson, SpouseLink } from "@/lib/types";

/**
 * One person inside a family draft, as a panel beside the drawing.
 *
 * Everything optional is behind a disclosure, and that is the difference
 * between a form somebody fills in for eighteen people and one they abandon at
 * the fourth. Name, sex, years: that is the whole visible form. Lineage,
 * places, a life, a photograph are one press away for the people the
 * contributor actually knows those things about — which is usually three of
 * the eighteen.
 *
 * The match suggestions sit directly under the name, not at the end. By the
 * time somebody has filled in a birth year and a gotra they have decided this
 * is a new person; the useful moment to say "this may be the Vasudev Kamath
 * already here" is while the name is still being typed.
 *
 * The relationship buttons are duplicated here from the canvas on purpose.
 * On the drawing they are the fast path; here they are the *reachable* path —
 * an SVG canvas driven by pointer gestures cannot be the only way to state
 * that somebody had a father.
 */

const GENDERS = [
  { value: "?", label: "Not recorded" },
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "X", label: "Other" },
];

const STATUSES = [
  { value: "", label: "Not sure" },
  { value: "living", label: "Living" },
  { value: "deceased", label: "No longer living" },
];

const CONFIDENCE = [
  { value: "verified", label: "I have the document" },
  { value: "attested", label: "More than one of us agrees" },
  { value: "oral", label: "I was told this" },
  { value: "unverified", label: "I am not sure" },
];

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const uid = useId();
  const hintId = hint ? `${uid}-hint` : undefined;
  return (
    <div>
      <label className="label" htmlFor={`${uid}-f`}>
        {label}
      </label>
      {children({ id: `${uid}-f`, "aria-describedby": hintId })}
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}

function Disclosure({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-[var(--line)] pt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="state-layer flex w-full items-center gap-2 rounded-[var(--shape-xs)] px-1 py-1.5 text-left"
      >
        <svg
          viewBox="0 0 16 16"
          className={`h-3.5 w-3.5 shrink-0 text-[var(--fg-faint)] transition-transform ${
            open ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m6 3 5 5-5 5" />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9rem] font-medium">{title}</span>
          {summary && !open && (
            <span className="block truncate text-[0.78rem] text-[var(--fg-faint)]">
              {summary}
            </span>
          )}
        </span>
      </button>
      {open && <div className="mt-3 space-y-3.5 px-1 pb-1">{children}</div>}
    </div>
  );
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const ORDINAL = ["", "First", "Second", "Third", "Fourth", "Fifth"];

/**
 * One marriage, with the two things that make a second one legible: when it
 * happened and whether it had ended. Plus the child button, which belongs
 * here rather than on the person — a child is a child *of a marriage*, and
 * asking for one from somebody with two wives has no answer.
 */
function MarriageRow({
  marriage,
  index,
  allPeople,
  onSelect,
  onChange,
  onRemove,
  onAddChild,
}: {
  marriage: DraftMarriage;
  index?: number;
  allPeople: DraftPerson[];
  onSelect: (key: string) => void;
  onChange: (changes: {
    year?: number;
    endYear?: number;
    status?: SpouseLink["status"];
  }) => void;
  onRemove: () => void;
  onAddChild: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const partner = marriage.partner;
  const name = displayOf(partner);
  const yearOf = (v: string) => {
    const n = Number(v);
    return v.trim() && Number.isFinite(n) ? n : undefined;
  };

  return (
    <div className="rounded-[var(--shape-md)] border border-[var(--outline-soft)] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 text-[0.9rem]">
          {index && (
            <span className="fact-label mr-1.5">
              {ORDINAL[index] ?? `${index}th`}
            </span>
          )}
          <button
            type="button"
            onClick={() => onSelect(partner.key)}
            className={`link-underline font-medium ${
              name ? "" : "italic text-[var(--fg-faint)]"
            }`}
          >
            {name || describeDraft(partner, allPeople)}
          </button>
        </p>
        {confirm ? (
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onRemove}
              className="btn btn-text btn-sm text-[var(--accent)]"
            >
              Unmarry
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              className="btn btn-text btn-sm"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirm(true)}
            className="btn btn-text btn-sm shrink-0 text-[var(--fg-faint)]"
          >
            Not married
            <span className="sr-only">
              {" "}
              — remove this marriage, keeping both people
            </span>
          </button>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Married in">
          {(p) => (
            <input
              {...p}
              className="field field-sm"
              inputMode="numeric"
              value={marriage.year ?? ""}
              onChange={(e) => onChange({ year: yearOf(e.target.value) })}
              placeholder="1923"
            />
          )}
        </Field>
        <Field label="Until">
          {(p) => (
            <input
              {...p}
              className="field field-sm"
              inputMode="numeric"
              value={marriage.endYear ?? ""}
              onChange={(e) => onChange({ endYear: yearOf(e.target.value) })}
              placeholder="1928"
            />
          )}
        </Field>
      </div>

      <div className="mt-2">
        <Select
          label="How it ended"
          value={marriage.status === "married" ? "" : (marriage.status ?? "")}
          onChange={(v) =>
            onChange({
              status: (v || "married") as SpouseLink["status"],
            })
          }
          options={MARRIAGE_END}
        />
      </div>

      <button
        type="button"
        onClick={onAddChild}
        className="btn btn-outlined btn-sm mt-2.5"
      >
        <span aria-hidden>+</span> Child of this marriage
      </button>
    </div>
  );
}

export interface DraftRelatives {
  father?: DraftPerson;
  mother?: DraftPerson;
  spouses: DraftPerson[];
  children: DraftPerson[];
  siblings: DraftPerson[];
}

const MARRIAGE_END = [
  { value: "", label: "Still married, or not known" },
  { value: "widowed", label: "Ended — one of them died" },
  { value: "separated", label: "Ended — separated" },
];

export function DraftPersonForm({
  person,
  refs,
  relatives,
  marriages,
  allPeople,
  variant,
  onChange,
  onRemove,
  onAddFather,
  onAddMother,
  onAddSpouse,
  onAddChild,
  onAddSibling,
  onUpdateMarriage,
  onRemoveMarriage,
  onAddChildOfMarriage,
  onUseNameOf,
  onSelect,
  onLinkExisting,
  onUnlinkExisting,
}: {
  person: DraftPerson;
  refs: ContributeRefs;
  relatives: DraftRelatives;
  marriages: DraftMarriage[];
  allPeople: DraftPerson[];
  variant: "contribute" | "admin";
  onChange: (changes: Partial<DraftPerson>) => void;
  onRemove: () => void;
  onAddFather: () => void;
  onAddMother: () => void;
  onAddSpouse: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onUpdateMarriage: (
    ownerKey: string,
    linkKey: string,
    changes: { year?: number; endYear?: number; status?: SpouseLink["status"] },
  ) => void;
  onRemoveMarriage: (ownerKey: string, linkKey: string) => void;
  onAddChildOfMarriage: (partnerKey: string) => void;
  onUseNameOf: (sourceKey: string) => void;
  onSelect: (key: string) => void;
  onLinkExisting: (id: string) => void;
  onUnlinkExisting: () => void;
}) {
  const [showLineage, setShowLineage] = useState(false);
  const [showLife, setShowLife] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const givenRef = useRef<HTMLInputElement>(null);

  // A row that has just been created has no name, and the only sensible next
  // keystroke is that name. Anything already named is left alone, so clicking
  // around the drawing does not keep stealing the caret.
  useEffect(() => {
    if (!person.given.trim()) givenRef.current?.focus();
    setConfirmRemove(false);
  }, [person.key, person.given]);

  const set = <K extends keyof DraftPerson>(key: K, value: DraftPerson[K]) =>
    onChange({ [key]: value } as Partial<DraftPerson>);

  const year = (v: string) => {
    const n = Number(v);
    return v.trim() && Number.isFinite(n) ? n : undefined;
  };
  const commaList = (v: string) => {
    const items = v.split(",").map((s) => s.trim()).filter(Boolean);
    return items.length ? items : undefined;
  };

  const linked = !!person.existingId;
  const refOptions = (list: { id: string; label: string }[], blank: string) => [
    { value: "", label: blank },
    ...list.map((r) => ({ value: r.id, label: r.label })),
  ];

  const lineageSummary =
    [person.gotra, person.kuladevata, person.mool]
      .filter(Boolean)
      .length > 0
      ? "Filled in"
      : "Gotra, kuladevata, village, matha";

  // Marriages get their own block below — they carry dates and a child button
  // each, which a one-line list of names cannot.
  const relationRows = [
    { label: "Father", list: relatives.father ? [relatives.father] : [] },
    { label: "Mother", list: relatives.mother ? [relatives.mother] : [] },
    { label: "Brothers and sisters", list: relatives.siblings },
    { label: "Children", list: relatives.children },
  ].filter((row) => row.list.length);

  /*
    Whose name this person carries, by the convention — her father's until she
    marries, her husband's after. Offered rather than applied, and only when
    it would actually change something.
  */
  const husband = marriages.find((m) => m.partner.gender !== "F")?.partner;
  const nameSources =
    person.gender === "F"
      ? ([
          husband && { source: husband, role: "husband" as const },
          relatives.father && {
            source: relatives.father,
            role: "father" as const,
          },
        ].filter(Boolean) as { source: DraftPerson; role: "husband" | "father" }[])
      : [];
  const nameOffers = nameSources.filter(
    (s) =>
      displayOf(s.source) &&
      !nameMatches(person, s.source) &&
      (conventionalName(s.source).patronymic ||
        conventionalName(s.source).surname),
  );

  return (
    <section className="surface flex min-h-0 flex-col">
      {/* ------------------------------------------------- Heading */}
      <header className="border-b border-[var(--line)] px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          {/* Not "New person": the heading has to say *which* new person, or
              it is the same heading on every unnamed row in the draft. */}
          <h2
            className={`font-display text-[1.25rem] font-medium leading-tight ${
              displayOf(person) ? "" : "italic text-[var(--fg-soft)]"
            }`}
          >
            {displayOf(person) || sentenceCase(describeDraft(person, allPeople))}
          </h2>
          {confirmRemove ? (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onRemove}
                className="btn btn-filled btn-sm"
              >
                Remove
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="btn btn-text btn-sm"
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="btn btn-text btn-sm shrink-0 text-[var(--fg-faint)]"
            >
              Remove
              <span className="sr-only">
                {" "}
                {displayOf(person) || describeDraft(person, allPeople)}
              </span>
            </button>
          )}
        </div>
        {linked && (
          <p className="mt-1 text-[0.82rem] leading-snug text-[var(--color-tulsi)]">
            Linked to{" "}
            <Link
              href={`/person/${person.existingId}`}
              target="_blank"
              className="link-underline font-medium"
            >
              a record already in the archive
            </Link>
            . Nothing new is created for them.
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto scroll-slim px-4 py-4">
        {/* --------------------------------------------- Relatives */}
        <div className="rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3">
          <h3 className="label">Add a relative</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!relatives.father && (
              <button type="button" onClick={onAddFather} className="btn btn-outlined btn-sm">
                <span aria-hidden>+</span> Father
              </button>
            )}
            {!relatives.mother && (
              <button type="button" onClick={onAddMother} className="btn btn-outlined btn-sm">
                <span aria-hidden>+</span> Mother
              </button>
            )}
            <button type="button" onClick={onAddSpouse} className="btn btn-outlined btn-sm">
              <span aria-hidden>+</span>{" "}
              {marriages.length ? "Another marriage" : "Marriage"}
            </button>
            {/* With two marriages there is no such thing as "a child" — the
                buttons that mean something are the one per marriage below. */}
            {marriages.length < 2 && (
              <button
                type="button"
                onClick={onAddChild}
                className="btn btn-outlined btn-sm"
                title={
                  marriages.length === 1
                    ? `Add a child of this marriage`
                    : "Add a child with no other parent recorded"
                }
              >
                <span aria-hidden>+</span> Child
              </button>
            )}
            {(relatives.father || relatives.mother) && (
              <button type="button" onClick={onAddSibling} className="btn btn-outlined btn-sm">
                <span aria-hidden>+</span> Sibling
              </button>
            )}
          </div>

          {relationRows.length > 0 && (
            <dl className="mt-3 space-y-1.5 text-[0.85rem]">
              {relationRows.map((row) => (
                <div key={row.label} className="flex gap-2">
                  <dt className="fact-label w-[5.5rem] shrink-0 pt-0.5">
                    {row.label}
                  </dt>
                  <dd className="flex flex-wrap gap-x-2 gap-y-1">
                    {row.list.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => onSelect(r.key)}
                        className={`link-underline text-left ${
                          displayOf(r) ? "" : "italic text-[var(--fg-faint)]"
                        }`}
                      >
                        {displayOf(r) || "not named yet"}
                      </button>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {/* ---------------------------------------------- Marriages */}
        {marriages.length > 0 && (
          <div className="space-y-2">
            <h3 className="label">
              {marriages.length > 1
                ? `${marriages.length} marriages`
                : "The marriage"}
            </h3>
            {marriages.length > 1 && (
              <p className="hint">
                Listed oldest first. Say when each one ended and the tree draws
                them in order, so a second marriage reads as a remarriage
                rather than as two at once.
              </p>
            )}
            {marriages.map((m, i) => (
              <MarriageRow
                key={m.partner.key}
                marriage={m}
                index={marriages.length > 1 ? i + 1 : undefined}
                allPeople={allPeople}
                onSelect={onSelect}
                onChange={(changes) =>
                  onUpdateMarriage(m.ownerKey, m.linkKey, changes)
                }
                onRemove={() => onRemoveMarriage(m.ownerKey, m.linkKey)}
                onAddChild={() => onAddChildOfMarriage(m.partner.key)}
              />
            ))}
          </div>
        )}

        {/* ------------------------------------------------- Name */}
        <div className="space-y-3.5">
          <Field label="Given name">
            {(p) => (
              <input
                {...p}
                ref={givenRef}
                className="field"
                value={person.given}
                onChange={(e) => set("given", e.target.value)}
                placeholder="Narayan"
                autoComplete="off"
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Father's name" hint="The Konkani middle name.">
              {(p) => (
                <input
                  {...p}
                  className="field"
                  value={person.patronymic ?? ""}
                  onChange={(e) => set("patronymic", e.target.value || undefined)}
                  placeholder="Vasudev"
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Surname">
              {(p) => (
                <input
                  {...p}
                  className="field"
                  value={person.surname ?? ""}
                  onChange={(e) => set("surname", e.target.value || undefined)}
                  placeholder="Kamath"
                  autoComplete="off"
                />
              )}
            </Field>
          </div>

          {/*
            The convention, as a button rather than a rule.

            A woman's middle name is her father's given name until she marries
            and her husband's afterwards, and her surname moves with it — the
            same woman is Sunanda Vasudev Kamath in her father's records and
            Sunanda Narayan Pai in her husband's. Doing that silently would
            overwrite a contributor who typed something else on purpose, and
            plenty of families no longer follow it at all. So it is offered,
            with both names visible, and either one is one press away.
          */}
          {nameOffers.length > 0 && (
            <div className="rounded-[var(--shape-sm)] bg-[var(--bg-sunken)] px-3 py-2.5">
              <p className="text-[0.8rem] leading-relaxed text-[var(--fg-soft)]">
                By the usual naming, a woman carries her father&rsquo;s name
                until she marries and her husband&rsquo;s after.
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {nameOffers.map(({ source, role }) => {
                  const next = conventionalName(source);
                  const shown = [person.given, next.patronymic, next.surname]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={source.key}
                      type="button"
                      onClick={() => onUseNameOf(source.key)}
                      className="btn btn-text btn-sm"
                      title={`Use ${displayOf(source)}'s name: ${shown}`}
                    >
                      Take her {role}&rsquo;s name
                      <span className="text-[var(--fg-faint)]">
                        {[next.patronymic, next.surname]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/*
            Not shown for a row that is already linked to a record — the
            question "is this person already here" has been answered for it.
          */}
          {!linked && (
            <MatchHint
              descriptor={{
                given: person.given,
                patronymic: person.patronymic,
                surname: person.surname,
                aka: person.aka,
                devanagari: person.devanagari,
                birthYear: person.birthYear,
                deathYear: person.deathYear,
                gotra: person.gotra,
                mool: person.mool,
                kuladevata: person.kuladevata,
                math: person.math,
                community: person.community,
                fatherName: relatives.father ? displayOf(relatives.father) : undefined,
                motherName: relatives.mother ? displayOf(relatives.mother) : undefined,
                spouseName: relatives.spouses[0]
                  ? displayOf(relatives.spouses[0])
                  : undefined,
                // Rows already linked in this draft cannot be the answer twice.
                exclude: allPeople
                  .map((p) => p.existingId)
                  .filter((id): id is string => !!id),
              }}
              onLink={(match) => onLinkExisting(match.id)}
              linkLabel="This is them"
            />
          )}

          {linked && (
            <button
              type="button"
              onClick={onUnlinkExisting}
              className="btn btn-text btn-sm"
            >
              Not the same person — enter them as new
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Sex"
              value={person.gender ?? "?"}
              onChange={(v) => set("gender", v as DraftPerson["gender"])}
              options={GENDERS}
            />
            <Select
              label="Living?"
              value={person.status ?? ""}
              onChange={(v) =>
                set("status", (v || undefined) as DraftPerson["status"])
              }
              options={STATUSES}
            />
            <Field label="Born">
              {(p) => (
                <input
                  {...p}
                  className="field"
                  inputMode="numeric"
                  value={person.birthYear ?? ""}
                  onChange={(e) => set("birthYear", year(e.target.value))}
                  placeholder="1897"
                />
              )}
            </Field>
            <Field label="Died">
              {(p) => (
                <input
                  {...p}
                  className="field"
                  inputMode="numeric"
                  value={person.deathYear ?? ""}
                  onChange={(e) => set("deathYear", year(e.target.value))}
                />
              )}
            </Field>
          </div>
        </div>

        {/* ---------------------------------------------- Lineage */}
        <Disclosure
          title="Gotra, kuladevata, village"
          summary={lineageSummary}
          open={showLineage}
          onToggle={() => setShowLineage((v) => !v)}
        >
          <p className="hint">
            Not on the list? Type it in and choose the &ldquo;add&rdquo; row —
            it is recorded as you wrote it, and a maintainer confirms the
            spelling before it joins the list for everybody else.
          </p>
          <Select
            label="Gotra"
            value={person.gotra ?? ""}
            onChange={(v) => set("gotra", v || undefined)}
            allowCustom
            options={refOptions(refs.gotras, "Not known")}
          />
          <Select
            label="Kuladevata"
            value={person.kuladevata ?? ""}
            onChange={(v) => set("kuladevata", v || undefined)}
            allowCustom
            options={refOptions(refs.kuladevatas, "Not known")}
          />
          <Select
            label="Mool (ancestral village)"
            value={person.mool ?? ""}
            onChange={(v) => set("mool", v || undefined)}
            allowCustom
            options={refOptions(refs.moolPlaces, "Not known")}
          />
          <Select
            label="Matha"
            value={person.math ?? ""}
            onChange={(v) => set("math", v || undefined)}
            allowCustom
            options={refOptions(refs.maths, "Not known")}
          />
          <Select
            label="Community"
            value={person.community ?? ""}
            onChange={(v) => set("community", v || undefined)}
            allowCustom
            options={refOptions(refs.communities, "Not known")}
          />
          <Select
            label="Born at"
            value={person.birthPlace ?? ""}
            onChange={(v) => set("birthPlace", v || undefined)}
            allowCustom
            options={refOptions(refs.places, "Not recorded")}
          />

          <Field
            label="Other spellings or nicknames"
            hint="Comma separated. The single most useful thing for stopping a second copy of this person being created later."
          >
            {(p) => (
              <input
                {...p}
                className="field"
                value={(person.aka ?? []).join(", ")}
                onChange={(e) => set("aka", commaList(e.target.value))}
                placeholder="Naraina, Nanu"
              />
            )}
          </Field>
        </Disclosure>

        {/* ------------------------------------------------- Life */}
        <Disclosure
          title="Their life, and a photograph"
          summary={person.epithet || person.bio ? "Filled in" : "Optional"}
          open={showLife}
          onToggle={() => setShowLife((v) => !v)}
        >
          <Field label="One line they'd be remembered by">
            {(p) => (
              <input
                {...p}
                className="field"
                value={person.epithet ?? ""}
                onChange={(e) => set("epithet", e.target.value || undefined)}
                placeholder="kept the family ledger"
              />
            )}
          </Field>

          <Field label="Work" hint="Comma separated.">
            {(p) => (
              <input
                {...p}
                className="field"
                value={(person.occupations ?? []).join(", ")}
                onChange={(e) => set("occupations", commaList(e.target.value))}
              />
            )}
          </Field>

          <Field label="Places they lived" hint="Comma separated, in order.">
            {(p) => (
              <input
                {...p}
                className="field"
                value={(person.residences ?? []).join(", ")}
                onChange={(e) => set("residences", commaList(e.target.value))}
                placeholder="Kumta, Bombay, Pune"
              />
            )}
          </Field>

          <Field label="Anything else worth writing down">
            {(p) => (
              <textarea
                {...p}
                className="field min-h-24"
                value={person.bio ?? ""}
                onChange={(e) => set("bio", e.target.value || undefined)}
              />
            )}
          </Field>

          <PhotoField
            value={person.photo ?? null}
            onChange={(photo) => set("photo", photo ?? undefined)}
            label={`A photograph of ${displayOf(person) || "them"}`}
          />

          {variant === "contribute" && (
            <Select
              label="How sure are you about this person?"
              value={person.confidence ?? "oral"}
              onChange={(v) => set("confidence", v as DraftPerson["confidence"])}
              options={CONFIDENCE}
            />
          )}
        </Disclosure>
      </div>
    </section>
  );
}
