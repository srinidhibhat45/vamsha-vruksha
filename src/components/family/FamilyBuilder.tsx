"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FamilyCanvas, type CanvasActions } from "./FamilyCanvas";
import { DraftPersonForm } from "./DraftPersonForm";
import { PersonPicker, type PickedPerson } from "../PersonPicker";
import {
  checkDraft,
  conventionalName,
  describeDraft,
  displayOf,
  nameIsInherited,
} from "@/lib/family";
import type { ContributeRefs } from "../ContributeForm";
import type { DraftPerson, FamilyDraft, SpouseLink } from "@/lib/types";

/**
 * One marriage, seen from either side.
 *
 * A marriage is stored on one row only — whichever the contributor happened to
 * press "+ Marriage" from. Reading it from that row alone meant the wife's own
 * panel listed no husband, offered no way to correct the year, and answered
 * "add a child" by inventing a child with no father. `ownerKey` is which row
 * holds it, so an edit made from either side writes to the one place it lives.
 */
export interface DraftMarriage {
  ownerKey: string;
  /**
   * The key inside `ownerKey`'s spouseKeys — which is the *other* person from
   * the owner's point of view, and therefore not always the partner shown
   * here. Read from the wife's panel of a marriage her husband's row holds,
   * `partner` is the husband and this is the wife: matching on `partner` there
   * looks for the husband inside his own list of spouses, finds nothing, and
   * silently drops every edit made from her side.
   */
  linkKey: string;
  partner: DraftPerson;
  year?: number;
  endYear?: number;
  status?: SpouseLink["status"];
}

/**
 * Entering a whole family at once.
 *
 * The unit of work here is the branch, not the person, because that is the
 * unit families actually remember in. Somebody sitting down with a
 * grandmother does not learn one name — they learn a couple, their seven
 * children, who each married and which of them went to Bombay, all in one
 * afternoon. Thirty separate submissions of that is thirty forms, each one
 * unable to name a parent who has not been published yet, and a reviewer at
 * the far end reading names with no way to see the shape they make.
 *
 * Three decisions shape everything below.
 *
 * **The drawing is the workspace, not an illustration of it.** People are
 * selected on the tree, relatives are added from the card they belong to, and
 * the form for whoever is selected sits beside it rather than under it. The
 * earlier arrangement — a static picture on top, a long form below — meant the
 * contributor was always editing one person while looking at a drawing of
 * somebody else, and scrolled past the family to reach the field they wanted.
 *
 * **Relationships are added from a person, not filled into a field.** The
 * buttons say "father", "child", "marriage", so the relationship is stated by
 * the act of creating the row and cannot be dangling or half-entered. A field
 * asking for a father id would need the father to exist first, which is
 * exactly the ordering problem the draft exists to abolish.
 *
 * **A row can be somebody already in the archive.** The branch almost always
 * hangs off a person who is already recorded, and that row is *linked* rather
 * than retyped. It is the same mechanism as the duplicate suggestions and the
 * reason both exist: everything else here is in service of not ending up with
 * two copies of one ancestor.
 */

/** Keys only have to be unique within a draft, and readable in a payload. */
let keySeed = 0;
function newKey(): string {
  keySeed += 1;
  return `p${Date.now().toString(36).slice(-4)}${keySeed}`;
}

function blankPerson(overrides: Partial<DraftPerson> = {}): DraftPerson {
  return { key: newKey(), given: "", confidence: "oral", ...overrides };
}

/** Split a typed name the way the picker's "add them" row hands it over. */
function splitName(typed: string): Partial<DraftPerson> {
  const parts = typed.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { given: parts[0] ?? "" };
  return {
    given: parts[0],
    patronymic: parts.length >= 3 ? parts[1] : undefined,
    surname: parts[parts.length - 1],
  };
}

export interface FamilyBuilderProps {
  refs: ContributeRefs;
  people: DraftPerson[];
  onChange: (people: DraftPerson[]) => void;
  /** Maintainers write straight to the archive; contributors do not. */
  variant?: "contribute" | "admin";
}

