"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { PersonPicker, type PickedPerson } from "./PersonPicker";
import { Select } from "./ui/Select";
import type { Suggestion } from "@/lib/search";

export interface RefOption {
  id: string;
  label: string;
  note?: string;
}

export interface ContributeRefs {
  gotras: RefOption[];
  maths: RefOption[];
  communities: RefOption[];
  kuladevatas: RefOption[];
  places: RefOption[];
  moolPlaces: RefOption[];
}

const KINDS = [
  {
    id: "new-person",
    title: "Add a person",
    blurb: "Someone not yet in the archive — an ancestor, a cousin, yourself.",
  },
  {
    id: "correction",
    title: "Correct a record",
    blurb: "A wrong date, a misspelled name, a parent linked to the wrong person.",
  },
  {
    id: "add-relationship",
    title: "Join two records",
    blurb:
      "You know that two people already here are father and son, or were married.",
  },
  {
    id: "story",
    title: "Add a story",
    blurb:
      "What a person did, where they moved and why, what the family remembers.",
  },
] as const;

type Kind = (typeof KINDS)[number]["id"];

interface SourceEntry {
  kind: string;
  title: string;
  detail: string;
}

const SOURCE_KINDS = [
  { id: "oral", label: "Something I was told" },
  { id: "document", label: "A document" },
  { id: "matha-record", label: "A matha register" },
  { id: "temple-record", label: "A temple record" },
  { id: "photograph", label: "A photograph" },
  { id: "book", label: "A book or article" },
  { id: "gravestone", label: "A gravestone" },
  { id: "web", label: "A website" },
  { id: "other", label: "Something else" },
];

const CONFIDENCE = [
  {
    id: "verified",
    label: "I have the document",
    note: "A certificate, register, horoscope or gazette entry I can point to.",
  },
  {
    id: "attested",
    label: "More than one of us agrees",
    note: "Several family members independently say the same thing.",
  },
  {
    id: "oral",
    label: "I was told this",
    note: "A single account, from memory. Usually right in outline, loose on dates.",
  },
  {
    id: "unverified",
    label: "I am not sure",
    note: "Worth recording, but flag it so nobody builds on it.",
  },
];

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-6">
      <h2 className="font-display text-[1.4rem] font-medium">{title}</h2>
      {note && (
        <p className="mt-2 text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
          {note}
        </p>
      )}
      <div className="mt-6 space-y-5">{children}</div>
    </section>
  );
}

/**
 * A labelled control.
 *
 * The hint used to be a loose <span> after the input. Sighted users read it;
 * screen-reader users heard the label, then the input, and the hint only if
 * they happened to keep reading past the field. Wiring it through
 * aria-describedby means the hint is read as part of the control, which is
 * where "the Konkani middle name: Narayan Vasudev Kamath" is actually needed.
 *
 * `children` is a render prop rather than a node so the id and describedby can
 * reach the input without every caller repeating them.
 */
