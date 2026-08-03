"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { PersonPicker, type PickedPerson } from "../PersonPicker";
import { Select } from "../ui/Select";
import type { ContributeRefs } from "../ContributeForm";

/**
 * The maintainer's editor.
 *
 * Not a variant of the contribute form, on purpose. The contribute form asks a
 * stranger what they remember and is written to be forgiving; this asks
 * somebody who already knows the archive's vocabulary to state a record, and
 * every reference field is a controlled list rather than free text. The other
 * difference matters more: a field cleared here means "retract this", and it
 * is saved as absent. On the contribute side a blank field means "I do not
 * know", and is ignored.
 */

export interface EditorPerson {
  id?: string;
  given: string;
  patronymic: string;
  surname: string;
  display: string;
  devanagari: string;
  kannada: string;
  aka: string;
  gender: string;
  status: string;

  birthYear: string;
  birthRaw: string;
  birthQualifier: string;
  birthPlace: string;
  /**
   * A place written as free text because it is not in the reference list —
   * what a contributor typed, or an older record predating the vocabulary.
   * Carried here so that opening a record and saving it does not quietly
   * discard a place the dropdown has no id for.
   */
  birthPlaceLabel: string;

  deathYear: string;
  deathRaw: string;
  deathPlace: string;
  deathPlaceLabel: string;
  deathNote: string;

  gotra: string;
  community: string;
  math: string;
  kuladevata: string;
  mool: string;
  veda: string;
  sutra: string;

  /** Either a reference id, or a free-text label for a place not in the list. */
  residences: { id: string; label: string }[];
  occupations: string;
  epithet: string;
  bio: string;
  notes: string;

  father: PickedPerson | null;
  mother: PickedPerson | null;
  spouses: { person: PickedPerson; status: string; year: string }[];
  parentage: string;

  photoUrl: string;
  photoCaption: string;

  confidence: string;
  contributedBy: string;
}

export const EMPTY_PERSON: EditorPerson = {
  given: "",
  patronymic: "",
  surname: "",
  display: "",
  devanagari: "",
  kannada: "",
  aka: "",
  gender: "?",
  status: "unknown",
  birthYear: "",
  birthRaw: "",
  birthQualifier: "",
  birthPlace: "",
  birthPlaceLabel: "",
  deathYear: "",
  deathRaw: "",
  deathPlace: "",
  deathPlaceLabel: "",
  deathNote: "",
  gotra: "",
  community: "",
  math: "",
  kuladevata: "",
  mool: "",
  veda: "",
  sutra: "",
  residences: [],
  occupations: "",
  epithet: "",
  bio: "",
  notes: "",
  father: null,
  mother: null,
  spouses: [],
  parentage: "",
  photoUrl: "",
  photoCaption: "",
  confidence: "unverified",
  contributedBy: "",
};

const GENDERS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "X", label: "Other" },
  { value: "?", label: "Not recorded" },
];

const STATUSES = [
  { value: "unknown", label: "Not recorded" },
  { value: "living", label: "Living" },
  { value: "deceased", label: "Deceased" },
];

const QUALIFIERS = [
  { value: "", label: "Exact or unstated" },
  { value: "circa", label: "Circa — about that year" },
  { value: "before", label: "Before that year" },
  { value: "after", label: "After that year" },
];

const CONFIDENCE = [
  { value: "verified", label: "Documented", detail: "A register, certificate, gazette or horoscope" },
  { value: "attested", label: "Corroborated", detail: "More than one family member agrees" },
  { value: "oral", label: "Family memory", detail: "A single oral account" },
  { value: "unverified", label: "Unverified", detail: "Recorded but not corroborated" },
];

const SPOUSE_STATUS = [
  { value: "married", label: "Married" },
  { value: "widowed", label: "Widowed" },
  { value: "separated", label: "Separated" },
  { value: "unknown", label: "Not recorded" },
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
      <h2 className="font-display text-[1.35rem] font-medium">{title}</h2>
      {note && (
        <p className="mt-1.5 text-[0.9rem] leading-relaxed text-[var(--fg-soft)]">
          {note}
        </p>
      )}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
  lang,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  lang?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        className="field mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        lang={lang}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className="hint mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}

