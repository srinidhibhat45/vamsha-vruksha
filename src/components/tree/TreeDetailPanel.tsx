"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { TreePerson } from "@/lib/layout";
import type { TreePayload } from "@/lib/treeSource";

/**
 * The panel that opens when a card is clicked.
 *
 * Everything except the relationship line is computed from the payload already
 * in the browser, so the panel is populated the instant the card is clicked
 * rather than after a spinner. Only "how is this person related to the one the
 * tree is rooted on" needs the server, because that answer may run through
 * people outside the loaded lineage.
 *
 * Laid out on Material 3's list and card patterns rather than as a wall of
 * definition rows: the relationship — the one thing here you cannot work out
 * by looking at the tree — sits in a tonal card at the top, the lineage facts
 * are a bordered card under it, and every relative is a two-line list item
 * with a monogram, so a name and its dates stop competing for one line.
 */

interface RelateResponse {
  term: { english: string; konkani?: string; gloss?: string; alt?: string[] };
  reciprocal: { english: string; konkani?: string };
  kind: string;
  distance: number;
  commonAncestors: { id: string; name: string }[];
}

function toneOf(gender: string): string {
  if (gender === "F") return "var(--color-kumkum)";
  if (gender === "M") return "var(--color-samudra)";
  return "var(--color-gold)";
}

function initialsOf(p: TreePerson): string {
  return (
    (p.given?.[0] ?? p.name[0] ?? "?") + (p.surname?.[0] ?? "")
  ).toUpperCase();
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-[84px_1fr] gap-3 px-4 py-2">
      <dt className="fact-label pt-[3px]">{label}</dt>
      <dd className="text-[0.88rem] leading-snug text-[var(--fg)]">
        {children}
      </dd>
    </div>
  );
}