function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: (props: {
    id: string;
    "aria-describedby"?: string;
    required?: boolean;
    "aria-required"?: boolean;
  }) => React.ReactNode;
  required?: boolean;
}) {
  const uid = useId();
  const id = `${uid}-field`;
  const hintId = hint ? `${uid}-hint` : undefined;

  return (
    <div className="block">
      <label className="label" htmlFor={id}>
        {label}
        {required && (
          <>
            <span aria-hidden className="text-[var(--accent)]">
              {" "}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {children({
        id,
        "aria-describedby": hintId,
        required,
        "aria-required": required || undefined,
      })}
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function ContributeForm({
  refs,
  correctTarget,
}: {
  refs: ContributeRefs;
  correctTarget?: { id: string; name: string };
}) {
  const [kind, setKind] = useState<Kind>(
    correctTarget ? "correction" : "new-person",
  );

  const [given, setGiven] = useState("");
  const [patronymic, setPatronymic] = useState("");
  const [surname, setSurname] = useState("");
  const [devanagari, setDevanagari] = useState("");
  const [aka, setAka] = useState("");
  const [gender, setGender] = useState("");
  const [living, setLiving] = useState("");

  const [birthYear, setBirthYear] = useState("");
  const [birthNote, setBirthNote] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [deathYear, setDeathYear] = useState("");
  const [deathPlace, setDeathPlace] = useState("");

  const [gotra, setGotra] = useState("");
  const [community, setCommunity] = useState("");
  const [math, setMath] = useState("");
  const [kuladevata, setKuladevata] = useState("");
  const [mool, setMool] = useState("");
  const [veda, setVeda] = useState("");
  const [sutra, setSutra] = useState("");

  const [occupations, setOccupations] = useState("");
  const [residences, setResidences] = useState("");
  const [epithet, setEpithet] = useState("");
  const [bio, setBio] = useState("");

  const [father, setFather] = useState<PickedPerson | null>(null);
  const [mother, setMother] = useState<PickedPerson | null>(null);
  const [spouse, setSpouse] = useState<PickedPerson | null>(null);
  const [marriageYear, setMarriageYear] = useState("");

  // Who a correction or a story is about, when the reader arrived at the
  // form directly rather than via a "Correct this" link that already knows.
  const [correctionTarget, setCorrectionTarget] = useState<PickedPerson | null>(null);
  const [storyTarget, setStoryTarget] = useState<PickedPerson | null>(null);

  // Joining two existing records is either a parent-child link or a
  // marriage — the pickers involved differ, so the kind is its own field
  // rather than inferred from which boxes got filled in.
  const [relType, setRelType] = useState<"parent-child" | "spouse">(
    "parent-child",
  );
  const [relChild, setRelChild] = useState<PickedPerson | null>(null);
  const [relPersonA, setRelPersonA] = useState<PickedPerson | null>(null);

  const [confidence, setConfidence] = useState("oral");
  const [sources, setSources] = useState<SourceEntry[]>([
    { kind: "oral", title: "", detail: "" },
  ]);

  const [submitterName, setSubmitterName] = useState("");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [message, setMessage] = useState("");

  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState<{
    id: string;
    duplicates: { id: string; name: string; birthYear?: number; confidence: number }[];
  } | null>(null);

  /* --------------------------------------------------------------- */
  /* Live duplicate warning                                           */
  /* --------------------------------------------------------------- */

  const [similar, setSimilar] = useState<Suggestion[]>([]);
  useEffect(() => {
    const name = [given, surname].filter(Boolean).join(" ").trim();
    if (kind !== "new-person" || name.length < 4) {
      setSimilar([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(name)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: Suggestion[] };
        setSimilar((data.suggestions ?? []).filter((s) => s.kind === "person").slice(0, 4));
      } catch {
        /* superseded */
      }
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [given, surname, kind]);

  /* --------------------------------------------------------------- */
  /* Who a correction or a story targets, and the payload each kind    */
  /* sends — see the note above KINDS: these four are not one form     */
  /* with different labels, they collect different facts.              */
  /* --------------------------------------------------------------- */

  const correctionTargetId = correctTarget?.id ?? correctionTarget?.id;
  const storyTargetId = correctTarget?.id ?? storyTarget?.id;

  const commaList = (v: string) =>
    v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssues([]);

    const fail = (msg: string) => {
      setIssues([{ path: "", message: msg }]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      requestAnimationFrame(() => errorRef.current?.focus());
    };

    if (kind === "correction" && !correctionTargetId) {
      fail("Search for the record you want to correct.");
      return;
    }
    if (kind === "story" && !storyTargetId) {
      fail("Search for the person this story is about.");
      return;
    }
    if (kind === "add-relationship") {
      if (relType === "parent-child" && !relChild) {
        fail("Choose the child in this relationship.");
        return;
      }
      if (relType === "parent-child" && !father && !mother) {
        fail("Choose at least one parent.");
        return;
      }
      if (relType === "spouse" && (!relPersonA || !spouse)) {
        fail("Choose both people in the marriage.");
        return;
      }
    }

    setBusy(true);

    const sourcePayload = sources.filter((s) => s.title.trim());
    let targetId: string | undefined;
    let payload: Record<string, unknown>;

    if (kind === "story") {
      targetId = storyTargetId;
      payload = {
        epithet: epithet || undefined,
        occupations: commaList(occupations),
        residences: commaList(residences),
        bio: bio || undefined,
        confidence,
        sources: sourcePayload,
      };
    } else if (kind === "add-relationship") {
      targetId = relType === "parent-child" ? relChild?.id : relPersonA?.id;
      payload =
        relType === "parent-child"
          ? {
              fatherId: father?.id,
              fatherName: father?.name,
              motherId: mother?.id,
              motherName: mother?.name,
              confidence,
              sources: sourcePayload,
            }
          : {
              spouseId: spouse?.id,
              spouseName: spouse?.name,
              marriageYear: marriageYear ? Number(marriageYear) : undefined,
              confidence,
              sources: sourcePayload,
            };
    } else {
      // new-person and correction collect the same shape — a correction is
      // just a new-person submission layered onto an existing record.
      targetId = kind === "correction" ? correctionTargetId : undefined;
      payload = {
        given: given || undefined,
        patronymic: patronymic || undefined,
        surname: surname || undefined,
        // A correction that leaves the name fields blank must not blank out
        // the existing name — only a new person gets a computed display name.
        displayName:
          kind === "new-person"
            ? [given, patronymic, surname].filter(Boolean).join(" ")
            : undefined,
        devanagari: devanagari || undefined,
        aka: commaList(aka),
        gender: gender || undefined,
        status: living || undefined,
        birthYear: birthYear ? Number(birthYear) : undefined,
        birthNote: birthNote || undefined,
        birthPlace: birthPlace || undefined,
        deathYear: deathYear ? Number(deathYear) : undefined,
        deathPlace: deathPlace || undefined,
        gotra: gotra || undefined,
        community: community || undefined,
        math: math || undefined,
        kuladevata: kuladevata || undefined,
        mool: mool || undefined,
        veda: veda || undefined,
        sutra: sutra || undefined,
        occupations: commaList(occupations),
        residences: commaList(residences),
        epithet: epithet || undefined,
        bio: bio || undefined,
        fatherId: father?.id,
        fatherName: father?.name,
        motherId: mother?.id,
        motherName: mother?.name,
        spouseId: spouse?.id,
        spouseName: spouse?.name,
        marriageYear: marriageYear ? Number(marriageYear) : undefined,
        confidence,
        sources: sourcePayload,
      };
    }

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          targetId,
          message: message || undefined,
          payload,
          website: honeypot,
          submitter: {
            name: submitterName,
            email: email || undefined,
            relationship: relationship || undefined,
            consent,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIssues(
          data.issues ?? [
            { path: "", message: data.error ?? "Something went wrong" },
          ],
        );
        setBusy(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        // After paint, so the summary exists to receive focus.
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      setDone({ id: data.id, duplicates: data.duplicates ?? [] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setIssues([
        { path: "", message: "Could not reach the archive. Try again." },
      ]);
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };


  if (done) {
    return (
      <div className="surface rangoli-field p-10 text-center">
        <h2 className="font-display text-[2.2rem] font-medium">Thank you.</h2>
        <p className="mx-auto mt-4 max-w-md text-[1rem] leading-relaxed text-[var(--fg-soft)]">
          Your submission is in the queue as{" "}
          <code className="rounded bg-[var(--bg-inset)] px-1.5 py-0.5 text-[0.9rem]">
            {done.id}
          </code>
          . A person reads every one before it goes in, so it will not appear
          immediately — that delay is the only thing keeping the archive
          trustworthy.
        </p>

        {done.duplicates.length > 0 && (
          <div className="mx-auto mt-8 max-w-lg rounded-[var(--shape-md)] border border-[var(--color-gold)] bg-[color-mix(in_oklab,var(--color-gold)_8%,transparent)] p-4 text-left">
            <h3 className="font-display text-[1.15rem] font-medium">
              This may already be here
            </h3>
            <p className="mt-1.5 text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
              These records look close. If one of them is the same person, that
              is useful to know — the reviewer will merge rather than duplicate.
            </p>
            <ul className="mt-3 space-y-2">
              {done.duplicates.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/person/${d.id}`}
                    className="link-underline text-[0.92rem]"
                  >
                    {d.name}
                    {d.birthYear && ` (b. ${d.birthYear})`}
                  </Link>
                  <span className="ml-2 text-[0.8rem] text-[var(--fg-faint)]">
                    {d.confidence}% match
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setGiven("");
              setPatronymic("");
              setSurname("");
              setBirthYear("");
              setDeathYear("");
              setBio("");
              setEpithet("");
              setFather(null);
              setMother(null);
              setSpouse(null);
              setCorrectionTarget(null);
              setStoryTarget(null);
              setRelChild(null);
              setRelPersonA(null);
            }}
            className="btn btn-filled"
          >
            Add another person
          </button>
          <Link href="/tree" className="btn btn-outlined">
            Back to the tree
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/*
        An error summary, not a scatter of red field borders. It is a live
        region so it is announced the moment the server answers, and focus is
        moved into it so the next thing a keyboard user reads is what went
        wrong — otherwise the page silently scrolls and focus is still on a
        submit button three screens below.
      */}
      {issues.length > 0 && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-[var(--shape-md)] border-2 border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] p-4"
        >
          <h2 className="font-display text-[1.15rem] font-medium text-[var(--accent)]">
            Not sent yet — {issues.length}{" "}
            {issues.length === 1 ? "thing needs" : "things need"} fixing
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.92rem] text-[var(--fg-soft)]">
            {issues.map((i, n) => (
              <li key={n}>{i.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------------------------------------------------- Kind */}
      {!correctTarget && (
        <Section title="What are you adding?">
          <div
            role="radiogroup"
            aria-label="What are you adding?"
            className="grid gap-3 sm:grid-cols-2"
          >
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={kind === k.id}
                onClick={() => setKind(k.id)}
                className={`state-layer rounded-[var(--shape-md)] border p-4 text-left ${
                  kind === k.id
                    ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)]"
                    : "border-[var(--outline-soft)]"
                }`}
              >
                <span className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                      kind === k.id
                        ? "border-[var(--accent)]"
                        : "border-[var(--outline)]"
                    }`}
                  >
                    {kind === k.id && (
                      <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-[1.1rem] font-medium">
                      {k.title}
                    </span>
                    <span className="mt-1 block text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
                      {k.blurb}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {correctTarget && (
        <div className="rounded-[var(--shape-md)] border border-[var(--outline-soft)] bg-[var(--bg-sunken)] p-4">
          <p className="text-[0.92rem] leading-relaxed text-[var(--fg-soft)]">
            Correcting{" "}
            <Link
              href={`/person/${correctTarget.id}`}
              className="link-underline font-medium"
            >
              {correctTarget.name}
            </Link>
            . Fill in only the fields that are wrong or missing, and say what
            you know at the bottom.
          </p>
        </div>
      )}

      {/* -------------------------------------------- Which record(s) */}
      {!correctTarget && kind === "correction" && (
        <Section
          title="Which record"
          note="Search for the person whose record needs fixing."
        >
          <PersonPicker
            label="Person to correct"
            value={correctionTarget}
            onChange={setCorrectionTarget}
            autoFocus
          />
        </Section>
      )}

      {!correctTarget && kind === "story" && (
        <Section
          title="Who is this about"
          note="Search for the person already in the archive."
        >
          <PersonPicker
            label="Person"
            value={storyTarget}
            onChange={setStoryTarget}
            autoFocus
          />
        </Section>
      )}

      {kind === "add-relationship" && (
        <Section
          title="How are they linked"
          note="Search for two people already in the archive. If one of them is not here yet, add them as a separate person first."
        >
          <div
            role="radiogroup"
            aria-label="Kind of relationship"
            className="flex flex-wrap gap-2"
          >
            {(
              [
                { id: "parent-child", label: "Parent and child" },
                { id: "spouse", label: "Married couple" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={relType === opt.id}
                onClick={() => setRelType(opt.id)}
                className={`chip chip-sm ${relType === opt.id ? "chip-selected" : ""}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {relType === "parent-child" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <PersonPicker label="Father" value={father} onChange={setFather} />
              <PersonPicker label="Mother" value={mother} onChange={setMother} />
              <PersonPicker label="Child" value={relChild} onChange={setRelChild} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_10rem]">
              <PersonPicker
                label="Person"
                value={relPersonA}
                onChange={setRelPersonA}
              />
              <PersonPicker label="Married to" value={spouse} onChange={setSpouse} />
              <Field label="Year of marriage">
                {(p) => (
                  <input
                    {...p}
                    className="field"
                    inputMode="numeric"
                    value={marriageYear}
                    onChange={(e) => setMarriageYear(e.target.value)}
                  />
                )}
              </Field>
            </div>
          )}
        </Section>
      )}

      {/* ---------------------------------------------------- Names */}
      {(kind === "new-person" || kind === "correction") && (
      <Section
        title="Who"
        note="Write the name the way the family says it. Alternative spellings can go in the box below — the search treats Shreenivas and Srinivasa as the same name anyway, but recording both helps a reviewer match records."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Given name"
            required={kind === "new-person"}
            hint={
              kind === "correction"
                ? `Leave this blank unless the name itself is wrong.`
                : undefined
            }
          >
            {(p) => (
              <input
                {...p}
                className="field"
                value={given}
                onChange={(e) => setGiven(e.target.value)}
                placeholder="Narayan"
              />
            )}
          </Field>
          <Field
            label="Father's given name"
            hint="The Konkani middle name: Narayan Vasudev Kamath."
          >
            {(p) => (
              <input
                {...p}
                className="field"
                value={patronymic}
                onChange={(e) => setPatronymic(e.target.value)}
                placeholder="Vasudev"
              />
            )}
          </Field>
          <Field label="Surname">
            {(p) => (
              <input
                {...p}
                className="field"
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="Kamath"
              />
            )}
          </Field>
        </div>

        {similar.length > 0 && (
          <div
            role="status"
            className="rounded-[var(--shape-md)] border border-[var(--color-gold)] bg-[color-mix(in_oklab,var(--color-gold)_7%,transparent)] p-3.5"
          >
            <p className="text-[0.9rem] font-semibold">
              Already in the archive with a similar name
            </p>
            <ul className="mt-2 space-y-1">
              {similar.map((s) => (
                <li key={s.id} className="text-[0.88rem]">
                  <Link
                    href={`/person/${s.id}`}
                    target="_blank"
                    className="link-underline"
                  >
                    {s.name}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </Link>
                  <span className="ml-2 text-[var(--fg-faint)]">{s.detail}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[0.82rem] leading-relaxed text-[var(--fg-faint)]">
              If one of these is the same person, use <em>Correct a record</em>{" "}
              on their page instead — it keeps the archive from growing two
              versions of one ancestor.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="In Devanagari or Kannada"
            hint="Optional, and searchable."
          >
            {(p) => (
              <input
                {...p}
                className="field deva"
                value={devanagari}
                onChange={(e) => setDevanagari(e.target.value)}
                placeholder="नारायण"
                lang="kok"
              />
            )}
          </Field>
          <Field
            label="Other spellings or nicknames"
            hint="Comma separated. e.g. Naraina, Nanu"
          >
            {(p) => (
              <input
                {...p}
                className="field"
                value={aka}
                onChange={(e) => setAka(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Sex"
            value={gender}
            onChange={setGender}
            placeholder="Not recorded"
            options={[
              { value: "", label: "Not recorded" },
              { value: "M", label: "Male" },
              { value: "F", label: "Female" },
              { value: "X", label: "Other" },
            ]}
          />
          <Select
            label="Living?"
            value={living}
            onChange={setLiving}
            placeholder="Not sure"
            options={[
              { value: "", label: "Not sure" },
              { value: "living", label: "Living" },
              { value: "deceased", label: "No longer living" },
            ]}
          />
        </div>
      </Section>
      )}

      {/* --------------------------------------------- Dates & places */}
      {(kind === "new-person" || kind === "correction") && (
      <Section
        title="When and where"
        note="A year is far more useful than nothing. If you only know 'around the time of the 1918 influenza' or 'Shaka 1832', write that in the note — a reviewer can convert it."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Born (year)">
            {(p) => (
              <input
                {...p}
                className="field"
                inputMode="numeric"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="1897"
              />
            )}
          </Field>
          <Select
            label="Born at"
            value={birthPlace}
            onChange={setBirthPlace}
            placeholder="Not recorded"
            searchable
            options={[
              { value: "", label: "Not recorded" },
              ...refs.places.map((pl) => ({ value: pl.id, label: pl.label })),
            ]}
          />
          <Field label="Note on the date" hint="Tithi, nakshatra, 'c. 1890'…">
            {(p) => (
              <input
                {...p}
                className="field"
                value={birthNote}
                onChange={(e) => setBirthNote(e.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Died (year)">
            {(p) => (
              <input
                {...p}
                className="field"
                inputMode="numeric"
                value={deathYear}
                onChange={(e) => setDeathYear(e.target.value)}
              />
            )}
          </Field>
          <Select
            label="Died at"
            value={deathPlace}
            onChange={setDeathPlace}
            placeholder="Not recorded"
            searchable
            options={[
              { value: "", label: "Not recorded" },
              ...refs.places.map((pl) => ({ value: pl.id, label: pl.label })),
            ]}
          />
        </div>
      </Section>
      )}

      {/* ------------------------------------------------- Lineage */}
      {(kind === "new-person" || kind === "correction") && (
      <Section
        title="Lineage"
        note="These fields do more to reconnect scattered branches than names and dates do. If you know only one of them, it is still worth recording — and leaving one blank is always better than guessing at it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Gotra"
            value={gotra}
            onChange={setGotra}
            placeholder="Not known"
            searchable
            options={[
              { value: "", label: "Not known" },
              ...refs.gotras.map((g) => ({ value: g.id, label: g.label })),
            ]}
          />
          <Select
            label="Kuladevata"
            value={kuladevata}
            onChange={setKuladevata}
            placeholder="Not known"
            searchable
            options={[
              { value: "", label: "Not known" },
              ...refs.kuladevatas.map((k) => ({ value: k.id, label: k.label })),
            ]}
          />
          <Select
            label="Mool (ancestral village)"
            value={mool}
            onChange={setMool}
            placeholder="Not known"
            searchable
            options={[
              { value: "", label: "Not known" },
              ...refs.moolPlaces.map((pl) => ({
                value: pl.id,
                label: pl.label,
              })),
            ]}
          />
          <Select
            label="Matha"
            value={math}
            onChange={setMath}
            placeholder="Not known"
            options={[
              { value: "", label: "Not known" },
              ...refs.maths.map((m) => ({ value: m.id, label: m.label })),
            ]}
          />
          <Select
            label="Community"
            value={community}
            onChange={setCommunity}
            placeholder="Not known"
            searchable
            options={[
              { value: "", label: "Not known" },
              ...refs.communities.map((c) => ({ value: c.id, label: c.label })),
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Veda">
              {(p) => (
                <input
                  {...p}
                  className="field"
                  value={veda}
                  onChange={(e) => setVeda(e.target.value)}
                  placeholder="Rigveda"
                />
              )}
            </Field>
            <Field label="Sutra">
              {(p) => (
                <input
                  {...p}
                  className="field"
                  value={sutra}
                  onChange={(e) => setSutra(e.target.value)}
                  placeholder="Ashvalayana"
                />
              )}
            </Field>
          </div>
        </div>
      </Section>
      )}

      {/* -------------------------------------------------- Family */}
      {(kind === "new-person" || kind === "correction") && (
      <Section
        title="Family"
        note="Link to people already in the archive. If a parent is not here yet, add them as a separate submission first and mention it below — a reviewer will join them up."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonPicker label="Father" value={father} onChange={setFather} />
          <PersonPicker label="Mother" value={mother} onChange={setMother} />
          <PersonPicker label="Married to" value={spouse} onChange={setSpouse} />
          <Field label="Year of marriage">
            {(p) => (
              <input
                {...p}
                className="field"
                inputMode="numeric"
                value={marriageYear}
                onChange={(e) => setMarriageYear(e.target.value)}
              />
            )}
          </Field>
        </div>
      </Section>
      )}

      {/* ---------------------------------------------------- Life */}
      {(kind === "new-person" || kind === "correction" || kind === "story") && (
      <Section
        title="Their life"
        note="Optional, and the part people most enjoy reading."
      >
        <Field label="One line they'd be remembered by">
          {(p) => (
            <input
              {...p}
              className="field"
              value={epithet}
              onChange={(e) => setEpithet(e.target.value)}
              placeholder="kept the family ledger"
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work" hint="Comma separated.">
            {(p) => (
              <input
                {...p}
                className="field"
                value={occupations}
                onChange={(e) => setOccupations(e.target.value)}
                placeholder="schoolteacher, Konkani writer"
              />
            )}
          </Field>
          <Field label="Places they lived" hint="Comma separated, in order.">
            {(p) => (
              <input
                {...p}
                className="field"
                value={residences}
                onChange={(e) => setResidences(e.target.value)}
                placeholder="Kumta, Bombay, Pune"
              />
            )}
          </Field>
        </div>
        <Field label="Anything else worth writing down">
          {(p) => (
            <textarea
              {...p}
              className="field min-h-28"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Moved the household to Bombay after the 1918 influenza; the family's letters survive from this generation onward."
            />
          )}
        </Field>
      </Section>
      )}

      {/* -------------------------------------------------- Sources */}
      <Section
        title="How do you know?"
        note="This is the difference between an archive and a rumour. Nothing here is checked against you — it just tells the next reader how much weight to give it."
      >
        <fieldset>
          <legend className="label">How sure are you?</legend>
          <div className="space-y-2.5">
            {CONFIDENCE.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer gap-3 rounded-[var(--shape-md)] border p-3.5 transition-colors ${
                  confidence === c.id
                    ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_6%,transparent)]"
                    : "border-[var(--outline-soft)]"
                }`}
              >
                <input
                  type="radio"
                  name="confidence"
                  value={c.id}
                  checked={confidence === c.id}
                  onChange={() => setConfidence(c.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                />
                <span>
                  <span className="block text-[0.95rem] font-semibold">
                    {c.label}
                  </span>
                  <span className="mt-0.5 block text-[0.85rem] leading-relaxed text-[var(--fg-soft)]">
                    {c.note}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-3 border-t border-[var(--line)] pt-5">
          <h3 className="label">What it is based on</h3>
          {sources.map((src, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[13rem_1fr_1fr]">
              <Select
                ariaLabel={`Kind of source ${i + 1}`}
                value={src.kind}
                onChange={(value) => {
                  const next = [...sources];
                  next[i] = { ...next[i], kind: value };
                  setSources(next);
                }}
                options={SOURCE_KINDS.map((k) => ({
                  value: k.id,
                  label: k.label,
                }))}
              />
              <input
                className="field"
                placeholder="What it is"
                aria-label={`What source ${i + 1} is`}
                value={src.title}
                onChange={(e) => {
                  const next = [...sources];
                  next[i] = { ...next[i], title: e.target.value };
                  setSources(next);
                }}
              />
              <input
                className="field"
                placeholder="Who holds it, or where it is"
                aria-label={`Where source ${i + 1} is`}
                value={src.detail}
                onChange={(e) => {
                  const next = [...sources];
                  next[i] = { ...next[i], detail: e.target.value };
                  setSources(next);
                }}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setSources([...sources, { kind: "oral", title: "", detail: "" }])
            }
            className="btn btn-text btn-sm"
          >
            <span aria-hidden>+</span> Another source
          </button>
        </div>
      </Section>

      {/* ------------------------------------------------------- You */}
      <Section
        title="About you"
        note="Your name is recorded against the contribution so future readers know who to thank, and who to ask. Your email is never published."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" required>
            {(p) => (
              <input
                {...p}
                className="field"
                autoComplete="name"
                value={submitterName}
                onChange={(e) => setSubmitterName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Email" hint="Only so a reviewer can ask you a question.">
            {(p) => (
              <input
                {...p}
                className="field"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </Field>
        </div>
        <Field label="How are you related to this person?">
          {(p) => (
            <input
              {...p}
              className="field"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="his great-granddaughter"
            />
          )}
        </Field>
        <Field label="Anything the reviewer should know">
          {(p) => (
            <textarea
              {...p}
              className="field min-h-24"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="The dates come from a horoscope my grandmother kept; the village name is my own reading of a land document and may be wrong."
            />
          )}
        </Field>

        {/* Honeypot — hidden from people, irresistible to bots. */}
        <div className="hidden" aria-hidden>
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </label>
        </div>

        <label className="flex cursor-pointer gap-3 rounded-[var(--shape-md)] border border-[var(--outline-soft)] p-3.5">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            aria-required="true"
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
            I understand this archive is public, and everything I submit here
            can be read by anyone. I am not submitting the personal details of a
            living person without their agreement, and I have not included
            addresses, phone numbers or anything else that is nobody
            else&rsquo;s business.
            <span aria-hidden className="text-[var(--accent)]">
              {" "}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </span>
        </label>
      </Section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t border-[var(--line)] bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] px-1 py-4 backdrop-blur">
        <button
          type="submit"
          disabled={busy}
          className="btn btn-filled btn-lg"
          aria-busy={busy}
        >
          {busy ? "Sending…" : "Send to the archive"}
        </button>
        <p className="text-[0.85rem] text-[var(--fg-faint)]">
          Reviewed by a person before it appears. Nothing is published
          automatically.
        </p>
      </div>
    </form>
  );
}
