/**
 * Tree layout.
 *
 * Genealogy is not a tree, so the usual tidy-tree algorithms do not apply
 * directly. A person has two parents, may have several marriages, and children
 * belong to a *couple* rather than to an individual. Drawing children hanging
 * off one parent — which is what you get if you force the data into a plain
 * tree — makes half-siblings from two marriages look like full siblings, which
 * is precisely the distinction families care most about.
 *
 * So the layout works on union nodes: a couple is drawn side by side, a small
 * junction sits between and below them, and their children hang off that
 * junction. Two marriages produce two junctions and two visibly separate sets
 * of children.
 *
 * The algorithm is measure-then-place. Measuring returns the width a subtree
 * needs; placing walks the same recursion assigning absolute coordinates from a
 * left edge. Because every subtree is allotted its measured width and siblings
 * are packed left to right within it, overlaps are impossible by construction —
 * no post-hoc collision resolution, no contour tracking.
 *
 * This module is deliberately free of Node and React imports: the same code
 * runs on the server for static rendering and in the browser when the reader
 * re-roots the tree, so re-rooting is instant and needs no round trip.
 */

/*
 * Card size is a legibility decision, not a layout one. At 190×78 a name had
 * 124px to live in and was being truncated at around fourteen characters,
 * which cuts most patronymic names in half — "Venubai Madhav Ka…" identifies
 * nobody. At 244×96 the name column is 162px, which holds a full patronymic
 * at reading size, and the height carries a third line for the one or two
 * cards in a tree that have something to say the others do not.
 *
 * The gaps are wider than they need to be for the same reason a printed
 * pedigree leaves air around a name: the white is what lets the eye follow a
 * single line down the page instead of reading the row across.
 */
export const CARD_W = 244;
export const CARD_H = 96;
export const H_GAP = 34;
export const V_GAP = 112;
export const SPOUSE_GAP = 28;
export const ROW_H = CARD_H + V_GAP;
/** How far below a couple's row the junction dot sits. */
export const JUNCTION_DROP = 30;

export type LayoutMode = "descendants" | "ancestors" | "hourglass";

export interface TreePerson {
  id: string;
  name: string;
  given?: string;
  surname?: string;
  gender: "M" | "F" | "X" | "?";
  birthYear?: number;
  deathYear?: number;
  living?: boolean;
  epithet?: string;
  gotra?: string;
  gotraLabel?: string;
  math?: string;
  mool?: string;
  moolLabel?: string;
  kuladevata?: string;
  kuladevataLabel?: string;
  photo?: string;
  confidence?: string;
  childCount?: number;
}

export interface TreeUnion {
  id: string;
  partners: string[];
  childIds: string[];
  status?: string;
  year?: number;
}

/** The subgraph handed to the renderer — usually one whole lineage. */
export interface TreeSource {
  people: Record<string, TreePerson>;
  unions: Record<string, TreeUnion>;
  /** child id -> the union they were born into */
  childUnion: Record<string, string>;
  /** person id -> unions they are a partner in */
  personUnions: Record<string, string[]>;
  /** person id -> [fatherId?, motherId?] */
  parents: Record<string, string[]>;
}

export interface LaidOutPerson {
  kind: "person";
  id: string;
  person: TreePerson;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Row index relative to the focus person: 0 = focus, -1 = parents, 1 = children. */
  row: number;
  /** True when this is the person the tree is rooted on. */
  isFocus: boolean;
  /** True when the card is a spouse who married into the drawn family. */
  isSpouse: boolean;
  /** Children that exist but are not drawn because of the depth limit. */
  hiddenChildren?: number;
  /** Parents that exist but are not drawn. */
  hiddenParents?: number;
}

export interface LaidOutJunction {
  kind: "junction";
  id: string;
  unionId: string;
  x: number;
  y: number;
  row: number;
  status?: string;
  year?: number;
}

export type LayoutNode = LaidOutPerson | LaidOutJunction;

