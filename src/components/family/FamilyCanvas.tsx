"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CARD_H, CARD_W, orthogonalPath } from "@/lib/layout";
import { layoutDraft, type DraftLayoutResult } from "@/lib/draftLayout";
import {
  describeDraft,
  draftToTreeSource,
  displayOf,
  partialNameOf,
} from "@/lib/family";
import { usePanZoom } from "@/components/tree/usePanZoom";
import type { DraftPerson, FamilyDraft } from "@/lib/types";

/**
 * The family being entered, drawn as a tree you can build *in*.
 *
 * The previous preview was a picture beside a form: it could be looked at and
 * nothing else, it could not be panned or zoomed, and anyone it could not
 * reach from the apex it silently left out. Everything about entering a family
 * therefore happened in the form, and the drawing — the thing that actually
 * tells you whether the family is right — was decoration.
 *
 * Here the drawing is the tool. Cards are selected in it, relationships are
 * added from the card they belong to, and the gestures are the same ones the
 * published tree uses, out of the same hook: drag to pan, pinch or ctrl-wheel
 * to zoom, buttons for the people who would rather press a button.
 *
 * The add controls are HTML positioned over the canvas rather than shapes
 * inside it, which is not a detail — drawn into the SVG they would shrink with
 * the zoom until they were unhittable at exactly the moment a large family
 * most needs them. In screen space they stay 40px and legible at any scale.
 */

export interface CanvasActions {
  onAddParent: (key: string, role: "father" | "mother") => void;
  onAddSpouse: (key: string) => void;
  onAddChild: (key: string) => void;
  onAddChildOf: (partnerKeys: string[]) => void;
  onAddSibling: (key: string) => void;
}

