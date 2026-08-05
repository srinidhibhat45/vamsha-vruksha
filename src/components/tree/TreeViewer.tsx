"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CARD_H,
  CARD_W,
  layoutTree,
  orthogonalPath,
  type LaidOutJunction,
  type LaidOutPerson,
  type LayoutMode,
} from "@/lib/layout";
import type { TreePayload } from "@/lib/treeSource";
import { phoneticKey } from "@/lib/translit";
import { Select } from "@/components/ui/Select";
import { PersonCard, TreeCardDefs, type TreeBaseline } from "./PersonCard";
import { TreeDetailPanel } from "./TreeDetailPanel";
import { usePanZoom, type Transform } from "./usePanZoom";

const MODES: { id: LayoutMode; label: string; hint: string }[] = [
  {
    id: "family",
    label: "Family",
    hint: "This couple and their children, with the rest on tabs",
  },
  {
    id: "hourglass",
    label: "Hourglass",
    hint: "Ancestors above, descendants below",
  },
  { id: "descendants", label: "Descendants", hint: "Everyone below this person" },
  { id: "ancestors", label: "Ancestors", hint: "Everyone above this person" },
];

/**
 * The caption over a marriage junction.
 *
 * Ordinarily just the year. On somebody who married more than once it also
 * says which marriage this was, and when it ended — the two facts that turn a
 * man drawn between two women from a puzzle into a widower who remarried.
 */
function marriageLabel(n: LaidOutJunction): string {
  const parts: string[] = [];
  if (n.order) parts.push(ordinal(n.order));
  if (n.year && n.endYear) parts.push(`m. ${n.year}–${n.endYear}`);
  else if (n.year) parts.push(`m. ${n.year}`);
  else if (n.endYear) parts.push(`ended ${n.endYear}`);
  else if (n.status === "widowed") parts.push("widowed");
  else if (n.status === "separated") parts.push("separated");
  return parts.join(" · ");
}

function ordinal(n: number): string {
  const names = ["", "1st", "2nd", "3rd"];
  return names[n] ?? `${n}th`;
}

