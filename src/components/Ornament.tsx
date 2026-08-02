/**
 * Ornamental marks used across the site.
 *
 * All drawn as inline SVG with `currentColor` so they inherit type colour and
 * work in both themes without a second asset. Purely decorative marks are
 * hidden from assistive technology.
 */

export function TreeMark({ className = "" }: { className?: string }) {
  // A banyan-like tree over a lamp base — the archive's wordmark glyph.
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M16 27V14" />
      <path d="M16 18.5c-2.6-.6-4.4-2-5.2-4.2M16 18.5c2.6-.6 4.4-2 5.2-4.2" />
      <path d="M16 23c-3.6-.5-6.2-2.2-7.6-4.8M16 23c3.6-.5 6.2-2.2 7.6-4.8" />
      <circle cx="16" cy="8.6" r="4.2" />
      <circle cx="8.6" cy="12.4" r="3.1" />
      <circle cx="23.4" cy="12.4" r="3.1" />
      <path d="M11 28h10" strokeWidth="1.8" />
      <path d="M12.6 28c.5-1.2 1.7-1.9 3.4-1.9s2.9.7 3.4 1.9" />
    </svg>
  );
}

/** A kasti-border style horizontal rule with a diamond at the centre. */
export function KastiRule({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 text-[var(--line-strong)] ${className}`}
      aria-hidden="true"
    >
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-current" />
      <svg viewBox="0 0 44 12" className="h-3 w-11" fill="none" stroke="currentColor">
        <path d="M4 6h9M31 6h9" strokeWidth="1" />
        <path d="M22 1.5 26.5 6 22 10.5 17.5 6z" strokeWidth="1" />
        <circle cx="22" cy="6" r="1.1" fill="currentColor" stroke="none" />
      </svg>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-current" />
    </div>
  );
}

/** Temple-arch silhouette used as a section cap and behind the hero. */
export function TempleArch({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 160"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
    >
      <path d="M60 4 66 16H54z" />
      <path d="M60 16v10" />
      <path d="M24 156V72c0-19.9 16.1-36 36-36s36 16.1 36 36v84" />
      <path d="M34 156V74c0-14.4 11.6-26 26-26s26 11.6 26 26v82" />
      <path d="M44 156V78c0-8.8 7.2-16 16-16s16 7.2 16 16v78" />
      <path d="M14 156h92" strokeWidth="1.4" />
      <path d="M20 148h80M26 140h68" opacity="0.5" />
    </svg>
  );
}

/**
 * A tulsi vrindavan — the basil plinth that stands in the courtyard of almost
 * every Konkani household. Used on the contribute page.
 */
export function Vrindavan({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 96"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M40 40c-4 0-7-3-7-7M40 40c4 0 7-3 7-7M40 40V22" />
      <path d="M40 26c-3.4-1-5.6-3.4-6.4-7M40 26c3.4-1 5.6-3.4 6.4-7" />
      <path d="M26 44h28v10H26z" />
      <path d="M22 54h36v30H22z" />
      <path d="M18 84h44v8H18z" />
      <path d="M30 62h6v8h-6zM44 62h6v8h-6z" opacity="0.55" />
    </svg>
  );
}

/** Small deepa (oil lamp) flame — marks living people in legends. */
export function Deepa({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d="M8 2.4c1.7 2 2.6 3.4 2.6 4.7A2.6 2.6 0 0 1 8 9.7a2.6 2.6 0 0 1-2.6-2.6c0-1.3.9-2.7 2.6-4.7z"
        fill="currentColor"
      />
      <path
        d="M2.6 11.4h10.8c-.5 1.6-2.6 2.6-5.4 2.6s-4.9-1-5.4-2.6z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Mandala                                                             */
/* ------------------------------------------------------------------ */

/**
 * One petal of a mandala ring: a lens drawn between an inner and an outer
 * radius along a single spoke, bulging by `k` either side of it.
 */
function petal(angle: number, r0: number, r1: number, k: number): string {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const mid = (r0 + r1) / 2;
  // Unit normal to the spoke — the direction the petal swells in.
  const nx = -sin;
  const ny = cos;
  const x0 = cos * r0;
  const y0 = sin * r0;
  const x1 = cos * r1;
  const y1 = sin * r1;
  const ax = cos * mid + nx * k;
  const ay = sin * mid + ny * k;
  const bx = cos * mid - nx * k;
  const by = sin * mid - ny * k;
  return `M${x0} ${y0} Q${ax} ${ay} ${x1} ${y1} Q${bx} ${by} ${x0} ${y0}`;
}

function ring(count: number, r0: number, r1: number, k: number, offset = 0) {
  return Array.from({ length: count }, (_, i) =>
    petal((i / count) * Math.PI * 2 + offset, r0, r1, k),
  );
}

function dots(count: number, r: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + offset;
    return { cx: Math.cos(a) * r, cy: Math.sin(a) * r };
  });
}

/**
 * A full mandala — concentric rings of lotus petals over a dotted lattice,
 * the way one is actually laid out: an even fold count, every ring rotated
 * half a step against the one inside it, and a bindu at the centre.
 *
 * Built to sit *behind* content at low opacity, so nothing here is stroked
 * heavier than a hairline and the whole thing is one `currentColor`. The
 * geometry is computed rather than hand-drawn, which is why it stays sharp at
 * any size and costs about two kilobytes.
 */
export function Mandala({
  className = "",
  folds = 16,
}: {
  className?: string;
  folds?: number;
}) {
  const half = Math.PI / folds;

  return (
    <svg
      viewBox="-200 -200 400 400"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.9">
        {/* Outer boundary — three concentric hairlines, the outermost broken
            into a dotted lattice the way a kolam border is. */}
        <circle r="196" strokeDasharray="1 6" opacity="0.55" />
        <circle r="186" opacity="0.4" />
        <circle r="150" opacity="0.5" />
        <circle r="112" opacity="0.55" strokeDasharray="3 5" />
        <circle r="74" opacity="0.6" />
        <circle r="38" opacity="0.7" />

        {/* Outer lotus — the widest ring, half-stepped against the next. */}
        {ring(folds * 2, 150, 186, 9, half / 2).map((d, i) => (
          <path key={`o${i}`} d={d} opacity="0.5" />
        ))}

        {/* Middle lotus. */}
        {ring(folds, 112, 150, 20, 0).map((d, i) => (
          <path key={`m${i}`} d={d} opacity="0.75" />
        ))}

        {/* Inner lotus, rotated half a fold so its tips sit between the
            middle ring's. */}
        {ring(folds, 74, 112, 15, half).map((d, i) => (
          <path key={`i${i}`} d={d} opacity="0.6" />
        ))}

        {/* Heart of the mandala. */}
        {ring(folds / 2, 38, 74, 13, 0).map((d, i) => (
          <path key={`c${i}`} d={d} opacity="0.85" />
        ))}
        {ring(folds / 2, 10, 38, 8, half).map((d, i) => (
          <path key={`h${i}`} d={d} opacity="0.7" />
        ))}

        {/* Spokes, running only through the empty band, so they read as
            structure rather than as a wheel. */}
        {Array.from({ length: folds }, (_, i) => {
          const a = (i / folds) * Math.PI * 2;
          return (
            <line
              key={`s${i}`}
              x1={Math.cos(a) * 186}
              y1={Math.sin(a) * 186}
              x2={Math.cos(a) * 196}
              y2={Math.sin(a) * 196}
              opacity="0.45"
            />
          );
        })}
      </g>

      <g fill="currentColor">
        {dots(folds * 4, 168, half / 2).map((d, i) => (
          <circle key={`d1${i}`} cx={d.cx} cy={d.cy} r="1.5" opacity="0.4" />
        ))}
        {dots(folds, 131, half).map((d, i) => (
          <circle key={`d2${i}`} cx={d.cx} cy={d.cy} r="2" opacity="0.5" />
        ))}
        {dots(folds / 2, 93, 0).map((d, i) => (
          <circle key={`d3${i}`} cx={d.cx} cy={d.cy} r="2.4" opacity="0.55" />
        ))}
        {/* Bindu. */}
        <circle r="5" opacity="0.8" />
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Facet marks                                                         */
/*                                                                     */
/* One glyph per lineage field. They exist so the four indexes stop     */
/* being four identical cards: a reader who has been to the gotra index */
/* once can find it again by its mark without reading a word.           */
/* ------------------------------------------------------------------ */

function facetSvg(children: React.ReactNode, className: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A palm-leaf manuscript strip — where a name was first written down. */
export function SurnameMark({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M3 7.5c3-1.6 15-1.6 18 0v9c-3-1.6-15-1.6-18 0z" />
      <path d="M6.5 11h11M6.5 14h7" opacity="0.7" />
      <circle cx="12" cy="4.4" r="1.1" />
    </>,
    className,
  );
}

/** The sacred thread, looped — a line that passes father to child. */
export function GotraMark({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M12 3.2 20 18.4H4z" />
      <path d="M12 7.4 16.9 17H7.1z" opacity="0.55" />
      <circle cx="12" cy="20.8" r="1.2" />
    </>,
    className,
  );
}

/** A shrine with its lamp lit — the household deity and its temple. */
export function KuladevataMark({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M4 20.5h16" strokeWidth="1.7" />
      <path d="M6 20.5V11c0-3.3 2.7-6 6-6s6 2.7 6 6v9.5" />
      <path d="M12 5V2.6" />
      <path d="M12 10.2c1.3 1.5 2 2.6 2 3.5a2 2 0 1 1-4 0c0-.9.7-2 2-3.5z" fill="currentColor" stroke="none" />
      <path d="M9 17.6h6" opacity="0.6" />
    </>,
    className,
  );
}

/** A coconut palm over a tiled roof, at the waterline. */
export function MoolMark({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M7 20.5v-6l4-3 4 3v6" />
      <path d="M4.5 14.5 11 9.3l6.5 5.2" />
      <path d="M19 20.5V9.5" />
      <path d="M19 9.5c0-1.6 1-2.6 2.6-2.8M19 9.5c0-1.6-1-2.6-2.6-2.8M19 9.5c.4-1.6 1.4-2.4 3-2.4" opacity="0.8" />
      <path d="M3 20.5h18" strokeWidth="1.7" />
    </>,
    className,
  );
}

/* ------------------------------------------------------------------ */
/* Section marks                                                       */
/*                                                                     */
/* One per section of the front page, so six stacked bands of prose     */
/* stop reading as one. Each says something about its section rather    */
/* than being a decorative bullet.                                     */
/* ------------------------------------------------------------------ */

/** Memory draining away — the section on what gets lost first. */
export function MarkHourglass({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M6.5 3h11M6.5 21h11" strokeWidth="1.7" />
      <path d="M8 3v3.2c0 2 4 3.9 4 5.8s-4 3.8-4 5.8V21" />
      <path d="M16 3v3.2c0 2-4 3.9-4 5.8s4 3.8 4 5.8V21" />
      <path d="M9.6 18.6c.4-1.3 1.4-2 2.4-2s2 .7 2.4 2z" fill="currentColor" stroke="none" />
    </>,
    className,
  );
}

/** A key ring — the section on the four ways into the archive. */
export function MarkKeys({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <circle cx="8" cy="8" r="4.2" />
      <path d="M11 11 20 20" />
      <path d="M17.2 17.2 15 19.4M19.1 19.1 17 21.2" />
    </>,
    className,
  );
}

/** A branching line — the section listing connected family lines. */
export function MarkBranch({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M12 21v-6" />
      <path d="M12 15 6.5 9.5M12 15l5.5-5.5" />
      <circle cx="5.6" cy="7.6" r="2.1" />
      <circle cx="18.4" cy="7.6" r="2.1" />
      <circle cx="12" cy="3.6" r="2.1" />
      <path d="M12 15V5.7" opacity="0.5" />
    </>,
    className,
  );
}

/** A sheet with a seal — the section saying where a record came from. */
export function MarkSource({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M6 3.5h7.5L18 8v9.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" />
      <path d="M13.2 3.6V8H18" opacity="0.75" />
      <path d="M9 12.5h6M9 15.5h4" opacity="0.7" />
    </>,
    className,
  );
}

/** A quill over a line — the section asking for a contribution. */
export function MarkQuill({ className = "" }: { className?: string }) {
  return facetSvg(
    <>
      <path d="M4 20.5h16" strokeWidth="1.7" />
      <path d="M6.5 17.2c0-6.6 4.4-11.4 12-12.4-.5 7.9-4.6 12.4-12 12.4z" />
      <path d="M9 15c1.9-2.6 4.1-4.4 6.6-5.4" opacity="0.7" />
    </>,
    className,
  );
}

/**
 * A rangoli rosette, drawn from an n-fold lattice. Used as a large, quiet
 * background ornament — the geometry is real (dots joined by arcs) rather than
 * a decorative squiggle.
 */
export function Rangoli({
  className = "",
  petals = 12,
}: {
  className?: string;
  petals?: number;
}) {
  const rings = [
    { r: 34, count: petals, dot: 1.6 },
    { r: 58, count: petals, dot: 1.9 },
    { r: 80, count: petals * 2, dot: 1.4 },
  ];

  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden="true">
      <g stroke="currentColor" fill="none" strokeWidth="0.7" opacity="0.9">
        {Array.from({ length: petals }).map((_, i) => {
          const a = (i / petals) * Math.PI * 2;
          const x = Math.cos(a) * 58;
          const y = Math.sin(a) * 58;
          const cx = Math.cos(a) * 34;
          const cy = Math.sin(a) * 34;
          return (
            <path
              key={i}
              d={`M0 0 Q ${cx + y * 0.42} ${cy - x * 0.42} ${x} ${y} Q ${cx - y * 0.42} ${cy + x * 0.42} 0 0`}
            />
          );
        })}
        <circle r="80" strokeDasharray="2 5" />
        <circle r="92" strokeDasharray="1 7" opacity="0.6" />
      </g>
      <g fill="currentColor">
        {rings.map((ring) =>
          Array.from({ length: ring.count }).map((_, i) => {
            const a = (i / ring.count) * Math.PI * 2;
            return (
              <circle
                key={`${ring.r}-${i}`}
                cx={Math.cos(a) * ring.r}
                cy={Math.sin(a) * ring.r}
                r={ring.dot}
              />
            );
          }),
        )}
        <circle r="3" />
      </g>
    </svg>
  );
}
