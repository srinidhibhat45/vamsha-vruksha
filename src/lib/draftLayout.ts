import {
  CARD_H,
  CARD_W,
  H_GAP,
  JUNCTION_DROP,
  ROW_H,
  SPOUSE_GAP,
  V_GAP,
  type LaidOutJunction,
  type LaidOutPerson,
  type LayoutLink,
  type LayoutNode,
  type TreeSource,
} from "./layout.ts";

/**
 * Layout for a family being *entered*, as opposed to one being read.
 *
 * layoutTree() walks outward from a focus person to a depth, which is exactly
 * right for reading a published tree: the reader asks about somebody and gets
 * their neighbourhood. It is the wrong rule for a draft, and it was the cause
 * of every complaint about the entry preview — a row it could not reach from
 * the apex simply was not drawn. Somebody the contributor had brought in from
 * the archive but not yet joined up, a second household entered before the two
 * were connected, the *wife's* father (whom the descendant walk never reaches,
 * because it only ever steps down through children and sideways to partners):
 * all of them vanished the moment they were typed, which reads as the tool
 * losing your work.
 *
 * So this is a different algorithm with a different guarantee: **every person
 * in the draft is drawn exactly once.** It works in generations rather than
 * recursion, which is what makes that guarantee cheap —
 *
 *   1. a generation number per person, relaxed until stable: a child sits one
 *      row below their lowest parent, and partners are pulled level;
 *   2. an order within each row, from a depth-first walk that keeps couples
 *      adjacent and siblings together, with a final sweep that catches
 *      anybody the walk did not reach;
 *   3. a few passes of pulling children under their parents' junction and
 *      parents over the middle of their children, each pass followed by a
 *      left-to-right push that enforces minimum spacing — so cards can never
 *      overlap, whatever the family does.
 *
 * The output is the same LayoutNode/LayoutLink vocabulary the published tree
 * renders, so the builder canvas and the reader's canvas draw from one set of
 * shapes. A draft is at most sixty people, so cost is irrelevant.
 */

/** Extra air between two unconnected families sharing the drawing. */
const COMPONENT_GAP = 180;
/** Passes of the pull-together refinement. Converges well before this. */
const REFINE_PASSES = 12;

export interface DraftJunction {
  unionId: string;
  x: number;
  y: number;
  partners: string[];
  childIds: string[];
}