export interface LayoutLink {
  id: string;
  kind: "marriage" | "descent" | "parentage";
  /** Orthogonal routing points, already in layout space. */
  points: { x: number; y: number }[];
  unionId?: string;
  childId?: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  links: LayoutLink[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  focusId: string;
  /** Person ids actually drawn, for search-within-view. */
  drawn: Set<string>;
}

/* ------------------------------------------------------------------ */
/* Helpers over TreeSource                                             */
/* ------------------------------------------------------------------ */

function unionsOf(src: TreeSource, id: string): TreeUnion[] {
  return (src.personUnions[id] ?? [])
    .map((u) => src.unions[u])
    .filter(Boolean);
}

function partnersOf(src: TreeSource, id: string): string[] {
  const out: string[] = [];
  for (const u of unionsOf(src, id)) {
    for (const p of u.partners) {
      if (p !== id && src.people[p] && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

/** Children grouped by union, in union order — keeps half-siblings apart. */
function childGroups(src: TreeSource, id: string): { union: TreeUnion; kids: string[] }[] {
  return unionsOf(src, id)
    .map((u) => ({
      union: u,
      kids: u.childIds.filter((c) => src.people[c]),
    }))
    .filter((g) => g.kids.length > 0);
}

function allChildren(src: TreeSource, id: string): string[] {
  return childGroups(src, id).flatMap((g) => g.kids);
}

function parentsOf(src: TreeSource, id: string): string[] {
  return (src.parents[id] ?? []).filter((p) => src.people[p]);
}

function selfBlockWidth(partnerCount: number): number {
  return CARD_W * (partnerCount + 1) + SPOUSE_GAP * partnerCount;
}

/* ------------------------------------------------------------------ */
/* Descendant layout                                                   */
/* ------------------------------------------------------------------ */

class DescendantLayout {
  private widths = new Map<string, number>();
  nodes: LayoutNode[] = [];
  links: LayoutLink[] = [];
  drawn = new Set<string>();

  private src: TreeSource;
  private maxDepth: number;
  private focusId: string;

  // Written out longhand rather than as constructor parameter properties:
  // this module is executed directly by Node in the data scripts, and Node's
  // type-stripping loader rejects that shorthand.
  constructor(src: TreeSource, maxDepth: number, focusId: string) {
    this.src = src;
    this.maxDepth = maxDepth;
    this.focusId = focusId;
  }

  measure(id: string, depth: number, trail: Set<string>): number {
    const key = `${id}@${depth}`;
    const cached = this.widths.get(key);
    if (cached !== undefined) return cached;

    const partners = partnersOf(this.src, id);
    const selfW = selfBlockWidth(partners.length);

    let width = selfW;
    if (depth < this.maxDepth && !trail.has(id)) {
      trail.add(id);
      const kids = allChildren(this.src, id);
      if (kids.length) {
        let kidsW = 0;
        kids.forEach((k, i) => {
          kidsW += this.measure(k, depth + 1, trail);
          if (i > 0) kidsW += H_GAP;
        });
        width = Math.max(selfW, kidsW);
      }
      trail.delete(id);
    }

    this.widths.set(key, width);
    return width;
  }

  place(id: string, depth: number, left: number, trail: Set<string>): void {
    if (trail.has(id)) return;
    trail.add(id);

    const person = this.src.people[id];
    if (!person) return;

    const width = this.measure(id, depth, new Set(trail));
    const partners = partnersOf(this.src, id);
    const selfW = selfBlockWidth(partners.length);
    const y = depth * ROW_H;
    const selfLeft = left + (width - selfW) / 2;

    // The person, then each partner to their right.
    this.pushPerson(person, selfLeft, y, depth, id === this.focusId, false);
    const partnerX = new Map<string, number>();
    partners.forEach((pid, i) => {
      const px = selfLeft + (i + 1) * (CARD_W + SPOUSE_GAP);
      partnerX.set(pid, px);
      const p = this.src.people[pid];
      if (p) this.pushPerson(p, px, y, depth, false, true);
    });

    // A junction between each couple.
    const groups = childGroups(this.src, id);
    const junctionX = new Map<string, number>();
    for (const u of unionsOf(this.src, id)) {
      const other = u.partners.find((p) => p !== id);
      const ax = selfLeft + CARD_W / 2;
      const bx = other && partnerX.has(other)
        ? partnerX.get(other)! + CARD_W / 2
        : ax;
      const jx = (ax + bx) / 2;
      const jy = y + CARD_H + JUNCTION_DROP;
      junctionX.set(u.id, jx);

      if (other && partnerX.has(other)) {
        this.nodes.push({
          kind: "junction",
          id: `j-${u.id}`,
          unionId: u.id,
          x: jx,
          y: jy,
          row: depth,
          status: u.status,
          year: u.year,
        });
        // Marriage bracket: down from each card, across, meeting at the junction.
        this.links.push({
          id: `m-${u.id}`,
          kind: "marriage",
          unionId: u.id,
          points: [
            { x: ax, y: y + CARD_H },
            { x: ax, y: jy },
            { x: bx, y: jy },
            { x: bx, y: y + CARD_H },
          ],
        });
      }
    }

    if (depth >= this.maxDepth) {
      const hidden = allChildren(this.src, id).length;
      if (hidden) {
        const node = this.nodes.find(
          (n) => n.kind === "person" && n.id === id,
        ) as LaidOutPerson | undefined;
        if (node) node.hiddenChildren = hidden;
      }
      trail.delete(id);
      return;
    }

    // Children, packed left to right across all unions.
    const kids = groups.flatMap((g) => g.kids);
    if (kids.length) {
      let kidsW = 0;
      kids.forEach((k, i) => {
        kidsW += this.measure(k, depth + 1, new Set(trail));
        if (i > 0) kidsW += H_GAP;
      });

      let cursor = left + (width - kidsW) / 2;
      const childCenters = new Map<string, number>();
      for (const kid of kids) {
        const kw = this.measure(kid, depth + 1, new Set(trail));
        this.place(kid, depth + 1, cursor, trail);
        const kidNode = this.nodes.find(
          (n) => n.kind === "person" && n.id === kid,
        ) as LaidOutPerson | undefined;
        childCenters.set(kid, kidNode ? kidNode.x + CARD_W / 2 : cursor + kw / 2);
        cursor += kw + H_GAP;
      }

      // Descent lines: junction -> horizontal sibling bus -> each child.
      for (const g of groups) {
        const jx = junctionX.get(g.union.id) ?? selfLeft + CARD_W / 2;
        const jy = y + CARD_H + JUNCTION_DROP;
        const busY = (depth + 1) * ROW_H - V_GAP / 2 + 12;
        for (const kid of g.kids) {
          const cx = childCenters.get(kid);
          if (cx === undefined) continue;
          this.links.push({
            id: `d-${g.union.id}-${kid}`,
            kind: "descent",
            unionId: g.union.id,
            childId: kid,
            points: [
              { x: jx, y: jy },
              { x: jx, y: busY },
              { x: cx, y: busY },
              { x: cx, y: (depth + 1) * ROW_H },
            ],
          });
        }
      }
    }

    trail.delete(id);
  }

  private pushPerson(
    person: TreePerson,
    x: number,
    y: number,
    row: number,
    isFocus: boolean,
    isSpouse: boolean,
  ) {
    if (this.drawn.has(person.id)) return;
    this.drawn.add(person.id);
    this.nodes.push({
      kind: "person",
      id: person.id,
      person,
      x,
      y,
      w: CARD_W,
      h: CARD_H,
      row,
      isFocus,
      isSpouse,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Ancestor layout                                                     */
/* ------------------------------------------------------------------ */

class AncestorLayout {
  private widths = new Map<string, number>();
  nodes: LayoutNode[] = [];
  links: LayoutLink[] = [];
  drawn = new Set<string>();

  private src: TreeSource;
  private maxDepth: number;
  private focusId: string;

  constructor(src: TreeSource, maxDepth: number, focusId: string) {
    this.src = src;
    this.maxDepth = maxDepth;
    this.focusId = focusId;
  }

  measure(id: string, depth: number, trail: Set<string>): number {
    const key = `${id}@${depth}`;
    const cached = this.widths.get(key);
    if (cached !== undefined) return cached;

    let width = CARD_W;
    if (depth < this.maxDepth && !trail.has(id)) {
      trail.add(id);
      const ps = parentsOf(this.src, id);
      if (ps.length) {
        let w = 0;
        ps.forEach((p, i) => {
          w += this.measure(p, depth + 1, trail);
          if (i > 0) w += H_GAP;
        });
        width = Math.max(CARD_W, w);
      }
      trail.delete(id);
    }

    this.widths.set(key, width);
    return width;
  }

  place(id: string, depth: number, left: number, trail: Set<string>): void {
    if (trail.has(id)) return;
    trail.add(id);

    const person = this.src.people[id];
    if (!person) return;

    const width = this.measure(id, depth, new Set(trail));
    const y = -depth * ROW_H;
    const x = left + (width - CARD_W) / 2;

    if (!this.drawn.has(id)) {
      this.drawn.add(id);
      this.nodes.push({
        kind: "person",
        id,
        person,
        x,
        y,
        w: CARD_W,
        h: CARD_H,
        row: -depth,
        isFocus: id === this.focusId,
        isSpouse: false,
      });
    }

    const ps = parentsOf(this.src, id);
    if (depth >= this.maxDepth) {
      if (ps.length) {
        const node = this.nodes.find(
          (n) => n.kind === "person" && n.id === id,
        ) as LaidOutPerson | undefined;
        if (node) node.hiddenParents = ps.length;
      }
      trail.delete(id);
      return;
    }

    if (ps.length) {
      let totalW = 0;
      ps.forEach((p, i) => {
        totalW += this.measure(p, depth + 1, new Set(trail));
        if (i > 0) totalW += H_GAP;
      });
      let cursor = left + (width - totalW) / 2;

      const centers: number[] = [];
      for (const parent of ps) {
        const pw = this.measure(parent, depth + 1, new Set(trail));
        this.place(parent, depth + 1, cursor, trail);
        const pNode = this.nodes.find(
          (n) => n.kind === "person" && n.id === parent,
        ) as LaidOutPerson | undefined;
        centers.push(pNode ? pNode.x + CARD_W / 2 : cursor + pw / 2);
        cursor += pw + H_GAP;
      }

      // Parents' row sits one full row above; their cards end at parentBottom.
      const parentBottom = y - ROW_H + CARD_H;
      const junctionY = parentBottom + JUNCTION_DROP;
      const childTop = y;
      const childCenter = x + CARD_W / 2;

      if (centers.length >= 2) {
        const [px1, px2] = [centers[0], centers[centers.length - 1]];
        const jx = (px1 + px2) / 2;
        // Bracket joining the couple, then a single descent to the child —
        // the same visual grammar as the descendant view, read upwards.
        this.links.push({
          id: `pm-${id}`,
          kind: "marriage",
          points: [
            { x: px1, y: parentBottom },
            { x: px1, y: junctionY },
            { x: px2, y: junctionY },
            { x: px2, y: parentBottom },
          ],
        });
        this.nodes.push({
          kind: "junction",
          id: `j-anc-${id}`,
          unionId: `anc-${id}`,
          x: jx,
          y: junctionY,
          row: -(depth + 1),
        });
        this.links.push({
          id: `p-${id}`,
          kind: "parentage",
          childId: id,
          points: [
            { x: jx, y: junctionY },
            { x: jx, y: (junctionY + childTop) / 2 },
            { x: childCenter, y: (junctionY + childTop) / 2 },
            { x: childCenter, y: childTop },
          ],
        });
      } else if (centers.length === 1) {
        const px = centers[0];
        this.links.push({
          id: `p-${id}`,
          kind: "parentage",
          childId: id,
          points: [
            { x: px, y: parentBottom },
            { x: px, y: (parentBottom + childTop) / 2 },
            { x: childCenter, y: (parentBottom + childTop) / 2 },
            { x: childCenter, y: childTop },
          ],
        });
      }
    }

    trail.delete(id);
  }
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

export interface LayoutOptions {
  mode: LayoutMode;
  /** Generations drawn below the focus person. */
  descendantDepth?: number;
  /** Generations drawn above the focus person. */
  ancestorDepth?: number;
}

export function layoutTree(
  src: TreeSource,
  focusId: string,
  options: LayoutOptions,
): LayoutResult {
  const { mode } = options;
  const down = options.descendantDepth ?? 3;
  const up = options.ancestorDepth ?? 3;

  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];
  const drawn = new Set<string>();

  if (!src.people[focusId]) {
    return {
      nodes,
      links,
      drawn,
      focusId,
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    };
  }

  let focusX = 0;

  if (mode === "descendants" || mode === "hourglass") {
    const d = new DescendantLayout(src, down, focusId);
    d.measure(focusId, 0, new Set());
    d.place(focusId, 0, 0, new Set());
    nodes.push(...d.nodes);
    links.push(...d.links);
    d.drawn.forEach((id) => drawn.add(id));
    const focusNode = d.nodes.find(
      (n) => n.kind === "person" && n.id === focusId,
    ) as LaidOutPerson | undefined;
    focusX = focusNode?.x ?? 0;
  }

  if (mode === "ancestors" || mode === "hourglass") {
    const a = new AncestorLayout(src, up, focusId);
    a.measure(focusId, 0, new Set());
    a.place(focusId, 0, 0, new Set());

    const aFocus = a.nodes.find(
      (n) => n.kind === "person" && n.id === focusId,
    ) as LaidOutPerson | undefined;

    if (mode === "hourglass") {
      // Slide the ancestor half so the two halves share the same focus card,
      // then drop the ancestor copy of the focus person.
      const dx = focusX - (aFocus?.x ?? 0);
      for (const n of a.nodes) {
        if (n.kind === "person") {
          // The focus card and any spouse already drawn by the descendant half
          // must not be duplicated.
          if (n.id === focusId || drawn.has(n.id)) continue;
          drawn.add(n.id);
        }
        n.x += dx;
        nodes.push(n);
      }
      for (const l of a.links) {
        links.push({
          ...l,
          points: l.points.map((p) => ({ x: p.x + dx, y: p.y })),
        });
      }
    } else {
      nodes.push(...a.nodes);
      links.push(...a.links);
      a.drawn.forEach((id) => drawn.add(id));
      focusX = aFocus?.x ?? 0;
    }
  }

  const xs = nodes.flatMap((n) =>
    n.kind === "person" ? [n.x, n.x + n.w] : [n.x - 8, n.x + 8],
  );
  const ys = nodes.flatMap((n) =>
    n.kind === "person" ? [n.y, n.y + n.h] : [n.y - 8, n.y + 8],
  );

  const PAD = 80;
  return {
    nodes,
    links,
    drawn,
    focusId,
    bounds: {
      minX: (xs.length ? Math.min(...xs) : 0) - PAD,
      minY: (ys.length ? Math.min(...ys) : 0) - PAD,
      maxX: (xs.length ? Math.max(...xs) : 0) + PAD,
      maxY: (ys.length ? Math.max(...ys) : 0) + PAD,
    },
  };
}

/** Orthogonal path with rounded corners, for the SVG `d` attribute. */
export function orthogonalPath(
  points: { x: number; y: number }[],
  radius = 10,
): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];

    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);

    if (r < 1) {
      d += ` L ${cur.x} ${cur.y}`;
      continue;
    }
    const inX = cur.x - ((cur.x - prev.x) / (inLen || 1)) * r;
    const inY = cur.y - ((cur.y - prev.y) / (inLen || 1)) * r;
    const outX = cur.x + ((next.x - cur.x) / (outLen || 1)) * r;
    const outY = cur.y + ((next.y - cur.y) / (outLen || 1)) * r;

    d += ` L ${inX} ${inY} Q ${cur.x} ${cur.y} ${outX} ${outY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}
