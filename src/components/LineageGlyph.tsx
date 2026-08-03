/**
 * A family's own shape, drawn small.
 *
 * The home page needs to show a handful of lineages, and the honest thing to
 * put beside each one is not a stock icon — every line would get the same
 * picture — but the thing that actually differs between them: how many
 * generations deep the records run and how wide the family got in each. A line
 * that is nine generations of two brothers looks nothing like one that is five
 * generations of eleven children, and this is the only place on the site where
 * you can see that without opening the tree.
 *
 * It is a portrait, not a chart. Row widths are proportional but the dot count
 * is capped, so a generation of sixty does not become sixty dots — the point is
 * the silhouette, and the exact figures are printed beside it in the entry.
 */

/** Widest a generation is drawn, however many people are actually in it. */
const MAX_DOTS = 7;
/** Deepest drawn. Beyond this the rows crush together and read as a smudge. */
const MAX_ROWS = 7;

const W = 104;
const H = 60;
const PAD_X = 7;
const PAD_Y = 7;

export function LineageGlyph({
  profile,
  className = "",
}: {
  /** How many people sit in each generation, oldest first. */
  profile: number[];
  className?: string;
}) {
  const rows = profile.filter((n) => n > 0).slice(0, MAX_ROWS);
  if (rows.length < 2) return null;

  const widest = Math.max(...rows);

  /* Each row's dots, laid out across a width proportional to how big that
     generation really was — so the widest generation spans the glyph and a
     lone founder sits as one dot in the middle. */
  const points = rows.map((count, row) => {
    const dots = Math.max(1, Math.min(MAX_DOTS, Math.round((count / widest) * MAX_DOTS)));
    const span = ((W - PAD_X * 2) * count) / widest;
    const left = (W - span) / 2;
    const y =
      rows.length === 1
        ? H / 2
        : PAD_Y + (row * (H - PAD_Y * 2)) / (rows.length - 1);

    return Array.from({ length: dots }, (_, i) => ({
      x: dots === 1 ? W / 2 : left + (i * span) / (dots - 1),
      y,
    }));
  });

  /* Every dot hangs off the nearest one in the generation above it, which is
     what makes the figure branch outward rather than read as stacked bars. */
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let row = 1; row < points.length; row++) {
    for (const child of points[row]) {
      const parent = points[row - 1].reduce((best, p) =>
        Math.abs(p.x - child.x) < Math.abs(best.x - child.x) ? p : best,
      );
      edges.push({ x1: parent.x, y1: parent.y, x2: child.x, y2: child.y });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.45">
        {edges.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
        ))}
      </g>
      <g fill="currentColor">
        {points.flatMap((row, r) =>
          row.map((p, i) => (
            /* The apex generation is drawn heavier — it is the one the entry
               names, and the eye should land on it first. */
            <circle key={`${r}-${i}`} cx={p.x} cy={p.y} r={r === 0 ? 2.6 : 1.8} />
          )),
        )}
      </g>
    </svg>
  );
}