function Area({
  label,
  value,
  onChange,
  rows = 4,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  hint?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className="field mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={hint ? hintId : undefined}
      />
      {hint && (
        <p id={hintId} className="hint mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Shown when a place is recorded as free text rather than as a reference id.
 *
 * The dropdown cannot represent one, so without this the maintainer would see
 * an empty "Not recorded" select over a record that does say where the person
 * died — and saving would agree with the select and wipe it. Saying so, and
 * offering the two ways out, is the whole job: pick the matching place from
 * the list, or clear it deliberately.
 */
function FreeTextPlace({
  label,
  chosen,
  onClear,
}: {
  label: string;
  /** A chosen reference id; when set, the label is already superseded. */
  chosen: string;
  onClear?: () => void;
}) {
  if (!label.trim() || chosen) return null;
  return (
    <p className="hint mt-1.5 flex flex-wrap items-center gap-x-2">
      <span>
        Recorded as &ldquo;{label}&rdquo; — free text, not matched to the place
        list. Kept as it is unless you choose one above.
      </span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="link-underline font-medium"
        >
          Clear it
        </button>
      )}
    </p>
  );
}

/** Turn the form's flat strings back into the shape the API validates. */
function toPayload(f: EditorPerson) {
  const list = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);
  const year = (s: string) => (s.trim() ? Number(s) : undefined);
  const blank = (s: string) => (s.trim() ? s.trim() : undefined);

  const birthDate = {
    year: year(f.birthYear),
    raw: blank(f.birthRaw),
    qualifier: f.birthQualifier || undefined,
  };
  const deathDate = { year: year(f.deathYear), raw: blank(f.deathRaw) };

  // An id chosen from the list wins; otherwise a free-text label is kept as
  // it stands. Dropping the label because the dropdown had nothing to match
  // it against would delete a real fact for a bookkeeping reason.
  const placeRef = (id: string, label: string) =>
    id ? { id } : blank(label) ? { label: label.trim() } : undefined;

  const birthPlace = placeRef(f.birthPlace, f.birthPlaceLabel);
  const deathPlace = placeRef(f.deathPlace, f.deathPlaceLabel);

  const hasBirth = birthDate.year || birthDate.raw || birthPlace;
  const hasDeath = deathDate.year || deathDate.raw || deathPlace || f.deathNote;

  return {
    name: {
      given: f.given.trim(),
      surname: blank(f.surname),
      patronymic: blank(f.patronymic),
      display: blank(f.display),
      devanagari: blank(f.devanagari),
      kannada: blank(f.kannada),
      aka: list(f.aka).length ? list(f.aka) : undefined,
    },
    gender: f.gender,
    status: f.status || undefined,

    birth: hasBirth
      ? {
          date: birthDate.year || birthDate.raw ? birthDate : undefined,
          place: birthPlace,
        }
      : undefined,
    death: hasDeath
      ? {
          date: deathDate.year || deathDate.raw ? deathDate : undefined,
          place: deathPlace,
          note: blank(f.deathNote),
        }
      : undefined,

    gotra: blank(f.gotra),
    community: blank(f.community),
    math: blank(f.math),
    kuladevata: blank(f.kuladevata),
    mool: blank(f.mool),
    veda: blank(f.veda),
    sutra: blank(f.sutra),

    residences: (() => {
      const kept = f.residences
        .map((r) => placeRef(r.id, r.label))
        .filter((r): r is NonNullable<typeof r> => !!r);
      return kept.length ? kept : undefined;
    })(),
    occupations: list(f.occupations).length ? list(f.occupations) : undefined,
    epithet: blank(f.epithet),
    bio: blank(f.bio),
    notes: blank(f.notes),

    fatherId: f.father?.id,
    motherId: f.mother?.id,
    spouses: f.spouses.length
      ? f.spouses.map((s) => ({
          personId: s.person.id,
          status: s.status || undefined,
          date: s.year.trim() ? { year: Number(s.year) } : undefined,
        }))
      : undefined,
    parentage: blank(f.parentage),

    photo: f.photoUrl.trim()
      ? { url: f.photoUrl.trim(), caption: blank(f.photoCaption) }
      : undefined,

    confidence: f.confidence,
    contributedBy: blank(f.contributedBy),
  };
}

export function PersonEditor({
  refs,
  initial,
  personId,
}: {
  refs: ContributeRefs;
  initial: EditorPerson;
  /** Present when editing; absent when creating. */
  personId?: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<EditorPerson>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ path: string; message: string }[]>([]);
  // Every field on this form writes straight to disk on save, and there is
  // no autosave and no draft — so a record with a dozen fields filled in that
  // gets lost to a stray click is gone, not recoverable. `dirty` is the flag
  // that stands between "edited" and "actually saved".
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof EditorPerson>(key: K, value: EditorPerson[K]) => {
    setDirty(true);
    setF((prev) => ({ ...prev, [key]: value }));
  };

  // Covers closing the tab, reloading, or typing a new address — the ways of
  // leaving this page that a client-side route change cannot intercept.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const leaveIfConfirmed = () => {
    if (!dirty || window.confirm("Discard the changes you made to this record?")) {
      router.push("/admin/people");
    }
  };

  const options = (items: { id: string; label: string }[], empty: string) => [
    { value: "", label: empty },
    ...items.map((i) => ({ value: i.id, label: i.label })),
  ];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setIssues([]);

    try {
      const res = await fetch(
        personId
          ? `/api/admin/people/${encodeURIComponent(personId)}`
          : "/api/admin/people",
        {
          method: personId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(f)),
        },
      );
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace("/admin/login?next=/admin/people");
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "That did not save");
        setIssues(data.issues ?? []);
        return;
      }

      setDirty(false);
      router.push("/admin/people");
      router.refresh();
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <Section
        title="Name"
        note="The display name is what cards and the tree show. Left blank, it is built from the given name and surname."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Given name" value={f.given} onChange={(v) => set("given", v)} required placeholder="Narayan" />
          <Text label="Patronymic" value={f.patronymic} onChange={(v) => set("patronymic", v)} placeholder="Vasudev" hint="The father's given name, used as a middle name" />
          <Text label="Surname" value={f.surname} onChange={(v) => set("surname", v)} placeholder="Kamath" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Display name" value={f.display} onChange={(v) => set("display", v)} placeholder="Narayan Vasudev Kamath" />
          <Text label="Also known as" value={f.aka} onChange={(v) => set("aka", v)} hint="Nicknames and other spellings, separated by commas" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Devanagari" value={f.devanagari} onChange={(v) => set("devanagari", v)} lang="kok" placeholder="नारायण कामत" />
          <Text label="Kannada" value={f.kannada} onChange={(v) => set("kannada", v)} lang="kn" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Gender" value={f.gender} onChange={(v) => set("gender", v)} options={GENDERS} />
          <Select label="Life status" value={f.status} onChange={(v) => set("status", v)} options={STATUSES} />
        </div>
      </Section>

      <Section title="Dates and places">
        <div className="grid gap-4 sm:grid-cols-3">
          <Text label="Born in" value={f.birthYear} onChange={(v) => set("birthYear", v)} placeholder="1897" />
          <Select label="How exact" value={f.birthQualifier} onChange={(v) => set("birthQualifier", v)} options={QUALIFIERS} />
          <div>
            <Select label="Born at" value={f.birthPlace} onChange={(v) => set("birthPlace", v)} allowCustom options={options(refs.places, "Not recorded")} />
            <FreeTextPlace
              label={f.birthPlaceLabel}
              chosen={f.birthPlace}
              onClear={() => set("birthPlaceLabel", "")}
            />
          </div>
        </div>
        <Text label="Note on the birth date" value={f.birthRaw} onChange={(v) => set("birthRaw", v)} hint="Tithi, nakshatra, samvatsara, or the date as the family words it" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Died in" value={f.deathYear} onChange={(v) => set("deathYear", v)} placeholder="1968" />
          <div>
            <Select label="Died at" value={f.deathPlace} onChange={(v) => set("deathPlace", v)} allowCustom options={options(refs.places, "Not recorded")} />
            <FreeTextPlace
              label={f.deathPlaceLabel}
              chosen={f.deathPlace}
              onClear={() => set("deathPlaceLabel", "")}
            />
          </div>
        </div>
        <Text label="Note on the death" value={f.deathNote} onChange={(v) => set("deathNote", v)} />

        <div>
          <span className="label">Lived at</span>
          <p className="hint mt-1">
            In order, earliest first. This is what draws the diaspora map.
          </p>
          <div className="mt-2 space-y-2">
            {f.residences.map((place, i) => (
              <div key={i}>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Select
                      ariaLabel={`Residence ${i + 1}`}
                      value={place.id}
                      onChange={(v) =>
                        set(
                          "residences",
                          // Choosing from the list supersedes whatever free
                          // text was standing in for it.
                          f.residences.map((r, j) =>
                            j === i ? { id: v, label: v ? "" : r.label } : r,
                          ),
                        )
                      }
                      allowCustom
                      options={options(refs.places, "Choose a place")}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-text btn-sm"
                    onClick={() =>
                      set("residences", f.residences.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
                <FreeTextPlace label={place.label} chosen={place.id} />
              </div>
            ))}
            <button
              type="button"
              className="btn btn-outlined btn-sm"
              onClick={() =>
                set("residences", [...f.residences, { id: "", label: "" }])
              }
            >
              Add a place
            </button>
          </div>
        </div>
      </Section>

      <Section
        title="Lineage"
        note="Every one of these is a reference entry rather than free text, which is what keeps the directory from splitting one gotra across four spellings. Anything not on a list can still be typed into it — it is recorded against this person straight away and queued on the vocabulary screen for the details only you can fill in."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Gotra" value={f.gotra} onChange={(v) => set("gotra", v)} allowCustom options={options(refs.gotras, "Not recorded")} />
          <Select label="Community" value={f.community} onChange={(v) => set("community", v)} allowCustom options={options(refs.communities, "Not recorded")} />
          <Select label="Math" value={f.math} onChange={(v) => set("math", v)} allowCustom options={options(refs.maths, "Not recorded")} />
          <Select label="Kuladevata" value={f.kuladevata} onChange={(v) => set("kuladevata", v)} allowCustom options={options(refs.kuladevatas, "Not recorded")} />
          <Select label="Mool — ancestral village" value={f.mool} onChange={(v) => set("mool", v)} allowCustom options={options(refs.moolPlaces, "Not recorded")} />
          <Text label="Veda" value={f.veda} onChange={(v) => set("veda", v)} placeholder="Shukla Yajurveda" />
          <Text label="Sutra" value={f.sutra} onChange={(v) => set("sutra", v)} placeholder="Ashvalayana" />
        </div>
      </Section>

      <Section
        title="Family"
        note="Search by name — the picker writes the id. A parent added here appears on both records, because the tree is derived from parentage rather than authored."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <PersonPicker label="Father" value={f.father} onChange={(p) => set("father", p)} />
          <PersonPicker label="Mother" value={f.mother} onChange={(p) => set("mother", p)} />
        </div>

        <Select
          label="Relationship to those parents"
          value={f.parentage}
          onChange={(v) => set("parentage", v)}
          options={[
            { value: "", label: "Biological — the default" },
            { value: "adopted", label: "Adopted" },
            { value: "step", label: "Step" },
            { value: "unknown", label: "Not recorded" },
          ]}
        />

        <div>
          <span className="label">Marriages</span>
          <div className="mt-2 space-y-3">
            {f.spouses.map((s, i) => (
              <div
                key={`${s.person.id}-${i}`}
                className="rounded-[var(--shape-md)] bg-[var(--bg-sunken)] p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{s.person.name}</span>
                  <button
                    type="button"
                    className="btn btn-text btn-sm"
                    onClick={() =>
                      set("spouses", f.spouses.filter((_, j) => j !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                  <Select
                    ariaLabel={`Marriage status with ${s.person.name}`}
                    value={s.status}
                    onChange={(v) =>
                      set(
                        "spouses",
                        f.spouses.map((x, j) => (j === i ? { ...x, status: v } : x)),
                      )
                    }
                    options={SPOUSE_STATUS}
                  />
                  <input
                    className="field"
                    aria-label={`Year of marriage to ${s.person.name}`}
                    placeholder="Year of marriage"
                    inputMode="numeric"
                    value={s.year}
                    onChange={(e) =>
                      set(
                        "spouses",
                        f.spouses.map((x, j) =>
                          j === i ? { ...x, year: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <PersonPicker
              label="Add a marriage"
              value={null}
              onChange={(p) => {
                if (!p) return;
                if (p.id === personId) return;
                if (f.spouses.some((s) => s.person.id === p.id)) return;
                set("spouses", [
                  ...f.spouses,
                  { person: p, status: "married", year: "" },
                ]);
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="Life">
        <Text label="Known for" value={f.epithet} onChange={(v) => set("epithet", v)} hint="One line, shown under the name on the expanded card" />
        <Text label="Occupations" value={f.occupations} onChange={(v) => set("occupations", v)} hint="Separated by commas" />
        <Area label="Biography" value={f.bio} onChange={(v) => set("bio", v)} rows={6} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Photograph URL" value={f.photoUrl} onChange={(v) => set("photoUrl", v)} />
          <Text label="Photograph caption" value={f.photoCaption} onChange={(v) => set("photoCaption", v)} />
        </div>
      </Section>

      <Section
        title="Provenance"
        note="How much weight a reader should give this record. It is shown on the card, and it is the difference between an archive and folklore."
      >
        <Select
          label="Confidence"
          value={f.confidence}
          onChange={(v) => set("confidence", v)}
          options={CONFIDENCE.map((c) => ({
            value: c.value,
            label: c.label,
            detail: c.detail,
          }))}
        />
        <Text label="Credited to" value={f.contributedBy} onChange={(v) => set("contributedBy", v)} hint="Whoever supplied this. Left blank, it is credited to the maintainer." />
        <Area label="Private notes" value={f.notes} onChange={(v) => set("notes", v)} rows={3} hint="Kept on the record for other maintainers." />
      </Section>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="text-[0.95rem] text-[var(--accent)]">
            {error}
          </p>
        )}
        {issues.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-[0.9rem] text-[var(--accent)]">
            {issues.map((i) => (
              <li key={i.path}>
                {i.path}: {i.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-filled" disabled={busy}>
          {busy ? "Saving…" : personId ? "Save changes" : "Add the record"}
        </button>
        <button type="button" className="btn btn-text" onClick={leaveIfConfirmed}>
          Cancel
        </button>
        {personId && (
          <Link
            href={`/person/${personId}`}
            className="btn btn-text ml-auto"
            target="_blank"
          >
            View on the site
          </Link>
        )}
      </div>
    </form>
  );
}