export function TreeViewer({
  payload,
  lineages,
  initialFocus,
  initialMode = "family",
  initialUp = 3,
  initialDown = 3,
  initialFollowDaughters = false,
}: {
  payload: TreePayload;
  lineages: { id: string; label: string; size: number }[];
  initialFocus?: string;
  initialMode?: LayoutMode;
  initialUp?: number;
  initialDown?: number;
  initialFollowDaughters?: boolean;
}) {
  const [focusId, setFocusId] = useState(
    initialFocus && payload.people[initialFocus] ? initialFocus : payload.apexId,
  );
  const [mode, setMode] = useState<LayoutMode>(initialMode);
  const [down, setDown] = useState(initialDown);
  const [up, setUp] = useState(initialUp);
  const [followDaughters, setFollowDaughters] = useState(initialFollowDaughters);

  /*
    Layers the reader has opened by name, from the tab on a card.

    A family is not a depth. My father's household is his wife and his
    children; my grandfather belongs to *his* household, and the two are
    joined by a tab above my father's card rather than by both being inside
    one drawing that gets a generation taller every time somebody wants to see
    one more person. Held per card, so opening the branch you are reading
    leaves every other branch exactly where it was — which is the whole
    difference between this and turning the depth up by one.
  */
  const [openDown, setOpenDown] = useState<Set<string>>(() => new Set());
  const [openUp, setOpenUp] = useState<Set<string>>(() => new Set());

  const toggleOpen = useCallback(
    (which: "up" | "down", id: string) => {
      const set = which === "up" ? setOpenUp : setOpenDown;
      set((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [],
  );

  // Re-rooting is a different question about a different person, so the layers
  // opened around the old root are not answers to it. Depth and mode changes
  // are, so they leave the opened layers alone.
  const clearOpen = useCallback(() => {
    setOpenDown(new Set());
    setOpenUp(new Set());
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // Open by default. A key that has to be found before the drawing can be
  // read is not a key, and every reader arriving here is a first-time reader
  // of *this* family whatever else they have seen.
  const [showLegend, setShowLegend] = useState(true);

  // The print-only chart (see below) is mounted only while this is true —
  // built once, on demand, rather than carried in the DOM at double the cost
  // of the interactive one for every tree on every render. A large lineage is
  // exactly the case that cost would hurt most.
  const [printMode, setPrintMode] = useState(false);

  // Drag, pinch, wheel and the measured viewport, shared with the builder
  // canvas so both drawings answer to the same gestures.
  const {
    wrapRef,
    size,
    transform,
    setTransform,
    panning,
    zoomBy,
    fitTo,
    dragged,
    handlers,
  } = usePanZoom(0.75);

  const modeBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /* ---------------------------------------------------------------- */
  /* Layout                                                            */
  /* ---------------------------------------------------------------- */

  const layout = useMemo(
    () =>
      layoutTree(payload, focusId, {
        mode,
        descendantDepth: down,
        ancestorDepth: up,
        expandedDown: openDown,
        expandedUp: openUp,
        followDaughters,
      }),
    [payload, focusId, mode, down, up, openDown, openUp, followDaughters],
  );

  const personNodes = useMemo(
    () => layout.nodes.filter((n): n is LaidOutPerson => n.kind === "person"),
    [layout],
  );

  /*
    What this whole tree has in common. Printing "Kaundinya gotra ·
    Kushasthali" on three hundred cards tells a reader nothing they cannot
    get from one line of the key; printing it only on the four people it is
    *not* true of turns the same ink into the most useful thing on the card.
    So the modal gotra and village are computed once here, stated once in the
    key, and omitted from every card that agrees with them.
  */
  const baseline = useMemo<TreeBaseline>(() => {
    const mode = (pick: (n: LaidOutPerson) => string | undefined) => {
      const counts = new Map<string, number>();
      for (const n of personNodes) {
        const v = pick(n);
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      let best: string | undefined;
      let bestN = 0;
      for (const [v, c] of counts) {
        if (c > bestN) {
          best = v;
          bestN = c;
        }
      }
      // A value only counts as the family's baseline if most of the family
      // actually shares it. In a tree of two married-in branches there is no
      // baseline, and pretending otherwise would hide a real difference.
      return bestN >= Math.max(2, personNodes.length * 0.5) ? best : undefined;
    };
    return {
      gotraLabel: mode((n) => n.person.gotraLabel),
      moolLabel: mode((n) => n.person.moolLabel),
    };
  }, [personNodes]);

  /* ---------------------------------------------------------------- */
  /* Viewport                                                          */
  /* ---------------------------------------------------------------- */

  // …but on a phone the key is most of the canvas, and a reader who cannot
  // see the drawing has nothing to apply the key to. Closed there, one tap
  // from open.
  useLayoutEffect(() => {
    if (window.matchMedia("(max-width: 47.9rem)").matches) setShowLegend(false);
  }, []);

  const fit = useCallback(() => fitTo(layout.bounds), [fitTo, layout.bounds]);

  const centerOnFocus = useCallback(
    (zoom?: number) => {
      const node = personNodes.find((n) => n.id === focusId);
      if (!node) return fit();
      const k = zoom ?? Math.max(0.55, Math.min(1, transform.k));
      const { minY, maxY } = layout.bounds;
      const fy = node.y + CARD_H / 2;

      // Put the focus card where it sits in the tree rather than dead centre.
      // An earliest ancestor has nothing above them, and centring them leaves
      // the top half of the screen empty while their descendants run off the
      // bottom; mirroring their position in the layout keeps the drawing in
      // view whichever generation the reader has rooted on.
      const span = Math.max(1, maxY - minY);
      const fraction = Math.min(0.62, Math.max(0.18, (fy - minY) / span));

      setTransform({
        k,
        x: size.w / 2 - (node.x + CARD_W / 2) * k,
        y: size.h * fraction - fy * k,
      });
    },
    [
      personNodes,
      focusId,
      size.w,
      size.h,
      transform.k,
      fit,
      layout.bounds,
      setTransform,
    ],
  );

  // On first paint, and whenever the shape of the tree changes underneath us,
  // frame the whole family rather than leaving the reader at an arbitrary
  // corner of a canvas that may be twenty thousand pixels wide.
  const firstRender = useRef(true);
  useEffect(() => {
    if (size.w < 10 || size.h < 10) return;
    if (!firstRender.current) return;
    firstRender.current = false;

    // Framing the whole family sounds like the obvious opening move, but a
    // wide lineage fits only at around 30%, where the cards are grey smudges
    // and the reader has to zoom before they can read anything at all. So we
    // fit only when the result stays legible, and otherwise open on the focus
    // person at reading size. "Fit" is one click away for the overview.
    const bw = Math.max(1, layout.bounds.maxX - layout.bounds.minX);
    const bh = Math.max(1, layout.bounds.maxY - layout.bounds.minY);
    const fitK = Math.min(size.w / bw, size.h / bh);
    if (fitK >= 0.5) fit();
    else centerOnFocus(0.95);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  /* ---------------------------------------------------------------- */
  /* URL state                                                         */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("person", focusId);
    params.set("mode", mode);
    params.set("up", String(up));
    params.set("down", String(down));
    if (followDaughters) params.set("daughters", "1");
    else params.delete("daughters");
    // replaceState rather than the router: this fires on every depth tweak,
    // and a router navigation per keystroke would re-render the whole page.
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [focusId, mode, up, down, followDaughters]);

  /* ---------------------------------------------------------------- */
  /* Re-rooting                                                        */
  /* ---------------------------------------------------------------- */

  const reRoot = useCallback(
    (id: string) => {
      if (!payload.people[id]) return;
      setFocusId(id);
      setSelectedId(id);
      clearOpen();
    },
    [payload.people, clearOpen],
  );

  // Keep the newly-rooted person in view. Runs after layout has been recomputed
  // for the new focus, so the coordinates are the right ones.
  const prevFocus = useRef(focusId);
  useEffect(() => {
    if (prevFocus.current === focusId) return;
    prevFocus.current = focusId;
    const node = personNodes.find((n) => n.id === focusId);
    if (!node) return;
    const { minY, maxY } = layout.bounds;
    const fy = node.y + CARD_H / 2;
    const span = Math.max(1, maxY - minY);
    const fraction = Math.min(0.62, Math.max(0.18, (fy - minY) / span));
    setTransform((t) => ({
      k: t.k,
      x: size.w / 2 - (node.x + CARD_W / 2) * t.k,
      y: size.h * fraction - fy * t.k,
    }));
  }, [focusId, personNodes, size.w, size.h, layout.bounds, setTransform]);

  /* ---------------------------------------------------------------- */
  /* Keyboard navigation                                               */
  /* ---------------------------------------------------------------- */

  const navFrom = useCallback(
    (id: string, direction: "up" | "down" | "left" | "right"): string | null => {
      const parents = payload.parents[id] ?? [];
      const unionIds = payload.personUnions[id] ?? [];
      const children = unionIds.flatMap(
        (u) => payload.unions[u]?.childIds ?? [],
      );
      const parentUnion = payload.childUnion[id];
      const siblings = parentUnion
        ? (payload.unions[parentUnion]?.childIds ?? [])
        : [];

      if (direction === "up") return parents[0] ?? null;
      if (direction === "down") return children[0] ?? null;

      const i = siblings.indexOf(id);
      if (i === -1) {
        // No siblings recorded — step to a spouse instead, which is the only
        // other move that makes sense sideways.
        const spouses = unionIds
          .flatMap((u) => payload.unions[u]?.partners ?? [])
          .filter((p) => p !== id);
        return spouses[0] ?? null;
      }
      const next = direction === "left" ? i - 1 : i + 1;
      return siblings[next] ?? null;
    },
    [payload],
  );

  /*
    Keyboard handling used to live on `window`, which meant it fired whenever
    nothing else had focus and never when the reader had actually reached the
    tree — there was no way to reach it, because the cards were `tabIndex={-1}`
    inside an SVG. The canvas is now a single focusable widget: one tab stop,
    arrow keys to walk the family from it, and every move announced. The
    listener stays on window so the existing shortcut behaviour is unchanged
    for mouse users, but it now ignores anything typed into a control and
    keeps `keyboardNav` so the focused card can be drawn with a real ring.
  */
  const [keyboardNav, setKeyboardNav] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  /*
    The detail panel moves focus onto its own heading when it opens (see
    TreeDetailPanel). Closing it removes that heading from the DOM, and a
    browser's default move for focus that vanishes out from under it is
    <body> — which strands a keyboard user at the top of the document rather
    than back in the tree they were just navigating. Only step in when that
    has actually happened: the guard skips this effect's first run (the
    initial mount, where selectedId is already null) so nothing steals focus
    on page load.
  */
  const selectedMounted = useRef(false);
  useEffect(() => {
    if (!selectedMounted.current) {
      selectedMounted.current = true;
      return;
    }
    if (selectedId !== null) return;
    if (document.activeElement === document.body) canvasRef.current?.focus();
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable ||
        el?.getAttribute("role") === "combobox"
      ) {
        return;
      }

      if (e.key === "+" || e.key === "=") {
        zoomBy(1.2);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        zoomBy(1 / 1.2);
        return;
      }
      if (e.key === "0") {
        fit();
        return;
      }
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }

      const cur = selectedId ?? focusId;
      const map: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };
      if (map[e.key]) {
        const direction = map[e.key];
        const next = navFrom(cur, direction);
        if (next) {
          e.preventDefault();
          setKeyboardNav(true);
          setSelectedId(next);
          if (!layout.drawn.has(next)) {
            // Walking off the top or bottom of what is drawn opens that layer
            // rather than throwing the reader into a redrawn tree. Sideways
            // there is no layer to open, so re-rooting is still the move.
            if (direction === "up") toggleOpen("up", cur);
            else if (direction === "down") toggleOpen("down", cur);
            else reRoot(next);
          }
        }
        return;
      }
      if (e.key === "Enter" && selectedId) {
        e.preventDefault();
        reRoot(selectedId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, focusId, navFrom, layout.drawn, reRoot, fit, toggleOpen, zoomBy]);

  /*
    What the arrow keys just did, said out loud. Without this the tree is a
    silent graphic that changes underneath a screen-reader user with no
    feedback at all.
  */
  const announcement = useMemo(() => {
    if (!selectedId) return "";
    const p = payload.people[selectedId];
    if (!p) return "";
    const parents = (payload.parents[selectedId] ?? []).length;
    const kids = (payload.personUnions[selectedId] ?? []).flatMap(
      (u) => payload.unions[u]?.childIds ?? [],
    ).length;
    return [
      p.name,
      p.birthYear && p.deathYear
        ? `${p.birthYear} to ${p.deathYear}`
        : p.birthYear
          ? `born ${p.birthYear}`
          : "dates not recorded",
      parents === 0 ? "no parents recorded" : `${parents} parent${parents === 1 ? "" : "s"} recorded`,
      kids === 0 ? "no children recorded" : `${kids} ${kids === 1 ? "child" : "children"} recorded`,
      selectedId === focusId ? "the tree is rooted here" : undefined,
    ]
      .filter(Boolean)
      .join(". ");
  }, [selectedId, focusId, payload]);

  /* ---------------------------------------------------------------- */
  /* Search within the drawn tree                                      */
  /* ---------------------------------------------------------------- */

  const matches = useMemo(() => {
    const q = filter.trim();
    if (q.length < 2) return null;
    const qKey = phoneticKey(q);
    const qLower = q.toLowerCase();
    const set = new Set<string>();
    for (const node of personNodes) {
      const p = node.person;
      const hay = [p.name, p.surname, p.gotraLabel, p.moolLabel, p.epithet]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay.includes(qLower)) {
        set.add(p.id);
        continue;
      }
      // Fall back to the phonetic key so "Shrinivas" finds "Srinivasa" here
      // too, not only in the main search.
      if (
        qKey &&
        p.name
          .split(/\s+/)
          .some((w) => phoneticKey(w).startsWith(qKey))
      ) {
        set.add(p.id);
      }
    }
    return set;
  }, [filter, personNodes]);

  /**
   * Marriages drawn with a broken bracket.
   *
   * Only the marriages of somebody who married more than once. Almost every
   * completed marriage ends in one partner outliving the other, and dashing
   * all of them would make the dash mean "both of these people are dead" —
   * which the years on the cards already say, and which is not worth a second
   * notation. Where there are two marriages it means the thing the reader
   * actually needs: this one had ended before that one began.
   */
  const endedUnions = useMemo(() => {
    const set = new Set<string>();
    for (const list of Object.values(payload.personUnions)) {
      if (list.length < 2) continue;
      for (const id of list) {
        const u = payload.unions[id];
        if (!u) continue;
        if (
          u.endYear != null ||
          u.status === "widowed" ||
          u.status === "separated"
        ) {
          set.add(u.id);
        }
      }
    }
    return set;
  }, [payload.personUnions, payload.unions]);

  /* ---------------------------------------------------------------- */
  /* Path highlight: focus -> hovered person                            */
  /* ---------------------------------------------------------------- */

  const pathIds = useMemo(() => {
    const target = hoverId ?? selectedId;
    if (!target || target === focusId) return new Set<string>();

    // Breadth-first through the drawn subgraph only, so the highlight always
    // corresponds to lines the reader can actually see.
    const prev = new Map<string, string>();
    const seen = new Set([focusId]);
    const queue = [focusId];
    while (queue.length) {
      const cur = queue.shift()!;
      if (cur === target) break;
      const neighbours: string[] = [
        ...(payload.parents[cur] ?? []),
        ...(payload.personUnions[cur] ?? []).flatMap((u) => [
          ...(payload.unions[u]?.partners ?? []),
          ...(payload.unions[u]?.childIds ?? []),
        ]),
      ];
      for (const n of neighbours) {
        if (seen.has(n) || !layout.drawn.has(n)) continue;
        seen.add(n);
        prev.set(n, cur);
        queue.push(n);
      }
    }
    if (!prev.has(target) && target !== focusId) return new Set<string>();

    const out = new Set<string>();
    let cur: string | undefined = target;
    while (cur) {
      out.add(cur);
      cur = prev.get(cur);
    }
    return out;
  }, [hoverId, selectedId, focusId, payload, layout.drawn]);

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const selected = selectedId ? payload.people[selectedId] : null;
  const focusPerson = payload.people[focusId];

  /* ---------------------------------------------------------------- */
  /* Download as PDF                                                    */
  /*                                                                     */
  /* There is no PDF library here, and none is needed: the browser's own */
  /* print pipeline already turns real DOM and SVG into a real vector    */
  /* PDF, with the fonts and colours already loaded — nothing rasterised, */
  /* nothing to keep in sync with a second renderer. So "download" means  */
  /* opening a print dialog whose destination the reader sets to "Save   */
  /* as PDF", against a page built to fit this exact chart rather than    */
  /* whatever the browser's default paper size happens to be.            */
  /*                                                                     */
  /* The interactive canvas cannot supply that page itself — it is       */
  /* deliberately clipped to one screenful (see tree/page.tsx) and drawn */
  /* at whatever pan and zoom the reader left it at. So a second, plain   */
  /* copy of the same nodes and links is built at full size and natural  */
  /* scale, mounted only for the moment printing is happening, and it is */
  /* that copy — not the canvas — that the print stylesheet shows.       */
  /* ---------------------------------------------------------------- */

  const PRINT_MARGIN = 48;
  const PRINT_HEADER_H = 116;
  // A generous ceiling on one page's own long side. Comfortably past any
  // real family tree, and there so that a pathologically wide one (a
  // hundred-odd siblings in one generation, say) still lands as one page a
  // PDF reader will actually open, just drawn smaller — it stays exactly as
  // sharp when zoomed in, because none of this is raster.
  const MAX_PRINT_DIM = 14400;

  const printBoundsW = Math.max(1, layout.bounds.maxX - layout.bounds.minX);
  const printBoundsH = Math.max(1, layout.bounds.maxY - layout.bounds.minY);
  const printRawW = printBoundsW + PRINT_MARGIN * 2;
  const printRawH = printBoundsH + PRINT_MARGIN * 2;
  const printScale = Math.min(1, MAX_PRINT_DIM / Math.max(printRawW, printRawH));
  const printSvgW = printRawW * printScale;
  const printSvgH = printRawH * printScale;
  const printPageW = Math.ceil(printSvgW);
  const printPageH = Math.ceil(printSvgH + PRINT_HEADER_H);

  const printSharedLine = [
    baseline.gotraLabel && `${baseline.gotraLabel} gotra`,
    baseline.moolLabel,
  ]
    .filter(Boolean)
    .join(" · ");
  const printModeLabel = MODES.find((m) => m.id === mode)?.label ?? mode;
  const printMeta = [
    `${printModeLabel} view, rooted on ${focusPerson?.name ?? "—"}`,
    `${personNodes.length} of ${payload.size} people drawn`,
    printSharedLine && `everyone here is ${printSharedLine} unless noted`,
    `generated ${new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const requestDownload = useCallback(() => {
    setPrintMode(true);
  }, []);

  // Two frames: one for the print-only tree to mount, one for the browser to
  // lay it out, before the dialog steals the thread. Restoring on "afterprint"
  // rather than after `window.print()` returns is what makes this work in
  // Chrome, where the call returns immediately and the dialog runs async.
  useEffect(() => {
    if (!printMode) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [printMode]);

  useEffect(() => {
    const onAfterPrint = () => setPrintMode(false);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  // A filename a reader will recognise later, rather than every download in
  // the family landing in their folder as the same "Family tree.pdf".
  useEffect(() => {
    if (!printMode) return;
    const prevTitle = document.title;
    document.title = `${payload.lineageLabel} family tree`;
    return () => {
      document.title = prevTitle;
    };
  }, [printMode, payload.lineageLabel]);

  /**
   * The links, junctions and cards, shared between the interactive canvas and
   * the print-only copy — the two differ only in outer transform and in
   * whether transient pointer/keyboard state should show, not in what a node
   * or a link actually looks like.
   */
  const treeSvgContent = (opts: { interactive: boolean }) => (
    <>
      <TreeCardDefs />
      <g fill="none" strokeLinecap="round">
        {layout.links.map((link) => {
          const isMarriage = link.kind === "marriage";
          const onPath = !!link.childId && pathIds.has(link.childId);
          const ended = !!link.unionId && endedUnions.has(link.unionId);
          return (
            <path
              key={link.id}
              d={orthogonalPath(link.points, isMarriage ? 8 : 14)}
              strokeDasharray={isMarriage && ended ? "7 4" : undefined}
              stroke={
                onPath
                  ? "var(--color-gold)"
                  : isMarriage
                    ? "color-mix(in oklab, var(--color-kumkum) 55%, transparent)"
                    : "var(--line-strong)"
              }
              strokeWidth={onPath ? 2.2 : 1.3}
              opacity={
                matches && link.childId && !matches.has(link.childId)
                  ? 0.18
                  : onPath
                    ? 1
                    : 0.65
              }
            />
          );
        })}
      </g>

      <g>
        {layout.nodes
          .filter((n) => n.kind === "junction")
          .map((n) => (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <path
                d="M0 -4 L4 0 L0 4 L-4 0 Z"
                fill="var(--color-kumkum)"
                opacity={0.75}
              />
              {n.kind === "junction" && marriageLabel(n) && (
                <text
                  y={-10}
                  textAnchor="middle"
                  fontSize={9.5}
                  fill="var(--fg-faint)"
                  style={{ userSelect: "none" }}
                >
                  {marriageLabel(n)}
                </text>
              )}
            </g>
          ))}
      </g>

      <g>
        {personNodes.map((node) => (
          <g
            key={node.id}
            {...(opts.interactive
              ? {
                  onPointerEnter: () => setHoverId(node.id),
                  onPointerLeave: () => setHoverId(null),
                }
              : {})}
          >
            <PersonCard
              node={node}
              baseline={baseline}
              state={{
                isSelected: selectedId === node.id,
                isHovered: opts.interactive && hoverId === node.id,
                isDimmed: !!matches && !matches.has(node.id),
                isOnPath: pathIds.has(node.id),
                isKeyboardFocus:
                  opts.interactive && keyboardNav && selectedId === node.id,
              }}
              onSelect={setSelectedId}
              onReRoot={reRoot}
              onExpand={toggleOpen}
              openDown={openDown.has(node.id)}
              openUp={openUp.has(node.id)}
            />
          </g>
        ))}
      </g>
    </>
  );

  const depthControl = (
    label: string,
    value: number,
    set: (n: number) => void,
    max: number,
  ) => (
    <div className="flex items-center gap-2">
      <span className="text-[0.8rem] text-[var(--fg-soft)]">{label}</span>
      <div className="flex items-center rounded-[var(--shape-full)] border border-[var(--outline)]">
        <button
          type="button"
          className="btn btn-text btn-icon btn-sm"
          onClick={() => set(Math.max(1, value - 1))}
          disabled={value <= 1}
          aria-label={`One fewer ${label} generation`}
        >
          <span aria-hidden>−</span>
        </button>
        <span
          className="w-5 text-center text-[0.85rem] font-medium tabular-nums"
          aria-live="polite"
          aria-atomic="true"
        >
          {value}
          <span className="sr-only"> {label} generations shown</span>
        </span>
        <button
          type="button"
          className="btn btn-text btn-icon btn-sm"
          onClick={() => set(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`One more ${label} generation`}
        >
          <span aria-hidden>+</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col print:block print:h-auto">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--line)] bg-[var(--bg-raised)] px-3 py-2.5 no-print">
        <Select
          ariaLabel="Choose a family"
          id="lineage-select"
          options={lineages.map((l) => ({
            value: l.id,
            label: l.label,
            detail: `${l.size} people`,
          }))}
          value={payload.lineageId}
          onChange={(id) => {
            // A different lineage is a different subgraph, so this is a real
            // navigation rather than a client-side state change.
            window.location.href = `/tree?lineage=${encodeURIComponent(id)}`;
          }}
          className="w-[17rem] max-w-full"
          buttonClassName="field-sm"
        />

        {/*
          A radiogroup rather than three buttons: these are one choice with
          three states, and saying so is what makes a screen reader announce
          "2 of 3" as you arrow through them. `title` used to be the only
          place the hint lived, which meant keyboard and touch users never
          saw it — it is now the accessible name.
        */}
        <div
          role="radiogroup"
          aria-label="What to show around this person"
          className="segmented"
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            // Otherwise the same keystroke also reaches the window-level
            // listener that drives the tree, which would re-root the
            // canvas's own selection at the same time as this control moves.
            e.preventDefault();
            e.stopPropagation();
            const i = MODES.findIndex((m) => m.id === mode);
            const next =
              e.key === "ArrowRight"
                ? (i + 1) % MODES.length
                : (i - 1 + MODES.length) % MODES.length;
            setMode(MODES[next].id);
            modeBtnRefs.current[next]?.focus();
          }}
        >
          {MODES.map((m, i) => (
            <button
              key={m.id}
              ref={(el) => {
                modeBtnRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              aria-label={`${m.label} — ${m.hint}`}
              tabIndex={mode === m.id ? 0 : -1}
              onClick={() => setMode(m.id)}
              className="segment"
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* A household has no depth to set — the tabs on the cards are the
            depth control, one branch at a time. */}
        {mode !== "family" && mode !== "descendants" &&
          depthControl("up", up, setUp, 12)}
        {mode !== "family" && mode !== "ancestors" &&
          depthControl("down", down, setDown, 12)}

        {/*
          Whether a daughter's descent is followed inside her father's tree.
          Off by default, because by the reckoning these families use her line
          continues in the family she married into — and because following it
          silently doubles the width of the drawing per generation. Never
          hidden, though: it is a reading convention, and a reader has to be
          able to see that a convention is being applied and turn it off.
        */}
        <button
          type="button"
          onClick={() => setFollowDaughters((v) => !v)}
          aria-pressed={followDaughters}
          className={`chip chip-sm ${followDaughters ? "chip-selected" : ""}`}
          title={
            followDaughters
              ? "Daughters' descendants are drawn in full. Click to summarise them again."
              : "A daughter's children are drawn, her grandchildren are on a tab. Click to follow every line in full."
          }
        >
          Daughters&rsquo; lines
          <span className="text-[var(--fg-faint)]">
            {followDaughters ? "in full" : "summarised"}
          </span>
        </button>

        <div className="field-wrap w-52 [--field-lead:2.25rem] [--field-trail:2.5rem]">
          <span className="field-lead">
            <svg
              viewBox="0 0 20 20"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="9" cy="9" r="6" />
              <path d="m13.5 13.5 3.5 3.5" strokeLinecap="round" />
            </svg>
          </span>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find in this tree…"
            className="field field-sm field-round text-[0.85rem]"
            aria-label="Find a person in the visible tree"
            aria-describedby="tree-filter-count"
            type="search"
          />
          <span className="field-trail">
            <span
              id="tree-filter-count"
              role="status"
              className="text-[0.75rem] tabular-nums text-[var(--fg-faint)]"
            >
              {matches ? (
                <>
                  {matches.size}
                  <span className="sr-only">
                    {" "}
                    {matches.size === 1 ? "match" : "matches"} in this tree
                  </span>
                </>
              ) : (
                ""
              )}
            </span>
          </span>
        </div>

        {/* Framing lives on the canvas, where the thing being framed is.
            What stays up here is the choice of *what* to draw. */}
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-[0.8rem] tabular-nums text-[var(--fg-faint)] xl:inline">
            {personNodes.length} of {payload.size} drawn
          </span>
          <button
            type="button"
            onClick={requestDownload}
            disabled={printMode}
            className="btn btn-tonal btn-sm gap-1.5"
            title="Download this exact chart as a PDF — pick &quot;Save as PDF&quot; in the dialog that opens"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 2v8m0 0-3-3m3 3 3-3M2.5 11v1.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V11" />
            </svg>
            {printMode ? "Preparing…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={() => setShowLegend((s) => !s)}
            className="btn btn-text btn-sm"
            aria-expanded={showLegend}
            aria-controls="tree-legend"
          >
            {showLegend ? "Hide key" : "Key"}
          </button>
        </div>
      </div>

      {/* Canvas + panel. Screen-only: the print stylesheet hides this whole
          stage and shows the full-size chart built below it instead. */}
      <div className="relative flex min-h-0 flex-1 print:hidden">
        <div
          ref={(node) => {
            wrapRef.current = node;
            canvasRef.current = node;
          }}
          tabIndex={0}
          role="application"
          aria-roledescription="Family tree canvas"
          aria-label={`Family tree of ${payload.lineageLabel}`}
          aria-describedby="tree-canvas-help"
          className={`tree-canvas relative min-h-0 flex-1 overflow-hidden ${
            panning ? "is-panning" : ""
          }`}
          {...handlers}
          onPointerDown={(e) => {
            setKeyboardNav(false);
            handlers.onPointerDown(e);
          }}
          onClick={() => {
            if (!dragged()) setSelectedId(null);
          }}
        >
          <svg
            width={size.w}
            height={size.h}
            className="block select-none"
            aria-hidden="true"
          >
            <g
              transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
              style={{
                transition: panning
                  ? "none"
                  : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {treeSvgContent({ interactive: true })}
            </g>
          </svg>

          {/* Minimap */}
          <Minimap
            layout={layout}
            transform={transform}
            size={size}
            onJump={(wx, wy) =>
              setTransform((t) => ({
                k: t.k,
                x: size.w / 2 - wx * t.k,
                y: size.h / 2 - wy * t.k,
              }))
            }
          />

          {/* Framing controls, over the thing being framed. */}
          <ViewControls
            zoom={transform.k}
            onZoom={zoomBy}
            onFit={fit}
            onCentre={() => centerOnFocus(0.95)}
          />

          {/* Always in the DOM so the Key button's aria-controls resolves —
              a dangling aria-controls is worse than none at all. */}
          <Legend
            open={showLegend}
            baseline={baseline}
            drawn={personNodes.length}
            total={payload.size}
            followDaughters={followDaughters}
            onClose={() => setShowLegend(false)}
          />

          {/* The full instructions belong to the canvas widget, where a
              screen reader reads them on focus; on screen they would be a
              paragraph of chrome nobody asked for. */}
          <span id="tree-canvas-help" className="sr-only">
            Arrow keys walk the family from the selected person. Enter roots
            the tree on them. Plus and minus zoom, 0 fits the whole family on
            screen, Escape closes the detail panel. A list of everyone
            currently drawn follows this canvas.
          </span>

          {/* Every arrow-key move, announced. */}
          <p role="status" aria-live="polite" className="sr-only">
            {announcement}
          </p>

          {/*
            The text alternative for the drawing (WCAG 1.1.1). The canvas is
            a single application widget, so a reader who would rather browse
            than drive it gets the same people as a plain list of links —
            with the generation they sit in, which is the one thing the
            picture conveys that a name does not.
          */}
          <div className="sr-only">
            <h2>People drawn in this view</h2>
            <ul>
              {personNodes.map((n) => (
                <li key={n.id}>
                  <a href={`/person/${n.id}`}>
                    {n.person.name}
                    {n.person.birthYear ? `, born ${n.person.birthYear}` : ""}
                    {n.isFocus ? " — the tree is rooted on this person" : ""}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {selected && (
          <TreeDetailPanel
            payload={payload}
            person={selected}
            focusId={focusId}
            focusName={focusPerson?.name ?? ""}
            onClose={() => setSelectedId(null)}
            onReRoot={reRoot}
            onSelect={setSelectedId}
          />
        )}
      </div>

      {/*
        Print-only. Built at full size and natural scale rather than clipped
        to a screenful, so the page this becomes fits the chart instead of the
        other way round — see the comment above `requestDownload`. Hidden on
        screen and mounted only while printing, so an ordinary visit carries
        none of this cost.
      */}
      {printMode && (
        <div className="hidden print:block">
          <style>{`@page { size: ${printPageW}px ${printPageH}px; margin: 0; }`}</style>
          <div
            style={{ width: printSvgW }}
            className="px-12 pt-5 pb-3"
          >
            <p className="text-[0.68rem] uppercase tracking-wide text-[var(--fg-faint)]">
              <span className="deva" lang="kok">
                वंशवृक्ष
              </span>{" "}
              · Vansh Vriksha
            </p>
            <h1 className="font-display text-[1.4rem] font-medium leading-tight text-[var(--fg)]">
              {payload.lineageLabel}
            </h1>
            <p className="mt-1 text-[0.72rem] leading-relaxed text-[var(--fg-soft)]">
              {printMeta}
            </p>
          </div>
          <svg width={printSvgW} height={printSvgH} className="block">
            <g
              transform={`scale(${printScale}) translate(${
                PRINT_MARGIN - layout.bounds.minX
              } ${PRINT_MARGIN - layout.bounds.minY})`}
            >
              {treeSvgContent({ interactive: false })}
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Minimap                                                             */
/* ------------------------------------------------------------------ */

function Minimap({
  layout,
  transform,
  size,
  onJump,
}: {
  layout: ReturnType<typeof layoutTree>;
  transform: Transform;
  size: { w: number; h: number };
  onJump: (worldX: number, worldY: number) => void;
}) {
  const { minX, minY, maxX, maxY } = layout.bounds;
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const W = 168;
  const H = Math.max(64, Math.min(132, (bh / bw) * W));
  const s = Math.min(W / bw, H / bh);

  // The slice of the world currently on screen.
  const viewX = (-transform.x / transform.k - minX) * s;
  const viewY = (-transform.y / transform.k - minY) * s;
  const viewW = (size.w / transform.k) * s;
  const viewH = (size.h / transform.k) * s;

  const nodes = layout.nodes.filter(
    (n): n is LaidOutPerson => n.kind === "person",
  );

  return (
    /*
      Pointer-only, and marked as such. Everything it does — jumping to a part
      of the drawing — is also on Fit, Centre and the arrow keys, so hiding it
      from assistive technology removes a control that could not be operated
      rather than a capability.
    */
    <div
      aria-hidden="true"
      className="absolute bottom-3 right-3 rounded-[var(--shape-sm)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--bg-raised)_92%,transparent)] p-1.5 shadow-lg backdrop-blur-sm no-print"
    >
      <svg
        width={W}
        height={H}
        className="block cursor-crosshair"
        onClick={(e) => {
          const rect = (e.target as Element)
            .closest("svg")!
            .getBoundingClientRect();
          const px = e.clientX - rect.left;
          const py = e.clientY - rect.top;
          onJump(minX + px / s, minY + py / s);
        }}
      >
        {nodes.map((n) => (
          <rect
            key={n.id}
            x={(n.x - minX) * s}
            y={(n.y - minY) * s}
            width={Math.max(1.5, n.w * s)}
            height={Math.max(1, n.h * s)}
            rx={0.8}
            fill={
              n.isFocus
                ? "var(--accent)"
                : n.person.gender === "F"
                  ? "color-mix(in oklab, var(--color-kumkum) 45%, transparent)"
                  : "color-mix(in oklab, var(--color-samudra) 45%, transparent)"
            }
          />
        ))}
        <rect
          x={viewX}
          y={viewY}
          width={viewW}
          height={viewH}
          fill="color-mix(in oklab, var(--accent) 10%, transparent)"
          stroke="var(--accent)"
          strokeWidth={1}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View controls                                                       */
/*                                                                     */
/* Zoom and framing, on the canvas rather than in the toolbar. They act */
/* on the drawing, so they belong over the drawing — and it leaves the  */
/* toolbar to say one thing: what is being drawn.                      */
/* ------------------------------------------------------------------ */

function ViewControls({
  zoom,
  onZoom,
  onFit,
  onCentre,
}: {
  zoom: number;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onCentre: () => void;
}) {
  const group =
    "flex flex-col overflow-hidden rounded-[var(--shape-full)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--bg-raised)_92%,transparent)] shadow-[var(--shadow-card)] backdrop-blur-sm";
  const item =
    "state-layer grid h-10 w-10 place-items-center text-[var(--fg-soft)] hover:text-[var(--fg)]";

  return (
    <div className="absolute right-3 top-3 flex flex-col items-center gap-2 no-print">
      <div className={group}>
        <button
          type="button"
          onClick={() => onZoom(1.25)}
          className={`${item} border-b border-[var(--line)]`}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M10 4v12M4 10h12" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onZoom(1 / 1.25)}
          className={item}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M4 10h12" />
          </svg>
        </button>
      </div>

      <span
        className="rounded-[var(--shape-full)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--bg-raised)_92%,transparent)] px-2 py-0.5 text-[0.7rem] tabular-nums text-[var(--fg-faint)] backdrop-blur-sm"
        role="status"
        aria-label={`Zoom ${Math.round(zoom * 100)} percent`}
      >
        {Math.round(zoom * 100)}%
      </span>

      <div className={group}>
        <button
          type="button"
          onClick={onFit}
          className={`${item} border-b border-[var(--line)]`}
          aria-label="Fit the whole family on screen"
          title="Fit the whole family on screen"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7.5V4h3.5M16 7.5V4h-3.5M4 12.5V16h3.5M16 12.5V16h-3.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onCentre}
          className={item}
          aria-label="Centre on the rooted person"
          title="Centre on the rooted person"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-[18px] w-[18px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="3.2" />
            <path d="M10 2.5v2.6M10 14.9v2.6M2.5 10h2.6M14.9 10h2.6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Legend                                                              */
/*                                                                     */
/* Open by default and docked to a corner it can stay in. It also       */
/* carries the one sentence that lets every card drop two lines: what   */
/* the family's own gotra and village are, so a card only speaks when   */
/* it differs.                                                          */
/* ------------------------------------------------------------------ */

function LegendRow({
  swatch,
  children,
}: {
  swatch: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="flex h-4 items-center justify-center">{swatch}</span>
      <span className="leading-snug">{children}</span>
    </>
  );
}

function Legend({
  open,
  baseline,
  drawn,
  total,
  followDaughters,
  onClose,
}: {
  open: boolean;
  baseline: TreeBaseline;
  drawn: number;
  total: number;
  followDaughters: boolean;
  onClose: () => void;
}) {
  const shared = [
    baseline.gotraLabel && `${baseline.gotraLabel} gotra`,
    baseline.moolLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      id="tree-legend"
      hidden={!open}
      className="absolute left-3 top-3 flex max-h-[calc(100%-1.5rem)] w-[19rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-[var(--shape-md)] border border-[var(--line)] bg-[color-mix(in_oklab,var(--bg-raised)_94%,transparent)] shadow-[var(--shadow-menu)] backdrop-blur-sm no-print"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-3.5 py-2">
        <h2 className="font-display text-[0.95rem] font-medium">
          Reading this tree
        </h2>
        <span className="ml-auto text-[0.72rem] tabular-nums text-[var(--fg-faint)]">
          {drawn} of {total}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="btn btn-text btn-icon btn-sm -mr-2 text-[var(--fg-faint)]"
          aria-label="Hide the key"
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

      <div className="scroll-slim grid grid-cols-[1.6rem_1fr] items-start gap-x-2 gap-y-2 overflow-y-auto px-3.5 py-2.5 text-[0.79rem] text-[var(--fg-soft)]">
        <LegendRow
          swatch={
            <span className="flex items-center gap-[3px]">
              <span className="inline-block h-3.5 w-[3px] rounded-full bg-[var(--color-samudra)]" />
              <span className="inline-block h-3.5 w-[3px] rounded-full bg-[var(--color-kumkum)]" />
            </span>
          }
        >
          Stripe on a card&rsquo;s edge —{" "}
          <span className="text-[var(--color-samudra)]">man</span>,{" "}
          <span className="text-[var(--color-kumkum)]">woman</span>
        </LegendRow>

        <LegendRow
          swatch={
            <svg viewBox="0 0 22 10" className="h-2.5 w-6" aria-hidden="true">
              <path
                d="M2 5h18"
                stroke="color-mix(in oklab, var(--color-kumkum) 55%, transparent)"
                strokeWidth="1.6"
              />
              <path d="M11 1.5 14 5l-3 3.5L8 5z" fill="var(--color-kumkum)" opacity="0.75" />
            </svg>
          }
        >
          A marriage and its junction
        </LegendRow>

        <LegendRow
          swatch={
            <svg viewBox="0 0 22 10" className="h-2.5 w-6" aria-hidden="true">
              <path
                d="M2 5h18"
                stroke="color-mix(in oklab, var(--color-kumkum) 55%, transparent)"
                strokeWidth="1.6"
                strokeDasharray="4 2.5"
              />
            </svg>
          }
        >
          A broken bracket — a marriage that ended. Where somebody married more
          than once the junction says which marriage it was.
        </LegendRow>

        <LegendRow
          swatch={
            <svg viewBox="0 0 22 10" className="h-2.5 w-6" aria-hidden="true">
              <path d="M2 5h18" stroke="var(--line-strong)" strokeWidth="1.4" />
            </svg>
          }
        >
          Descent from that couple
        </LegendRow>

        <LegendRow
          swatch={
            <svg viewBox="0 0 12 13" className="h-3.5 w-3" aria-hidden="true">
              <path
                d="M6 1.5c1.5 1.8 2.3 3 2.3 4.1A2.3 2.3 0 0 1 6 7.9a2.3 2.3 0 0 1-2.3-2.3C3.7 4.5 4.5 3.3 6 1.5z"
                fill="var(--color-haldi)"
              />
              <path
                d="M2.6 9.4h6.8c-.4 1.1-1.8 1.8-3.4 1.8s-3-.7-3.4-1.8z"
                fill="var(--color-haldi)"
                opacity="0.5"
              />
            </svg>
          }
        >
          A lamp — someone living
        </LegendRow>

        <LegendRow
          swatch={
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-tulsi)]" />
          }
        >
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>documented</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-gold)]" />
              corroborated
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--fg-faint)]" />
              hearsay
            </span>
            <span className="text-[var(--fg-faint)]">— the corner dot</span>
          </span>
        </LegendRow>

        <LegendRow
          swatch={
            <span className="inline-flex h-4 items-center gap-0.5 rounded-full border border-[var(--line-strong)] px-1 text-[0.62rem] font-semibold text-[var(--fg-soft)]">
              3
              <svg
                viewBox="0 0 8 5"
                className="h-[5px] w-2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m1 1 3 3 3-3" />
              </svg>
            </span>
          }
        >
          More kin recorded than drawn — click to open that one branch. The
          drawing stays where it is; nothing else moves.
        </LegendRow>

        {!followDaughters && (
          <LegendRow
            swatch={
              <svg viewBox="0 0 12 10" className="h-2.5 w-3" aria-hidden="true">
                <path
                  d="M1 5h9M7 1.5 10.5 5 7 8.5"
                  fill="none"
                  stroke="var(--color-kumkum)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          >
            A daughter married out — her children are drawn, and their descent
            belongs to her husband&rsquo;s family. Open it on her tab, or on{" "}
            <span className="font-medium text-[var(--fg-soft)]">
              Daughters&rsquo; lines
            </span>{" "}
            above.
          </LegendRow>
        )}
      </div>

      <div className="shrink-0">
        {shared && (
          <p className="border-t border-[var(--line)] px-3.5 py-2 text-[0.77rem] leading-relaxed text-[var(--fg-faint)]">
            Everyone here is{" "}
            <span className="font-medium text-[var(--fg-soft)]">{shared}</span>{" "}
            unless their card says otherwise.
          </p>
        )}

        <p className="border-t border-[var(--line)] px-3.5 py-2 text-[0.74rem] text-[var(--fg-faint)]">
          Drag to pan · double-click a card to re-root
        </p>
      </div>
    </div>
  );
}