export function FamilyBuilder({
  refs,
  people,
  onChange,
  variant = "contribute",
}: FamilyBuilderProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    people[0]?.key ?? null,
  );

  const selected = people.find((p) => p.key === selectedKey) ?? null;
  const draft: FamilyDraft = useMemo(() => ({ people }), [people]);

  const problems = useMemo(() => checkDraft(draft), [draft]);
  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");
  const errorKeys = useMemo(
    () =>
      new Set(
        errors.map((e) => e.key).filter((k): k is string => typeof k === "string"),
      ),
    [errors],
  );

  const labelFor = useMemo(() => {
    const maps = {
      gotra: new Map(refs.gotras.map((g) => [g.id, g.label])),
      mool: new Map(refs.moolPlaces.map((p) => [p.id, p.label])),
      kuladevata: new Map(refs.kuladevatas.map((k) => [k.id, k.label])),
    };
    return (kind: "gotra" | "mool" | "kuladevata", id: string) =>
      maps[kind].get(id);
  }, [refs]);

  /* --------------------------------------------------------------- */
  /* Mutations, with one step of undo behind them                     */
  /* --------------------------------------------------------------- */

  /*
    A builder without an undo is a builder people are frightened of. The
    riskiest press on this screen is "remove", and the second riskiest is a
    mis-aimed "add" that puts a stranger in the middle of a family — both are
    one keystroke to reverse here rather than a rebuild.
  */
  const history = useRef<DraftPerson[][]>([]);
  const [depth, setDepth] = useState(0);

  const commit = useCallback(
    (next: DraftPerson[]) => {
      history.current.push(people);
      if (history.current.length > 50) history.current.shift();
      setDepth(history.current.length);
      onChange(next);
    },
    [people, onChange],
  );

  const undo = useCallback(() => {
    const previous = history.current.pop();
    setDepth(history.current.length);
    if (!previous) return;
    onChange(previous);
    setSelectedKey((key) =>
      key && previous.some((p) => p.key === key) ? key : (previous[0]?.key ?? null),
    );
  }, [onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      // Inside a text field, undo belongs to the field.
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        el?.isContentEditable ||
        !history.current.length
      ) {
        return;
      }
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const update = (key: string, changes: Partial<DraftPerson>) => {
    // Typing is not an undo step of its own — otherwise one press of undo
    // deletes a letter and the contributor loses the button's meaning.
    onChange(people.map((p) => (p.key === key ? { ...p, ...changes } : p)));
  };

  const add = (
    person: DraftPerson,
    extra?: (people: DraftPerson[]) => DraftPerson[],
  ) => {
    const next = extra ? extra([...people, person]) : [...people, person];
    commit(next);
    setSelectedKey(person.key);
  };

  /**
   * Removing a person has to repair what pointed at them. A dangling
   * fatherKey does not merely lose a link — the draft fails its coherence
   * check on publish with an error about a row the contributor has already
   * deleted and cannot find.
   */
  const remove = (key: string) => {
    const next = people
      .filter((p) => p.key !== key)
      .map((p) => ({
        ...p,
        fatherKey: p.fatherKey === key ? undefined : p.fatherKey,
        motherKey: p.motherKey === key ? undefined : p.motherKey,
        spouseKeys: p.spouseKeys?.filter((s) => s.key !== key),
      }));
    commit(next);
    if (selectedKey === key) setSelectedKey(next[0]?.key ?? null);
  };

  const addFirst = (seed: Partial<DraftPerson> = {}) => add(blankPerson(seed));

  /** Every marriage this person is in, oldest first, from whichever row holds it. */
  const marriagesOf = useCallback(
    (person: DraftPerson): DraftMarriage[] => {
      const out: DraftMarriage[] = [];
      for (const s of person.spouseKeys ?? []) {
        const partner = people.find((p) => p.key === s.key);
        if (partner && !out.some((m) => m.partner.key === partner.key)) {
          out.push({
            ownerKey: person.key,
            linkKey: partner.key,
            partner,
            year: s.year,
            endYear: s.endYear,
            status: s.status,
          });
        }
      }
      for (const q of people) {
        if (q.key === person.key) continue;
        for (const s of q.spouseKeys ?? []) {
          if (s.key !== person.key) continue;
          if (out.some((m) => m.partner.key === q.key)) continue;
          out.push({
            ownerKey: q.key,
            linkKey: person.key,
            partner: q,
            year: s.year,
            endYear: s.endYear,
            status: s.status,
          });
        }
      }
      // Oldest first, so "1st" and "2nd" mean the same thing here as on the
      // drawing and in the published tree.
      return out.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
    },
    [people],
  );

  const addParent = (childKey: string, role: "father" | "mother") => {
    const child = people.find((p) => p.key === childKey);
    if (!child) return;

    /*
      A child's middle name is their father's given name, so it usually says
      what to call him before anybody types it. Usually — but a *married
      woman* carries her husband's given name there, not her father's, so
      reading it as her father's name fills the father's card in with her
      husband's name. Only prefill from a patronymic that is still a
      patronymic.
    */
    const marriedWoman = child.gender === "F" && marriagesOf(child).length > 0;
    const fromPatronymic =
      role === "father" && !marriedWoman ? (child.patronymic ?? "") : "";

    const parent = blankPerson({
      gender: role === "father" ? "M" : "F",
      // The lineage fields descend down the male line, so a father's gotra,
      // mool and kuladevata are almost always the child's. Carried across as
      // a starting point that can be corrected, not as a claim.
      gotra: child.gotra,
      mool: child.mool,
      kuladevata: child.kuladevata,
      math: child.math,
      community: child.community,
      surname: role === "father" && !marriedWoman ? child.surname : undefined,
      given: fromPatronymic,
    });

    add(parent, (list) =>
      list.map((p) =>
        p.key === child.key
          ? { ...p, [role === "father" ? "fatherKey" : "motherKey"]: parent.key }
          : p,
      ),
    );
  };

  const addSpouse = (personKey: string) => {
    const person = people.find((p) => p.key === personKey);
    if (!person) return;
    const gender =
      person.gender === "M" ? "F" : person.gender === "F" ? "M" : "?";

    // A wife takes her husband's given name as her middle name and his
    // surname — nothing can be lost here, the row is brand new.
    const takesHisName = gender === "F" && person.gender === "M";
    const spouse = blankPerson({
      gender,
      community: person.community,
      ...(takesHisName ? conventionalName(person) : {}),
    });

    add(spouse, (list) =>
      list.map((p) =>
        p.key === person.key
          ? { ...p, spouseKeys: [...(p.spouseKeys ?? []), { key: spouse.key }] }
          : p,
      ),
    );
  };

  /**
   * Put somebody's name onto the convention's other side — her husband's, or
   * her father's again.
   *
   * An undo step of its own, because it rewrites two fields at once and the
   * contributor should be able to take it straight back if the family in
   * front of them did not follow the convention.
   */
  const useNameOf = (personKey: string, sourceKey: string) => {
    const source = people.find((p) => p.key === sourceKey);
    const next = conventionalName(source);
    if (!next.patronymic && !next.surname) return;
    commit(
      people.map((p) =>
        p.key === personKey
          ? { ...p, patronymic: next.patronymic, surname: next.surname }
          : p,
      ),
    );
  };

  const updateMarriage = (
    ownerKey: string,
    linkKey: string,
    changes: Partial<Omit<DraftMarriage, "ownerKey" | "linkKey" | "partner">>,
  ) => {
    onChange(
      people.map((p) =>
        p.key === ownerKey
          ? {
              ...p,
              spouseKeys: (p.spouseKeys ?? []).map((s) =>
                s.key === linkKey ? { ...s, ...changes } : s,
              ),
            }
          : p,
      ),
    );
  };

  /** Unmarry two people without removing either of them from the draft. */
  const removeMarriage = (ownerKey: string, linkKey: string) => {
    commit(
      people.map((p) =>
        p.key === ownerKey
          ? {
              ...p,
              spouseKeys: (p.spouseKeys ?? []).filter((s) => s.key !== linkKey),
            }
          : p,
      ),
    );
  };

  /**
   * A child belongs to a couple, so this takes the couple rather than one
   * parent. Half-siblings drawn as full siblings is the error this archive
   * most wants to avoid, and it starts here — with a child quietly attached
   * to whichever marriage happened to be first in the list.
   */
  const addChildOf = (partnerKeys: string[]) => {
    const members = partnerKeys
      .map((k) => people.find((p) => p.key === k))
      .filter((p): p is DraftPerson => !!p);
    if (!members.length) return;

    let father = members.find((m) => m.gender === "M");
    let mother = members.find((m) => m.gender === "F");
    // Whoever is left goes into the empty slot in the draft's own order, so
    // the same couple produces the same result whichever of the two the
    // contributor happened to be looking at when they pressed the button.
    const rest = members
      .filter((m) => m !== father && m !== mother)
      .sort((a, b) => people.indexOf(a) - people.indexOf(b));
    if (!father) father = rest.shift();
    if (!mother) mother = rest.shift();

    /*
      The child's middle name is its father's given name — but only when we
      actually know which of the two the father is. With neither sex recorded
      the slots above are filled in an order that is stable rather than
      informed, and copying a name out of a coin toss puts a woman's given
      name in as a patronymic and reads, on the card, as a fact. Left blank
      instead, and checkDraft says so.
    */
    const knownFather = father?.gender === "M" ? father : undefined;
    const source = knownFather ?? father ?? mother!;

    add(
      blankPerson({
        fatherKey: father?.key,
        motherKey: mother?.key,
        surname: source.surname,
        gotra: source.gotra,
        mool: source.mool,
        kuladevata: source.kuladevata,
        math: source.math,
        community: source.community ?? mother?.community,
        patronymic: knownFather?.given || undefined,
      }),
    );
  };

  /**
   * A child of whoever is selected.
   *
   * With one marriage it belongs to that marriage. With two it cannot be
   * guessed, and guessing is the error this archive most wants to avoid — so
   * the panel offers a button per marriage instead, and this generic one is
   * only ever reached by somebody with no marriage recorded at all, where a
   * single-parent child is what they mean.
   */
  const addChild = (personKey: string) => {
    const person = people.find((p) => p.key === personKey);
    if (!person) return;
    const marriages = marriagesOf(person);
    addChildOf(
      marriages.length === 1
        ? [person.key, marriages[0].partner.key]
        : [person.key],
    );
  };

  const addChildOfMarriage = (personKey: string, partnerKey: string) =>
    addChildOf([personKey, partnerKey]);

  const addSibling = (personKey: string) => {
    const person = people.find((p) => p.key === personKey);
    if (!person) return;
    add(
      blankPerson({
        fatherKey: person.fatherKey,
        motherKey: person.motherKey,
        surname: person.surname,
        gotra: person.gotra,
        mool: person.mool,
        kuladevata: person.kuladevata,
        math: person.math,
        community: person.community,
        patronymic: person.patronymic,
      }),
    );
  };

  /** Bring somebody already in the archive into the draft as a row. */
  const addExisting = (picked: PickedPerson) => {
    const already = people.find((p) => p.existingId === picked.id);
    if (already) {
      setSelectedKey(already.key);
      return;
    }
    add(blankPerson({ ...splitName(picked.name), existingId: picked.id }));
  };

  const relatives = (person: DraftPerson) => {
    const father = people.find((p) => p.key === person.fatherKey);
    const mother = people.find((p) => p.key === person.motherKey);
    // Read from both rows: a marriage entered from the husband's card is the
    // wife's marriage too, and her panel used to show none.
    const spouses = marriagesOf(person).map((m) => m.partner);
    const children = people.filter(
      (p) => p.fatherKey === person.key || p.motherKey === person.key,
    );
    const siblings =
      person.fatherKey || person.motherKey
        ? people.filter(
            (p) =>
              p.key !== person.key &&
              ((person.fatherKey && p.fatherKey === person.fatherKey) ||
                (person.motherKey && p.motherKey === person.motherKey)),
          )
        : [];
    return { father, mother, spouses, children, siblings };
  };

  const actions: CanvasActions = {
    onAddParent: addParent,
    onAddSpouse: addSpouse,
    onAddChild: addChild,
    onAddChildOf: addChildOf,
    onAddSibling: addSibling,
  };

  /* --------------------------------------------------------------- */
  /* Nothing entered yet                                              */
  /* --------------------------------------------------------------- */

  if (!people.length) {
    return (
      <section className="surface p-6">
        <h2 className="font-display text-[1.5rem] font-medium">
          Start with one person
        </h2>
        <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-[var(--fg-soft)]">
          Usually the oldest ancestor you can name, or yourself — it does not
          matter which, because you can add parents upward and children
          downward from anybody. The family is drawn as you go, and nothing is
          sent until you say so.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => addFirst()}
            className="state-layer rounded-[var(--shape-md)] border border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_7%,transparent)] p-5 text-left"
          >
            <span className="block font-display text-[1.15rem] font-medium">
              Start from a blank person
            </span>
            <span className="mt-1 block text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
              Type their name, then build the rest of the family around them.
            </span>
          </button>

          <div className="rounded-[var(--shape-md)] border border-[var(--outline-soft)] p-5">
            <PersonPicker
              label="Start from somebody already in the archive"
              value={null}
              onChange={(p) => p && addExisting(p)}
              onCreateNew={(typed) => addFirst(splitName(typed))}
              createLabel="Start a new person"
              placeholder="Search the archive…"
              hint="Their branch will attach to the record that is already here."
            />
          </div>
        </div>
      </section>
    );
  }

  /* --------------------------------------------------------------- */

  const newRecords = people.filter((p) => !p.existingId).length;

  return (
    <div className="space-y-3">
      {/* --------------------------------------------------- Toolbar */}
      <div className="surface flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.2rem] font-medium leading-tight">
            The family so far
          </h2>
          <p className="text-[0.82rem] text-[var(--fg-faint)]">
            {people.length} {people.length === 1 ? "person" : "people"}
            {newRecords !== people.length && ` · ${newRecords} new`} · click
            anyone to edit them
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={depth === 0}
            className="btn btn-text btn-sm"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 8h7a3 3 0 1 1 0 6H7M3 8l3-3M3 8l3 3" />
            </svg>
            Undo
          </button>
          <button
            type="button"
            onClick={() => addFirst()}
            className="btn btn-outlined btn-sm"
          >
            <span aria-hidden>+</span> Someone unconnected
          </button>
        </div>
      </div>

      {/*
        Three cells, placed rather than nested, because the order that reads
        best differs by width. On a wide screen the drawing and the form sit
        side by side with the lists below. On a phone there is one column, and
        what has to come second is the *form* — a card tapped on the drawing
        opens an editor half a screen away, and burying it under the roster
        turns every edit into a scroll hunt.
      */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <FamilyCanvas
            draft={draft}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            label={labelFor}
            problemKeys={errorKeys}
            actions={actions}
          />
        </div>

        {/* ------------------------------------------------- Panel */}
        <div className="flex min-h-0 flex-col lg:sticky lg:top-3 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:max-h-[calc(100vh-1.5rem)]">
          {selected ? (
            <DraftPersonForm
              key={selected.key}
              person={selected}
              refs={refs}
              variant={variant}
              relatives={relatives(selected)}
              marriages={marriagesOf(selected)}
              allPeople={people}
              onChange={(changes) => update(selected.key, changes)}
              onRemove={() => remove(selected.key)}
              onAddFather={() => addParent(selected.key, "father")}
              onAddMother={() => addParent(selected.key, "mother")}
              onAddSpouse={() => addSpouse(selected.key)}
              onAddChild={() => addChild(selected.key)}
              onAddSibling={() => addSibling(selected.key)}
              onUpdateMarriage={updateMarriage}
              onRemoveMarriage={removeMarriage}
              onAddChildOfMarriage={(partnerKey) =>
                addChildOfMarriage(selected.key, partnerKey)
              }
              onUseNameOf={(sourceKey) => useNameOf(selected.key, sourceKey)}
              onSelect={setSelectedKey}
              onLinkExisting={(id) => update(selected.key, { existingId: id })}
              onUnlinkExisting={() =>
                update(selected.key, { existingId: undefined })
              }
            />
          ) : (
            <section className="surface p-5">
              <h2 className="font-display text-[1.15rem] font-medium">
                Nobody selected
              </h2>
              <p className="mt-2 text-[0.88rem] leading-relaxed text-[var(--fg-soft)]">
                Click a card on the drawing to edit that person. The buttons
                around the selected card add their father, mother, marriage,
                children and brothers or sisters — the relationship is recorded
                by where you add somebody, so there is nothing else to fill in
                for it.
              </p>
              <ul className="mt-3 space-y-1 text-[0.84rem] text-[var(--fg-faint)]">
                <li>Drag the drawing to move it, pinch or ctrl-scroll to zoom.</li>
                <li>Arrow keys walk between relatives.</li>
                <li>A dashed green card is somebody already in the archive.</li>
              </ul>
            </section>
          )}
        </div>
        <div className="min-w-0 space-y-3 lg:col-start-1 lg:row-start-2">
          {/* ------------------------------------- Problems, if any */}
          {(errors.length > 0 || warnings.length > 0) && (
            <section
              className={`rounded-[var(--shape-md)] border p-4 ${
                errors.length
                  ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_6%,transparent)]"
                  : "border-[var(--color-gold)] bg-[color-mix(in_oklab,var(--color-gold)_6%,transparent)]"
              }`}
            >
              <h3 className="font-display text-[1.05rem] font-medium">
                {errors.length
                  ? `${errors.length} thing${errors.length === 1 ? "" : "s"} to fix before this can be sent`
                  : `${warnings.length} thing${warnings.length === 1 ? "" : "s"} worth a second look`}
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.88rem] text-[var(--fg-soft)]">
                {[...errors, ...warnings].slice(0, 8).map((p, i) => (
                  <li key={i}>
                    {p.key ? (
                      <button
                        type="button"
                        onClick={() => setSelectedKey(p.key!)}
                        className="link-underline text-left"
                      >
                        {p.message}
                      </button>
                    ) : (
                      p.message
                    )}
                  </li>
                ))}
              </ul>
              {warnings.length > 0 && errors.length === 0 && (
                <p className="mt-2 text-[0.82rem] leading-relaxed text-[var(--fg-faint)]">
                  These are not errors. Families really do produce records like
                  this — send it anyway if it is what you were told.
                </p>
              )}
            </section>
          )}

          {/* ---------------------------------------------- Roster */}
          <section className="surface p-4">
            <h3 className="label">Everyone here</h3>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {people.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(p.key)}
                    aria-pressed={p.key === selectedKey}
                    className={`chip chip-sm ${
                      p.key === selectedKey ? "chip-selected" : ""
                    } ${displayOf(p) ? "" : "italic text-[var(--fg-faint)]"}`}
                    title={
                      displayOf(p) ? undefined : "Still needs a given name"
                    }
                  >
                    {displayOf(p) || describeDraft(p, people)}
                    {p.existingId && (
                      <span
                        className="text-[var(--color-tulsi)]"
                        title="already in the archive"
                      >
                        ●
                      </span>
                    )}
                    {errorKeys.has(p.key) && (
                      <span className="text-[var(--accent)]">!</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4 max-w-md">
              <PersonPicker
                label="Bring in somebody already in the archive"
                value={null}
                onChange={(p) => p && addExisting(p)}
                // Searching for somebody and not finding them is the moment
                // you learn they need adding. Making that a second trip to a
                // different button is how half-entered families happen.
                onCreateNew={(typed) => addFirst(splitName(typed))}
                createLabel="Add as a new person"
                placeholder="Search the archive…"
                hint="Linking to a record instead of retyping it is what keeps this branch attached to the family already here."
              />
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