export interface DraftLayoutResult {
  nodes: LayoutNode[];
  links: LayoutLink[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  people: LaidOutPerson[];
  byId: Map<string, LaidOutPerson>;
  /** Couple junctions, for the "add a child to *this* marriage" affordance. */
  junctions: DraftJunction[];
  /** How many separate, unjoined families the drawing contains. */
  components: number;
}

const EMPTY: DraftLayoutResult = {
  nodes: [],
  links: [],
  bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  people: [],
  byId: new Map(),
  junctions: [],
  components: 0,
};

export function layoutDraft(src: TreeSource): DraftLayoutResult {
  const ids = Object.keys(src.people);
  if (!ids.length) return EMPTY;

  const unionsOf = (id: string) =>
    (src.personUnions[id] ?? []).map((u) => src.unions[u]).filter(Boolean);
  const parentsOf = (id: string) =>
    (src.parents[id] ?? []).filter((p) => src.people[p]);
  const childrenOfUnion = (unionId: string) =>
    (src.unions[unionId]?.childIds ?? []).filter((c) => src.people[c]);

  /* ---------------------------------------------------------------- */
  /* 1. Components — which people are joined to which                  */
  /* ---------------------------------------------------------------- */

  const parent = new Map(ids.map((id) => [id, id]));
  const find = (a: string): string => {
    let root = a;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(a) !== root) {
      const next = parent.get(a)!;
      parent.set(a, root);
      a = next;
    }
    return root;
  };
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const id of ids) {
    for (const p of parentsOf(id)) join(id, p);
  }
  for (const u of Object.values(src.unions)) {
    const members = [...u.partners, ...u.childIds].filter((m) => src.people[m]);
    for (let i = 1; i < members.length; i++) join(members[0], members[i]);
  }

  /* ---------------------------------------------------------------- */
  /* 2. Generations                                                    */
  /* ---------------------------------------------------------------- */

  const gen = new Map(ids.map((id) => [id, 0]));

  // Monotone: a value only ever rises, so this terminates even if the draft
  // contains a parent cycle (which checkDraft reports separately — the
  // drawing still has to come out rather than hanging the browser).
  for (let pass = 0; pass < ids.length + 4; pass++) {
    let changed = false;

    for (const id of ids) {
      const ps = parentsOf(id);
      if (!ps.length) continue;
      const want = Math.max(...ps.map((p) => gen.get(p)!)) + 1;
      if (gen.get(id)! < want) {
        gen.set(id, want);
        changed = true;
      }
    }

    for (const u of Object.values(src.unions)) {
      const partners = u.partners.filter((p) => src.people[p]);
      if (partners.length < 2) continue;
      const want = Math.max(...partners.map((p) => gen.get(p)!));
      for (const p of partners) {
        if (gen.get(p)! < want) {
          gen.set(p, want);
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  // Each family starts at its own row zero, so two unconnected households do
  // not float at different heights for no reason a reader could name.
  const minByComponent = new Map<string, number>();
  for (const id of ids) {
    const root = find(id);
    const g = gen.get(id)!;
    if (g < (minByComponent.get(root) ?? Infinity)) minByComponent.set(root, g);
  }
  for (const id of ids) gen.set(id, gen.get(id)! - minByComponent.get(find(id))!);

  /* ---------------------------------------------------------------- */
  /* 3. Order within each row                                          */
  /* ---------------------------------------------------------------- */

  const rows = new Map<number, string[]>();
  const placed = new Set<string>();
  const expanded = new Set<string>();

  const place = (id: string) => {
    if (placed.has(id) || !src.people[id]) return;
    placed.add(id);
    const g = gen.get(id)!;
    const row = rows.get(g) ?? [];
    row.push(id);
    rows.set(g, row);
  };

  const visit = (id: string) => {
    place(id);
    if (expanded.has(id) || !src.people[id]) return;
    expanded.add(id);

    // Partners first, so a couple ends up side by side in the row.
    for (const u of unionsOf(id)) {
      for (const q of u.partners) if (q !== id) place(q);
    }
    // Then the children of each marriage in turn, which keeps half-siblings
    // in their own group rather than interleaved.
    for (const u of unionsOf(id)) {
      for (const c of childrenOfUnion(u.id)) visit(c);
    }
  };

  const componentOrder = new Map<string, number>();
  const birth = (id: string) => src.people[id]?.birthYear ?? 9999;
  const rootCandidates = ids
    .filter((id) => parentsOf(id).length === 0)
    .sort((a, b) => birth(a) - birth(b) || a.localeCompare(b));

  let nextComponent = 0;
  for (const id of [...rootCandidates, ...ids]) {
    const root = find(id);
    if (!componentOrder.has(root)) componentOrder.set(root, nextComponent++);
  }

  const roots = rootCandidates.sort(
    (a, b) =>
      componentOrder.get(find(a))! - componentOrder.get(find(b))! ||
      birth(a) - birth(b) ||
      a.localeCompare(b),
  );

  for (const r of roots) visit(r);
  // Anyone the walk could not reach — a lone row, or a family whose every
  // member has a parent inside the draft because of a cycle.
  for (const id of ids) visit(id);

  const generations = [...rows.keys()].sort((a, b) => a - b);

  /* ---------------------------------------------------------------- */
  /* 4. Horizontal placement                                           */
  /* ---------------------------------------------------------------- */

  const x = new Map<string, number>();
  for (const g of generations) {
    let cursor = 0;
    const row = rows.get(g)!;
    row.forEach((id, i) => {
      if (i > 0) cursor += gapBetween(row[i - 1], id);
      x.set(id, cursor);
      cursor += CARD_W;
    });
  }

  function samePair(a: string, b: string): boolean {
    return unionsOf(a).some(
      (u) => u.partners.includes(b) && u.partners.length === 2,
    );
  }

  function gapBetween(a: string, b: string): number {
    if (find(a) !== find(b)) return COMPONENT_GAP;
    return samePair(a, b) ? SPOUSE_GAP : H_GAP;
  }

  const centre = (id: string) => x.get(id)! + CARD_W / 2;

  /** Where a couple's junction sits, horizontally. */
  const junctionCentre = (unionId: string): number | undefined => {
    const u = src.unions[unionId];
    if (!u) return undefined;
    const partners = u.partners.filter((p) => src.people[p] && x.has(p));
    if (!partners.length) return undefined;
    const xs = partners.map(centre);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  /**
   * Nudge a row towards where each card wants to be, then push left to right
   * until nothing overlaps. Order inside the row never changes, so the result
   * is stable — the draft does not reshuffle itself as somebody types.
   */
  const settle = (g: number, want: Map<string, number>) => {
    const row = rows.get(g);
    if (!row?.length) return;

    const next = row.map((id) => want.get(id) ?? x.get(id)!);
    for (let i = 1; i < row.length; i++) {
      const floor = next[i - 1] + CARD_W + gapBetween(row[i - 1], row[i]);
      if (next[i] < floor) next[i] = floor;
    }

    // Pushing right to resolve a collision drags the row off the centre it
    // asked for. Half the average error is given back, which converges
    // without the oscillation a full correction causes.
    let error = 0;
    let counted = 0;
    row.forEach((id, i) => {
      const target = want.get(id);
      if (target === undefined) return;
      error += next[i] - target;
      counted += 1;
    });
    const shift = counted ? -(error / counted) / 2 : 0;

    row.forEach((id, i) => x.set(id, next[i] + shift));
  };

  for (let pass = 0; pass < REFINE_PASSES; pass++) {
    // Downward: a child hangs under the junction of the couple it belongs to.
    for (const g of generations) {
      const want = new Map<string, number>();
      for (const id of rows.get(g)!) {
        const unionId = src.childUnion[id];
        const jx = unionId ? junctionCentre(unionId) : undefined;
        if (jx !== undefined) want.set(id, jx - CARD_W / 2);
      }
      settle(g, want);
    }

    // Upward: a couple sits over the middle of their children.
    for (const g of [...generations].reverse()) {
      const want = new Map<string, number>();
      for (const id of rows.get(g)!) {
        const targets: number[] = [];
        for (const u of unionsOf(id)) {
          const kids = childrenOfUnion(u.id).filter((c) => x.has(c));
          if (!kids.length) continue;
          const mid =
            (Math.min(...kids.map(centre)) + Math.max(...kids.map(centre))) / 2;

          const partners = u.partners.filter((p) => src.people[p]);
          if (partners.length === 2) {
            // Centre the *pair* over the children, not each partner.
            const order = [...partners].sort((a, b) => x.get(a)! - x.get(b)!);
            const offset =
              order[0] === id
                ? -(CARD_W + SPOUSE_GAP) / 2
                : (CARD_W + SPOUSE_GAP) / 2;
            targets.push(mid + offset - CARD_W / 2);
          } else {
            targets.push(mid - CARD_W / 2);
          }
        }
        if (targets.length) {
          want.set(id, targets.reduce((a, b) => a + b, 0) / targets.length);
        }
      }
      settle(g, want);
    }
  }

  /* ---------------------------------------------------------------- */
  /* 5. Nodes and connectors                                           */
  /* ---------------------------------------------------------------- */

  const nodes: LayoutNode[] = [];
  const links: LayoutLink[] = [];
  const byId = new Map<string, LaidOutPerson>();

  for (const g of generations) {
    for (const id of rows.get(g)!) {
      const node: LaidOutPerson = {
        kind: "person",
        id,
        person: src.people[id],
        x: x.get(id)!,
        y: g * ROW_H,
        w: CARD_W,
        h: CARD_H,
        row: g,
        isFocus: false,
        isSpouse: false,
      };
      nodes.push(node);
      byId.set(id, node);
    }
  }

  const junctions: DraftJunction[] = [];

  for (const u of Object.values(src.unions)) {
    const partners = u.partners.filter((p) => byId.has(p));
    if (!partners.length) continue;

    const kids = childrenOfUnion(u.id).filter((c) => byId.has(c));
    const rowY = Math.max(...partners.map((p) => byId.get(p)!.y));
    const jy = rowY + CARD_H + JUNCTION_DROP;
    const jx =
      (Math.min(...partners.map(centre)) + Math.max(...partners.map(centre))) /
      2;

    if (partners.length === 2) {
      const [a, b] = [...partners].sort((p, q) => x.get(p)! - x.get(q)!);
      nodes.push({
        kind: "junction",
        id: `j-${u.id}`,
        unionId: u.id,
        x: jx,
        y: jy,
        row: rowY / ROW_H,
        status: u.status,
        year: u.year,
      } satisfies LaidOutJunction);

      links.push({
        id: `m-${u.id}`,
        kind: "marriage",
        unionId: u.id,
        points: [
          { x: centre(a), y: byId.get(a)!.y + CARD_H },
          { x: centre(a), y: jy },
          { x: centre(b), y: jy },
          { x: centre(b), y: byId.get(b)!.y + CARD_H },
        ],
      });
    }

    junctions.push({
      unionId: u.id,
      x: jx,
      y: partners.length === 2 ? jy : rowY + CARD_H,
      partners,
      childIds: kids,
    });

    if (!kids.length) continue;

    // One bus per marriage, just above the topmost child, so siblings read as
    // a set and two marriages never share a line.
    const topChildY = Math.min(...kids.map((c) => byId.get(c)!.y));
    const busY = topChildY - V_GAP / 2 + 12;
    const from = { x: jx, y: partners.length === 2 ? jy : rowY + CARD_H };

    for (const kid of kids) {
      const node = byId.get(kid)!;
      links.push({
        id: `d-${u.id}-${kid}`,
        kind: "descent",
        unionId: u.id,
        childId: kid,
        points: [
          from,
          { x: from.x, y: busY },
          { x: centre(kid), y: busY },
          { x: centre(kid), y: node.y },
        ],
      });
    }
  }

  const xs = nodes.flatMap((n) =>
    n.kind === "person" ? [n.x, n.x + n.w] : [n.x - 8, n.x + 8],
  );
  const ys = nodes.flatMap((n) =>
    n.kind === "person" ? [n.y, n.y + n.h] : [n.y - 8, n.y + 8],
  );

  const PAD = 90;
  return {
    nodes,
    links,
    people: [...byId.values()],
    byId,
    junctions,
    components: new Set(ids.map(find)).size,
    bounds: {
      minX: Math.min(...xs) - PAD,
      minY: Math.min(...ys) - PAD,
      maxX: Math.max(...xs) + PAD,
      maxY: Math.max(...ys) + PAD,
    },
  };
}