function PersonItem({
  person,
  onSelect,
  suffix,
}: {
  person: TreePerson | undefined;
  onSelect: (id: string) => void;
  suffix?: string;
}) {
  if (!person) return null;
  const years = person.birthYear
    ? person.deathYear
      ? `${person.birthYear}–${person.deathYear}`
      : `born ${person.birthYear}`
    : person.deathYear
      ? `died ${person.deathYear}`
      : "dates not recorded";

  return (
    <button
      type="button"
      onClick={() => onSelect(person.id)}
      className="list-item"
      style={{ ["--tone" as string]: toneOf(person.gender) }}
    >
      <span className="avatar [--avatar:30px]" aria-hidden>
        {initialsOf(person)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="list-item-headline">{person.name}</span>
        <span className="list-item-support">
          {years}
          {suffix ? ` · ${suffix}` : ""}
        </span>
      </span>
    </button>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="eyebrow px-1 pb-1">{title}</h3>
      {children}
    </section>
  );
}

export function TreeDetailPanel({
  payload,
  person,
  focusId,
  focusName,
  onClose,
  onReRoot,
  onSelect,
}: {
  payload: TreePayload;
  person: TreePerson;
  focusId: string;
  focusName: string;
  onClose: () => void;
  onReRoot: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const [relation, setRelation] = useState<RelateResponse | null>(null);
  const [relLoading, setRelLoading] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  const titleId = `${uid}-title`;

  /*
    The panel appears in response to a click on the canvas, which leaves focus
    behind on the canvas — so a keyboard user who pressed Enter on a card
    would have to tab through the entire toolbar to reach what just opened.
    Moving focus to the panel heading puts the next Tab inside the panel,
    where it belongs. Escape is already wired to close it.
  */
  useEffect(() => {
    headingRef.current?.focus();
  }, [person.id]);

  useEffect(() => {
    if (person.id === focusId) {
      setRelation(null);
      return;
    }
    const controller = new AbortController();
    setRelLoading(true);
    setRelation(null);
    fetch(`/api/relate?a=${focusId}&b=${person.id}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setRelation(d))
      .catch(() => {
        /* aborted by a faster click, or offline */
      })
      .finally(() => setRelLoading(false));
    return () => controller.abort();
  }, [person.id, focusId]);

  const parents = (payload.parents[person.id] ?? []).map(
    (id) => payload.people[id],
  );
  const unionIds = payload.personUnions[person.id] ?? [];
  const spouses = unionIds
    .flatMap((u) => payload.unions[u]?.partners ?? [])
    .filter((id) => id !== person.id)
    .map((id) => payload.people[id]);
  const children = unionIds
    .flatMap((u) => payload.unions[u]?.childIds ?? [])
    .map((id) => payload.people[id]);
  const parentUnion = payload.childUnion[person.id];
  const siblings = (payload.unions[parentUnion ?? ""]?.childIds ?? [])
    .filter((id) => id !== person.id)
    .map((id) => payload.people[id]);

  const years =
    person.birthYear && person.deathYear
      ? `${person.birthYear} – ${person.deathYear}`
      : person.birthYear
        ? `born ${person.birthYear}`
        : person.deathYear
          ? `died ${person.deathYear}`
          : "dates not recorded";

  const age =
    person.birthYear && person.deathYear
      ? person.deathYear - person.birthYear
      : person.birthYear && person.living
        ? new Date().getFullYear() - person.birthYear
        : undefined;

  const tone = toneOf(person.gender);

  return (
    <aside
      className="flex w-[358px] shrink-0 flex-col border-l border-[var(--line)] bg-[var(--bg-raised)] no-print"
      aria-labelledby={titleId}
    >
      {/* ------------------------------------------------------- Header */}
      <div className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-4">
        <span
          className="avatar avatar-square [--avatar:44px]"
          style={{ ["--tone" as string]: tone }}
          aria-hidden
        >
          {initialsOf(person)}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[1.25rem] font-medium leading-tight"
          >
            {person.name}
          </h2>
          <p className="mt-1 text-[0.82rem] text-[var(--fg-soft)]">
            {years}
            {age !== undefined && ` · aged ${age}`}
            {person.living && " · living"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-text btn-icon btn-sm -mr-1.5 -mt-1 shrink-0 text-[var(--fg-soft)]"
          aria-label="Close this panel"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 scroll-slim">
        {/* --------------------------------------------- Relationship */}
        {person.id !== focusId && (
          <div
            className="m3-card m3-card-tonal p-4"
            role="status"
            aria-busy={relLoading}
          >
            <p className="fact-label text-current opacity-70">
              Relationship to {focusName}
            </p>
            {relLoading && (
              <p className="mt-1.5 text-[0.88rem] opacity-70">
                working it out…
              </p>
            )}
            {relation && (
              <>
                <p className="mt-1.5 font-display text-[1.2rem] font-medium leading-tight">
                  {relation.term.english}
                  {relation.term.konkani && (
                    <span className="deva ml-2 text-[0.95em]" lang="kok">
                      {relation.term.konkani}
                    </span>
                  )}
                </p>
                {relation.term.gloss && (
                  <p className="mt-1.5 text-[0.8rem] leading-relaxed opacity-80">
                    {relation.term.gloss}
                  </p>
                )}
                {relation.commonAncestors.length > 0 && (
                  <p className="mt-2 text-[0.8rem] opacity-80">
                    through{" "}
                    {relation.commonAncestors.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && " and "}
                        <button
                          type="button"
                          className="link-underline font-medium"
                          onClick={() => onSelect(a.id)}
                        >
                          {a.name}
                        </button>
                      </span>
                    ))}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* --------------------------------------------------- Lineage */}
        <div className="m3-card">
          <dl className="divide-y divide-[var(--line)] py-1">
            <Row label="Gotra">{person.gotraLabel}</Row>
            <Row label="Kuladevata">{person.kuladevataLabel}</Row>
            <Row label="Mool">{person.moolLabel}</Row>
            {person.epithet && <Row label="Known for">{person.epithet}</Row>}
          </dl>
        </div>

        {/* ---------------------------------------------------- Family */}
        <div className="space-y-4">
          {parents.length > 0 && (
            <Group title="Parents">
              {parents.map((p) => (
                <PersonItem key={p?.id} person={p} onSelect={onSelect} />
              ))}
            </Group>
          )}

          {spouses.length > 0 && (
            <Group title={spouses.length > 1 ? "Marriages" : "Married to"}>
              {spouses.map((p) => (
                <PersonItem key={p?.id} person={p} onSelect={onSelect} />
              ))}
            </Group>
          )}

          {children.length > 0 && (
            <Group title={`Children · ${children.length}`}>
              {children.map((p) => (
                <PersonItem key={p?.id} person={p} onSelect={onSelect} />
              ))}
            </Group>
          )}

          {siblings.length > 0 && (
            <Group title={`Siblings · ${siblings.length}`}>
              {siblings.map((p) => (
                <PersonItem key={p?.id} person={p} onSelect={onSelect} />
              ))}
            </Group>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[var(--line)] p-3">
        <button
          type="button"
          onClick={() => onReRoot(person.id)}
          disabled={person.id === focusId}
          className="btn btn-filled btn-sm"
        >
          Root the tree here
        </button>
        <Link href={`/person/${person.id}`} className="btn btn-outlined btn-sm">
          Full record
        </Link>
      </div>
    </aside>
  );
}
