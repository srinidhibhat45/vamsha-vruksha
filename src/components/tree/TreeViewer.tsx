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
  type LaidOutPerson,
  type LayoutMode,
} from "@/lib/layout";
import type { TreePayload } from "@/lib/treeSource";
import { phoneticKey } from "@/lib/translit";
import { Select } from "@/components/ui/Select";
import { PersonCard, TreeCardDefs, type TreeBaseline } from "./PersonCard";
import { TreeDetailPanel } from "./TreeDetailPanel";

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 2.6;

interface Transform {
  x: number;
  y: number;
  k: number;
}

const MODES: { id: LayoutMode; label: string; hint: string }[] = [
  {
    id: "hourglass",
    label: "Hourglass",
    hint: "Ancestors above, descendants below",
  },
  { id: "descendants", label: "Descendants", hint: "Everyone below this person" },
  { id: "ancestors", label: "Ancestors", hint: "Everyone above this person" },
];

export function TreeViewer({
  payload,
  lineages,
  initialFocus,
  initialMode = "hourglass",
  initialUp = 3,
  initialDown = 3,
}: {
  payload: TreePayload;
  lineages: { id: string; label: string; size: number }[];
  initialFocus?: string;
  initialMode?: LayoutMode;
  initialUp?: number;
  initialDown?: number;
}) {
  const [focusId, setFocusId] = useState(
    initialFocus && payload.people[initialFocus] ? initialFocus : payload.apexId,
  );
  const [mode, setMode] = useState<LayoutMode>(initialMode);
  const [down, setDown] = useState(initialDown);
  const [up, setUp] = useState(initialUp);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 0.75 });
  const [panning, setPanning] = useState(false);
  // Starts at zero so the initial fit waits for a real measurement. Seeding it
  // with a guess made the tree frame itself against dimensions the container
  // never had, leaving it parked off-centre.
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Open by default. A key that has to be found before the drawing can be
  // read is not a key, and every reader arriving here is a first-time reader
  // of *this* family whatever else they have seen.
  const [showLegend, setShowLegend] = useState(true);

  const wrapRef = useRef<HTMLDivElement>(null);
  const modeBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{ dist: number; k: number } | null>(null);
  // Active touch/pen/mouse contacts, keyed by pointerId. A second concurrent
  // pointer is what turns a drag into a pinch — see onPointerDown below.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());

  /* ---------------------------------------------------------------- */
  /* Layout                                                            */
  /* ---------------------------------------------------------------- */

  const layout = useMemo(
    () =>
      layoutTree(payload, focusId, {
        mode,
        descendantDepth: down,
        ancestorDepth: up,
      }),
    [payload, focusId, mode, down, up],
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

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const { minX, minY, maxX, maxY } = layout.bounds;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const k = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(size.w / bw, size.h / bh)),
    );
    setTransform({
      k,
      x: size.w / 2 - ((minX + maxX) / 2) * k,
      y: size.h / 2 - ((minY + maxY) / 2) * k,
    });
  }, [layout.bounds, size.w, size.h]);

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
    [personNodes, focusId, size.w, size.h, transform.k, fit, layout.bounds],
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
    // replaceState rather than the router: this fires on every depth tweak,
    // and a router navigation per keystroke would re-render the whole page.
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [focusId, mode, up, down]);

  /* ---------------------------------------------------------------- */
  /* Re-rooting                                                        */
  /* ---------------------------------------------------------------- */

  const reRoot = useCallback(
    (id: string) => {
      if (!payload.people[id]) return;
      setFocusId(id);
      setSelectedId(id);
    },
    [payload.people],
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
  }, [focusId, personNodes, size.w, size.h, layout.bounds]);

  /* ---------------------------------------------------------------- */
  /* Pointer interaction                                               */
  /* ---------------------------------------------------------------- */

  // Starts a one-finger/mouse drag from the given point, against the
  // transform as it stands right now. Pulled out so a pinch that ends with
  // one finger still on the glass can drop straight back into a pan instead
  // of stopping dead.
  const startDrag = (x: number, y: number) => {
    dragRef.current = {
      startX: x,
      startY: y,
      origX: transform.x,
      origY: transform.y,
      moved: false,
    };
    setPanning(true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size >= 2) {
      // A second touch has landed: this is a pinch, not a pan. Drop any pan
      // in progress and record the starting spread so onPointerMove has a
      // baseline to scale against.
      dragRef.current = null;
      setPanning(false);
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        k: transform.k,
      };
      return;
    }

    startDrag(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const [p1, p2] = [...pointersRef.current.values()];
      const rect = wrapRef.current?.getBoundingClientRect();
      const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (rect && pinchRef.current.dist > 0 && dist > 0) {
        const midX = (p1.x + p2.x) / 2 - rect.left;
        const midY = (p1.y + p2.y) / 2 - rect.top;
        const k = Math.min(
          MAX_ZOOM,
          Math.max(MIN_ZOOM, pinchRef.current.k * (dist / pinchRef.current.dist)),
        );
        setTransform((t) => {
          const scale = k / t.k;
          // Keep the midpoint between the two fingers fixed, the same way a
          // wheel-zoom keeps the point under the cursor fixed.
          return {
            k,
            x: midX - (midX - t.x) * scale,
            y: midY - (midY - t.y) * scale,
          };
        });
      }
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    setTransform((t) => ({ ...t, x: d.origX + dx, y: d.origY + dy }));
  };

  const endDrag = (e?: React.PointerEvent) => {
    if (e) pointersRef.current.delete(e.pointerId);

    if (pointersRef.current.size >= 2) {
      // Still pinching on the remaining fingers — re-baseline rather than
      // stopping, so lifting a third finger (or a stray palm contact) does
      // not interrupt the gesture.
      const [p1, p2] = [...pointersRef.current.values()];
      pinchRef.current = {
        dist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
        k: transform.k,
      };
      return;
    }

    pinchRef.current = null;

    if (pointersRef.current.size === 1) {
      // One finger lifted out of a pinch, one still down: carry on panning
      // from here rather than leaving the gesture dangling.
      const [p] = [...pointersRef.current.values()];
      startDrag(p.x, p.y);
      return;
    }

    dragRef.current = null;
    setPanning(false);
  };

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      setTransform((t) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor));
        const scale = k / t.k;
        return {
          k,
          // Keep the point under the cursor fixed while the scale changes.
          x: px - (px - t.x) * scale,
          y: py - (py - t.y) * scale,
        };
      });
    },
    [],
  );

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Trackpad pinch arrives as ctrl+wheel; so does an explicit zoom gesture.
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
    } else {
      // Plain scroll pans, the way it does in every other canvas the reader
      // has used. Zoom is on pinch, the buttons, and +/-.
      setTransform((t) => ({ ...t, x: t.x - e.deltaX, y: t.y - e.deltaY }));
    }
  };

  // React attaches wheel passively, which forbids preventDefault, so the pinch
  // path is registered directly on the element instead.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

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
        setTransform((t) => ({ ...t, k: Math.min(MAX_ZOOM, t.k * 1.2) }));
        return;
      }
      if (e.key === "-" || e.key === "_") {
        setTransform((t) => ({ ...t, k: Math.max(MIN_ZOOM, t.k / 1.2) }));
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
        const next = navFrom(cur, map[e.key]);
        if (next) {
          e.preventDefault();
          setKeyboardNav(true);
          setSelectedId(next);
          if (!layout.drawn.has(next)) reRoot(next);
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
  }, [selectedId, focusId, navFrom, layout.drawn, reRoot, fit]);

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
    <div className="flex h-full min-h-0 flex-col">
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

        {mode !== "descendants" && depthControl("up", up, setUp, 12)}
        {mode !== "ancestors" && depthControl("down", down, setDown, 12)}

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
            onClick={() => setShowLegend((s) => !s)}
            className="btn btn-text btn-sm"
            aria-expanded={showLegend}
            aria-controls="tree-legend"
          >
            {showLegend ? "Hide key" : "Key"}
          </button>
        </div>
      </div>

      {/* Canvas + panel */}
      <div className="relative flex min-h-0 flex-1">
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
          onPointerDown={(e) => {
            setKeyboardNav(false);
            onPointerDown(e);
          }}
          className={`tree-canvas relative min-h-0 flex-1 overflow-hidden ${
            panning ? "is-panning" : ""
          }`}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onPointerCancel={endDrag}
          onWheel={onWheel}
          onClick={() => {
            if (!dragRef.current?.moved) setSelectedId(null);
          }}
        >
          <svg
            width={size.w}
            height={size.h}
            className="block select-none"
            aria-hidden="true"
          >
            {/* One clip path, shared by every card — defined in user space so
                it lands correctly inside each card's own translate. */}
            <TreeCardDefs />
            <g
              transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
              style={{
                transition: panning
                  ? "none"
                  : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {/* Connections first so cards sit on top of them. */}
              <g fill="none" strokeLinecap="round">
                {layout.links.map((link) => {
                  const isMarriage = link.kind === "marriage";
                  const onPath =
                    !!link.childId && pathIds.has(link.childId);
                  return (
                    <path
                      key={link.id}
                      d={orthogonalPath(link.points, isMarriage ? 8 : 14)}
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

              {/* Union junctions — a small diamond, echoing the kasti motif. */}
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
                      {n.kind === "junction" && n.year && (
                        <text
                          y={-10}
                          textAnchor="middle"
                          fontSize={9.5}
                          fill="var(--fg-faint)"
                          style={{ userSelect: "none" }}
                        >
                          m. {n.year}
                        </text>
                      )}
                    </g>
                  ))}
              </g>

              {/* Cards */}
              <g>
                {personNodes.map((node) => (
                  <g
                    key={node.id}
                    onPointerEnter={() => setHoverId(node.id)}
                    onPointerLeave={() => setHoverId(null)}
                  >
                    <PersonCard
                      node={node}
                      baseline={baseline}
                      state={{
                        isSelected: selectedId === node.id,
                        isHovered: hoverId === node.id,
                        isDimmed: !!matches && !matches.has(node.id),
                        isOnPath: pathIds.has(node.id),
                        isKeyboardFocus:
                          keyboardNav && selectedId === node.id,
                      }}
                      onSelect={setSelectedId}
                      onReRoot={reRoot}
                    />
                  </g>
                ))}
              </g>
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
            onZoom={(factor) =>
              setTransform((t) => ({
                ...t,
                k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor)),
              }))
            }
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
  onClose,
}: {
  open: boolean;
  baseline: TreeBaseline;
  drawn: number;
  total: number;
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
          More kin recorded than drawn — click to open
        </LegendRow>
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