export function FamilyCanvas({
  draft,
  selectedKey,
  onSelect,
  label,
  problemKeys,
  actions,
  heightClass = "h-[44vh] min-h-[300px] sm:h-[54vh] lg:h-[min(70vh,640px)]",
  emptyState,
}: {
  draft: FamilyDraft;
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  label?: (
    kind: "gotra" | "mool" | "kuladevata",
    id: string,
  ) => string | undefined;
  /** Draft keys with a blocking problem, marked on the card. */
  problemKeys?: Set<string>;
  /** Absent in the reviewer's read-only view. */
  actions?: CanvasActions;
  /**
   * Taller as the screen allows. On a phone the drawing has to leave room for
   * the form underneath it, or every tap on a card is followed by a scroll
   * past half a screen of nothing.
   */
  heightClass?: string;
  emptyState?: React.ReactNode;
}) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const {
    wrapRef,
    size,
    transform,
    panning,
    zoomBy,
    fitTo,
    centreOn,
    dragged,
    handlers,
  } = usePanZoom(0.75);

  const layout = useMemo<DraftLayoutResult>(
    () => layoutDraft(draftToTreeSource(draft, label)),
    [draft, label],
  );

  const byKey = useMemo(
    () => new Map(draft.people.map((p) => [p.key, p])),
    [draft.people],
  );

  /* ---------------------------------------------------------------- */
  /* Framing                                                           */
  /* ---------------------------------------------------------------- */

  const fit = useCallback(
    () => fitTo(layout.bounds, 1),
    [fitTo, layout.bounds],
  );

  // Frame the family once the canvas has a real size, and again whenever the
  // drawing grows past the edges of the viewport — a card added off-screen
  // that nobody can find is the same bug as a card not drawn at all.
  const framed = useRef(false);
  const lastCount = useRef(0);
  useEffect(() => {
    if (size.w < 10 || size.h < 10 || !layout.people.length) return;
    if (!framed.current) {
      framed.current = true;
      lastCount.current = layout.people.length;
      fit();
      return;
    }
    if (layout.people.length === lastCount.current) return;
    lastCount.current = layout.people.length;

    // Only re-frame when something has actually gone out of view; otherwise a
    // reader who has zoomed into a corner gets yanked away on every keystroke.
    const { minX, minY, maxX, maxY } = layout.bounds;
    const left = transform.x + minX * transform.k;
    const top = transform.y + minY * transform.k;
    const right = transform.x + maxX * transform.k;
    const bottom = transform.y + maxY * transform.k;
    if (left < -8 || top < -8 || right > size.w + 8 || bottom > size.h + 8) {
      fit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.people.length, size.w, size.h]);

  // Keep a newly added person on screen, whatever the reader was looking at.
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    if (prevSelected.current === selectedKey) return;
    prevSelected.current = selectedKey;
    if (!selectedKey) return;
    const node = layout.byId.get(selectedKey);
    if (!node) return;
    const sx = transform.x + (node.x + CARD_W / 2) * transform.k;
    const sy = transform.y + (node.y + CARD_H / 2) * transform.k;
    const margin = 120;
    if (
      sx < margin ||
      sy < margin ||
      sx > size.w - margin ||
      sy > size.h - margin
    ) {
      centreOn(node.x + CARD_W / 2, node.y + CARD_H / 2, Math.max(transform.k, 0.6));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, layout.byId]);

  /* ---------------------------------------------------------------- */
  /* Keyboard                                                          */
  /* ---------------------------------------------------------------- */

  const source = useMemo(() => draftToTreeSource(draft, label), [draft, label]);

  const step = useCallback(
    (from: string, dir: "up" | "down" | "left" | "right"): string | null => {
      const parents = source.parents[from] ?? [];
      const unions = (source.personUnions[from] ?? []).map(
        (u) => source.unions[u],
      );
      const children = unions.flatMap((u) => u?.childIds ?? []);
      const parentUnion = source.childUnion[from];
      const siblings = parentUnion
        ? (source.unions[parentUnion]?.childIds ?? [])
        : [];

      if (dir === "up") return parents[0] ?? null;
      if (dir === "down") return children[0] ?? null;

      const i = siblings.indexOf(from);
      if (i === -1) {
        const spouses = unions
          .flatMap((u) => u?.partners ?? [])
          .filter((p) => p !== from);
        return spouses[0] ?? null;
      }
      const next = dir === "left" ? i - 1 : i + 1;
      // Past the end of the sibling set, step to a spouse rather than dead-end.
      if (!siblings[next]) {
        const spouses = unions
          .flatMap((u) => u?.partners ?? [])
          .filter((p) => p !== from);
        return spouses[0] ?? null;
      }
      return siblings[next];
    },
    [source],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(1.2);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(1 / 1.2);
      return;
    }
    if (e.key === "0") {
      e.preventDefault();
      fit();
      return;
    }
    const map: Record<string, "up" | "down" | "left" | "right"> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    if (!map[e.key]) return;
    e.preventDefault();
    const from = selectedKey ?? layout.people[0]?.id;
    if (!from) return;
    if (!selectedKey) {
      onSelect(from);
      return;
    }
    const next = step(from, map[e.key]);
    if (next) onSelect(next);
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  if (!draft.people.length) {
    return <>{emptyState}</>;
  }

  const selectedNode = selectedKey ? layout.byId.get(selectedKey) : undefined;
  const selectedPerson = selectedKey ? byKey.get(selectedKey) : undefined;
  /*
    Only the marriages the selected person is *in*. Offering the marriage they
    were born out of as well put an "add a child here" button under their
    parents, and a click meant to add their son added their brother instead —
    the exact half-sibling confusion the union model exists to prevent, handed
    back to the contributor as a button.
  */
  const ownUnions = selectedKey
    ? layout.junctions.filter(
        (j) => j.partners.length === 2 && j.partners.includes(selectedKey),
      )
    : [];

  // Below this the cards are thumbnails; add controls placed over them would
  // cover the drawing rather than annotate it.
  const showControls = !!actions && transform.k >= 0.34;

  const screen = (worldX: number, worldY: number) => ({
    left: transform.x + worldX * transform.k,
    top: transform.y + worldY * transform.k,
  });

  const litLinks = new Set<string>();
  if (selectedKey) {
    for (const link of layout.links) {
      if (link.childId === selectedKey) litLinks.add(link.id);
      if (
        link.unionId &&
        layout.junctions.some(
          (j) => j.unionId === link.unionId && j.partners.includes(selectedKey),
        )
      ) {
        litLinks.add(link.id);
      }
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[var(--shape-md)] border border-[var(--line)] bg-[var(--bg-sunken)]">
      <div
        ref={wrapRef}
        tabIndex={0}
        role="application"
        aria-roledescription="Family tree you are building"
        aria-label="The family you are entering"
        aria-describedby="builder-canvas-help"
        className={`tree-canvas relative w-full overflow-hidden ${heightClass} ${
          panning ? "is-panning" : ""
        }`}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (!dragged()) onSelect(null);
        }}
        {...handlers}
      >
        {/* Absolutely placed so the drawing can never feed its own measured
            size back into the height of the box that measures it. */}
        <svg
          width={size.w}
          height={size.h}
          className="absolute inset-0 block select-none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id="draft-photo-clip" clipPathUnits="userSpaceOnUse">
              <rect x={0} y={0} width={38} height={38} rx={8} />
            </clipPath>
          </defs>

          <g
            transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
            style={{
              transition: panning
                ? "none"
                : "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <g fill="none" strokeLinecap="round">
              {layout.links.map((link) => {
                const marriage = link.kind === "marriage";
                const lit = litLinks.has(link.id);
                return (
                  <path
                    key={link.id}
                    d={orthogonalPath(link.points, marriage ? 8 : 14)}
                    stroke={
                      lit
                        ? "var(--accent)"
                        : marriage
                          ? "color-mix(in oklab, var(--color-kumkum) 60%, transparent)"
                          : "var(--line-strong)"
                    }
                    strokeWidth={lit ? 2.4 : 1.4}
                    opacity={lit ? 1 : 0.75}
                  />
                );
              })}
            </g>

            <g>
              {layout.nodes
                .filter((n) => n.kind === "junction")
                .map((n) => (
                  <path
                    key={n.id}
                    transform={`translate(${n.x} ${n.y})`}
                    d="M0 -4.5 L4.5 0 L0 4.5 L-4.5 0 Z"
                    fill="var(--color-kumkum)"
                    opacity={0.8}
                  />
                ))}
            </g>

            <g>
              {layout.people.map((node) => (
                <DraftCard
                  key={node.id}
                  x={node.x}
                  y={node.y}
                  person={byKey.get(node.id)}
                  people={draft.people}
                  selected={node.id === selectedKey}
                  hovered={node.id === hoverKey}
                  bad={!!problemKeys?.has(node.id)}
                  onSelect={() => {
                    if (!dragged()) onSelect(node.id);
                  }}
                  onHover={(on) => setHoverKey(on ? node.id : null)}
                />
              ))}
            </g>
          </g>
        </svg>

        {/* --------------------------------------- Add controls */}
        {showControls && selectedNode && selectedPerson && actions && (
          <CardControls
            person={selectedPerson}
            people={draft.people}
            pos={screen(selectedNode.x, selectedNode.y)}
            width={CARD_W * transform.k}
            height={CARD_H * transform.k}
            actions={actions}
          />
        )}

        {showControls &&
          actions &&
          ownUnions.map((j) => {
            const pos = screen(j.x, j.y);
            const couple = j.partners
              .map(
                (p) =>
                  displayOf(byKey.get(p)!) ||
                  describeDraft(byKey.get(p)!, draft.people),
              )
              .join(" and ");
            return (
              <button
                key={j.unionId}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onAddChildOf(j.partners);
                }}
                style={{ left: pos.left, top: pos.top }}
                className="canvas-pill absolute z-10 -translate-x-1/2 translate-y-3"
                title={`Add a child of ${couple}`}
                aria-label={`Add a child of ${couple}`}
              >
                <Plus />
                Child
              </button>
            );
          })}

        {/* --------------------------------------------- Framing */}
        <div className="absolute right-3 top-3 flex flex-col items-center gap-2">
          <div className="canvas-group">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                zoomBy(1.25);
              }}
              className="canvas-btn border-b border-[var(--line)]"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <path d="M10 4v12M4 10h12" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                zoomBy(1 / 1.25);
              }}
              className="canvas-btn"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                <path d="M4 10h12" />
              </svg>
            </button>
          </div>
          <span className="rounded-[var(--shape-full)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--bg-raised)_92%,transparent)] px-2 py-0.5 text-[0.7rem] tabular-nums text-[var(--fg-faint)] backdrop-blur-sm">
            {Math.round(transform.k * 100)}%
          </span>
          <div className="canvas-group">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fit();
              }}
              className="canvas-btn"
              aria-label="Fit the whole family on screen"
              title="Fit the whole family on screen"
            >
              <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7.5V4h3.5M16 7.5V4h-3.5M4 12.5V16h3.5M16 12.5V16h-3.5" />
              </svg>
            </button>
          </div>
        </div>

        {!showControls && actions && selectedKey && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-[var(--shape-full)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--bg-raised)_92%,transparent)] px-3 py-1 text-[0.78rem] text-[var(--fg-faint)] backdrop-blur-sm">
            Zoom in to add relatives on the drawing
          </p>
        )}

        <span id="builder-canvas-help" className="sr-only">
          Drag to move the drawing, pinch or hold control and scroll to zoom.
          Arrow keys move between relatives once somebody is selected. Plus and
          minus zoom, 0 fits the whole family. Every person and every button on
          this drawing is also listed below it.
        </span>

        <div className="sr-only">
          <h3>Everyone in this draft</h3>
          <ul>
            {draft.people.map((p) => (
              <li key={p.key}>
                {displayOf(p) || `${describeDraft(p, draft.people)} — not named yet`}
                {p.existingId ? " — already in the archive" : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* One card                                                            */
/* ------------------------------------------------------------------ */

function DraftCard({
  x,
  y,
  person,
  people,
  selected,
  hovered,
  bad,
  onSelect,
  onHover,
}: {
  x: number;
  y: number;
  person?: DraftPerson;
  /** The whole draft, so an unnamed card can say who it stands next to. */
  people: DraftPerson[];
  selected: boolean;
  hovered: boolean;
  bad: boolean;
  onSelect: () => void;
  onHover: (on: boolean) => void;
}) {
  if (!person) return null;

  const name = displayOf(person);
  const years = [person.birthYear, person.deathYear].filter(Boolean).join("–");
  const existing = !!person.existingId;
  const stripe =
    person.gender === "F"
      ? "var(--color-kumkum)"
      : person.gender === "M"
        ? "var(--color-samudra)"
        : "var(--outline)";

  /*
    A card with no name says who it is anyway — "the wife of Narayan Kamath",
    "a son of Shrikan and Lakshmi". It used to print whatever the form had
    inherited into the middle name and surname fields, which read as a real
    name and hid the fact that the person still needed naming; and the
    fallback, "Name not filled in", was the same six words on every such card
    in a drawing where the whole difficulty is telling them apart.
  */
  const placeholder = name ? "" : describeDraft(person, people);
  const inherited = name ? "" : partialNameOf(person);

  const second = existing
    ? [years, "already in the archive"].filter(Boolean).join(" · ")
    : name
      ? years || (person.epithet ?? "")
      : [inherited && `…${inherited}`, years].filter(Boolean).join(" · ");

  return (
    <g
      transform={`translate(${x} ${y})`}
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {selected && (
        <rect
          x={-5}
          y={-5}
          width={CARD_W + 10}
          height={CARD_H + 10}
          rx={18}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          opacity={0.35}
        />
      )}

      <rect
        width={CARD_W}
        height={CARD_H}
        rx={14}
        fill="var(--bg-raised)"
        stroke={
          selected
            ? "var(--accent)"
            : bad
              ? "var(--accent)"
              : existing
                ? "var(--color-tulsi)"
                : hovered
                  ? "var(--outline)"
                  : "var(--outline-soft)"
        }
        strokeWidth={selected ? 2.4 : bad || existing ? 1.6 : 1.1}
        strokeDasharray={existing && !selected ? "7 4" : undefined}
      />

      <rect x={0} y={10} width={4} height={CARD_H - 20} rx={2} fill={stripe} />

      {name ? (
        <text x={18} y={36} fontSize={16} fontWeight={600} fill="var(--fg)">
          {truncate(name, 22)}
        </text>
      ) : (
        <text
          x={18}
          y={36}
          fontSize={14}
          fontStyle="italic"
          fill="var(--accent)"
        >
          <title>Still needs a given name</title>
          {truncate(placeholder, 26)}
        </text>
      )}

      {second && (
        <text
          x={18}
          y={58}
          fontSize={12.5}
          fill={existing ? "var(--color-tulsi)" : "var(--fg-faint)"}
        >
          {truncate(second, 30)}
        </text>
      )}

      {person.epithet && !existing && years && (
        <text x={18} y={78} fontSize={11.5} fill="var(--fg-faint)">
          {truncate(person.epithet, 32)}
        </text>
      )}

      {bad && (
        <g transform={`translate(${CARD_W - 26} 22)`}>
          <circle r={9} fill="var(--accent)" opacity={0.14} />
          <text
            textAnchor="middle"
            y={4.5}
            fontSize={12}
            fontWeight={700}
            fill="var(--accent)"
          >
            !
          </text>
        </g>
      )}

      {person.photo?.thumbUrl || person.photo?.url ? (
        // The clip path is in user space at the origin, so the image is placed
        // by translating a wrapper rather than by its own x/y.
        <g transform={`translate(${CARD_W - 54} ${(CARD_H - 38) / 2})`}>
          <image
            href={person.photo.thumbUrl ?? person.photo.url}
            width={38}
            height={38}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#draft-photo-clip)"
          />
        </g>
      ) : null}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The add controls around the selected card                           */
/* ------------------------------------------------------------------ */

function CardControls({
  person,
  people,
  pos,
  width,
  height,
  actions,
}: {
  person: DraftPerson;
  people: DraftPerson[];
  pos: { left: number; top: number };
  width: number;
  height: number;
  actions: CanvasActions;
}) {
  const [asking, setAsking] = useState(false);
  const spouses = (person.spouseKeys ?? [])
    .map((s) => people.find((p) => p.key === s.key))
    .filter((p): p is DraftPerson => !!p);

  const hasParent = !!person.fatherKey || !!person.motherKey;

  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  return (
    <>
      {/* Parents, above */}
      <div
        style={{ left: pos.left + width / 2, top: pos.top }}
        className="absolute z-10 flex -translate-x-1/2 -translate-y-[calc(100%+10px)] gap-1.5"
      >
        {!person.fatherKey && (
          <button
            type="button"
            className="canvas-pill"
            onClick={stop(() => actions.onAddParent(person.key, "father"))}
          >
            <Plus />
            Father
          </button>
        )}
        {!person.motherKey && (
          <button
            type="button"
            className="canvas-pill"
            onClick={stop(() => actions.onAddParent(person.key, "mother"))}
          >
            <Plus />
            Mother
          </button>
        )}
      </div>

      {/* Marriage, to the right */}
      <div
        style={{ left: pos.left + width + 10, top: pos.top + height / 2 }}
        className="absolute z-10 -translate-y-1/2"
      >
        <button
          type="button"
          className="canvas-pill"
          onClick={stop(() => actions.onAddSpouse(person.key))}
        >
          <Plus />
          Marriage
        </button>
      </div>

      {/* Brother or sister, to the left */}
      {hasParent && (
        <div
          style={{ left: pos.left - 10, top: pos.top + height / 2 }}
          className="absolute z-10 -translate-x-full -translate-y-1/2"
        >
          <button
            type="button"
            className="canvas-pill"
            onClick={stop(() => actions.onAddSibling(person.key))}
          >
            <Plus />
            Sibling
          </button>
        </div>
      )}

      {/*
        Children hang off the couple, so once there is a marriage the button
        lives on its junction instead (see ownUnions above) — under the pair,
        where the child will actually appear. Only somebody with no marriage
        recorded gets a child button on their own card, and that child is
        knowingly a single-parent one.
      */}
      {spouses.length === 0 && (
        <div
          style={{ left: pos.left + width / 2, top: pos.top + height + 10 }}
          className="absolute z-10 -translate-x-1/2"
        >
          <button
            type="button"
            className="canvas-pill"
            title="Add a child with no other parent recorded"
            onClick={stop(() => actions.onAddChild(person.key))}
          >
            <Plus />
            Child
          </button>
        </div>
      )}
    </>
  );
}

function Plus() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
