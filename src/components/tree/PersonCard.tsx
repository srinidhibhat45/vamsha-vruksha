import { memo } from "react";
import { CARD_H, CARD_W, type LaidOutPerson } from "@/lib/layout";

/**
 * A card in the tree.
 *
 * Drawn as raw SVG rather than a foreignObject: a large lineage puts several
 * hundred of these on screen at once, and HTML-in-SVG forces a layout pass per
 * node on every pan. Text is truncated by measurement against an average glyph
 * width, which is accurate enough for names at this size and costs nothing.
 *
 * The card shows only what a reader needs to recognise a person — name,
 * dates, and one line of lineage detail. Everything else lives in the detail
 * panel, one click away. A card that tried to show gotra, matha, kuladevata,
 * village and occupation would be unreadable at the zoom level where you can
 * see a whole family.
 *
 * ------------------------------------------------------------------
 * What this card stopped doing, and why.
 *
 * It used to spell out how well attested a person was — a dot plus the words
 * "Corroborated by family" — on a strip under a rule along the bottom edge.
 * Five words of eight-point type is nothing you can read at the zoom level
 * where a tree is worth looking at, so all it did was fill the card's white
 * space with grey and give the eye a second horizontal rule to trip over.
 * Attestation is now one dot in the bottom corner: the same fact, carrying
 * its words in a tooltip, explained once in the key, and legible as a colour
 * at any zoom.
 *
 * The sex band went the same way. A eleven-pixel slab of colour down the
 * leading edge is a fifth of the card, which put more weight on the one fact
 * nobody is scanning for than on the name. It is now a four-pixel indicator
 * inset from the edge, in Material's leading-indicator position, and the
 * monogram carries the same colour — so the signal survives at a fraction of
 * the ink.
 */

// Archivo at these weights. Slightly wider than the previous face, so the
// truncation estimate had to come up with it or names would overrun.
const AVG_CHAR = 0.55;
const AVG_CHAR_DISPLAY = 0.48; // Newsreader is narrower.

function truncate(
  text: string,
  maxPx: number,
  fontPx: number,
  ratio = AVG_CHAR,
): string {
  const max = Math.floor(maxPx / (fontPx * ratio));
  if (text.length <= max) return text;
  return text.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
}

export interface CardState {
  isSelected: boolean;
  isHovered: boolean;
  /** Dimmed because a search is active and this card does not match. */
  isDimmed: boolean;
  /** On the highlighted path between two people. */
  isOnPath: boolean;
  /** Reached by the keyboard, so it needs a ring a mouse user never sees. */
  isKeyboardFocus?: boolean;
}

function genderColor(gender: string): string {
  if (gender === "F") return "var(--color-kumkum)";
  if (gender === "M") return "var(--color-samudra)";
  return "var(--color-gold)";
}

const CONFIDENCE_TEXT: Record<string, string> = {
  verified: "Documented",
  attested: "Corroborated by family",
  oral: "Family memory",
  unverified: "Unverified",
};

/* One grid, written down once. Every y below is a baseline on it. */
const PAD_X = 14;
const RADIUS = 14;
const MONO_R = 15;
const MONO_CX = 33;
const MONO_CY = 31;
const TEXT_X = MONO_CX + MONO_R + 9; // 57
const NAME_Y = 30;
const YEARS_Y = 47;
const DETAIL_Y = 70;

export const PersonCard = memo(function PersonCard({
  node,
  state,
  onSelect,
  onReRoot,
}: {
  node: LaidOutPerson;
  state: CardState;
  onSelect: (id: string) => void;
  onReRoot: (id: string) => void;
}) {
  const p = node.person;
  const { isSelected, isHovered, isDimmed, isOnPath, isKeyboardFocus } = state;

  const years =
    p.birthYear && p.deathYear
      ? `${p.birthYear}–${p.deathYear}`
      : p.birthYear
        ? p.living
          ? `b. ${p.birthYear}`
          : `${p.birthYear}–`
        : p.deathYear
          ? `d. ${p.deathYear}`
          : "dates unknown";

  const detail =
    p.epithet ??
    [p.gotraLabel && `${p.gotraLabel} gotra`, p.moolLabel]
      .filter(Boolean)
      .join(" · ");

  const accent = genderColor(p.gender);
  const emphasised = node.isFocus || isSelected || isOnPath;
  const strokeColor = node.isFocus
    ? "var(--accent)"
    : isSelected || isOnPath
      ? "var(--color-gold)"
      : "var(--line-strong)";
  const strokeWidth = node.isFocus ? 1.8 : isSelected || isOnPath ? 1.4 : 1;

  const initials =
    ((p.given?.[0] ?? p.name[0] ?? "?") + (p.surname?.[0] ?? "")).toUpperCase();

  const confidenceText =
    (p.confidence && CONFIDENCE_TEXT[p.confidence]) || "Unverified";
  const confidenceFill =
    p.confidence === "verified"
      ? "var(--color-tulsi)"
      : p.confidence === "attested"
        ? "var(--color-gold)"
        : "none";
  const confidenceStroke =
    p.confidence === "verified"
      ? "var(--color-tulsi)"
      : p.confidence === "attested"
        ? "var(--color-gold)"
        : "var(--fg-faint)";

  return (
    <g
      className="tree-card"
      transform={`translate(${node.x} ${node.y})`}
      opacity={isDimmed ? 0.22 : 1}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(p.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReRoot(p.id);
      }}
      style={{ cursor: "pointer" }}
      aria-hidden="true"
    >
      {(node.isFocus || isKeyboardFocus) && (
        <rect
          className={isKeyboardFocus ? undefined : "tree-focus-ring"}
          x={-5}
          y={-5}
          width={CARD_W + 10}
          height={CARD_H + 10}
          rx={RADIUS + 5}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={isKeyboardFocus ? 3 : 1.5}
          opacity={isKeyboardFocus ? 1 : 0.5}
        />
      )}

      <rect
        width={CARD_W}
        height={CARD_H}
        rx={RADIUS}
        fill="var(--bg-raised)"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{
          filter:
            isHovered || isSelected
              ? "drop-shadow(0 6px 14px rgb(0 0 0 / 0.15))"
              : "drop-shadow(0 1px 2px rgb(0 0 0 / 0.07))",
        }}
      />

      {/* Leading indicator. Sex, at four pixels — enough to sort a row of
          cards by eye, not enough to be the first thing you see. It is never
          the only signal: the panel and the full record both say it in
          words. */}
      <rect
        x={3}
        y={13}
        width={4}
        height={CARD_H - 26}
        rx={2}
        fill={accent}
        opacity={0.9}
      />

      {/* Monogram. No stock silhouettes: an initial is honest about the fact
          that we have no picture, where a generic avatar is not. */}
      <circle
        cx={MONO_CX}
        cy={MONO_CY}
        r={MONO_R}
        /* Same mix variables the HTML monogram uses, so a card and the
           panel that opens from it are never two different greens. */
        fill={`color-mix(in oklab, ${accent} var(--facet-fill), var(--bg-inset))`}
        stroke={`color-mix(in oklab, ${accent} var(--facet-edge), transparent)`}
        strokeWidth={1}
      />
      <text
        x={MONO_CX}
        y={MONO_CY + 4.5}
        textAnchor="middle"
        fontSize={12.5}
        fontWeight={500}
        fill={`color-mix(in oklab, ${accent} var(--facet-ink), var(--fg))`}
        style={{ userSelect: "none", fontFamily: "var(--font-display)" }}
      >
        {initials}
      </text>

      <text
        x={TEXT_X}
        y={NAME_Y}
        fontSize={14.5}
        fontWeight={emphasised ? 600 : 500}
        fill="var(--fg)"
        style={{
          userSelect: "none",
          fontFamily: "var(--font-display)",
        }}
      >
        {truncate(p.name, CARD_W - TEXT_X - PAD_X, 14.5, AVG_CHAR_DISPLAY)}
      </text>

      <text
        x={TEXT_X}
        y={YEARS_Y}
        fontSize={11}
        fill="var(--fg-soft)"
        style={{ userSelect: "none", letterSpacing: "0.01em" }}
      >
        {years}
      </text>

      {detail && (
        <text
          x={PAD_X}
          y={DETAIL_Y}
          fontSize={10}
          fill="var(--fg-faint)"
          style={{ userSelect: "none" }}
        >
          {/* Room left at the right end for the attestation dot. */}
          {truncate(detail, CARD_W - PAD_X * 2 - 18, 10)}
        </text>
      )}

      {/* How well attested, as one dot in the corner. The words are in the
          tooltip and in the key; the colour is the thing that survives being
          seen at a quarter scale. */}
      <g transform={`translate(${CARD_W - 15} ${DETAIL_Y - 3.5})`}>
        <title>{confidenceText}</title>
        <circle
          r={4}
          fill={confidenceFill}
          stroke={confidenceStroke}
          strokeWidth={1.2}
        />
      </g>

      {/* A lit lamp, top corner, for someone living. */}
      {p.living && (
        <g transform={`translate(${CARD_W - 24} 12)`} opacity={0.95}>
          <title>Living</title>
          <path
            d="M5 0c1.9 2.2 2.9 3.8 2.9 5.1A2.9 2.9 0 0 1 5 8a2.9 2.9 0 0 1-2.9-2.9C2.1 3.8 3.1 2.2 5 0z"
            fill="var(--color-haldi)"
          />
          <path
            d="M0 9.5h10c-.5 1.5-2.5 2.5-5 2.5s-4.5-1-5-2.5z"
            fill="var(--color-haldi)"
            opacity={0.5}
          />
        </g>
      )}

      {/* Branches the depth limit is hiding. */}
      {!!node.hiddenChildren && (
        <g
          transform={`translate(${CARD_W / 2 - 23} ${CARD_H + 7})`}
          onClick={(e) => {
            e.stopPropagation();
            onReRoot(p.id);
          }}
        >
          <rect
            width={46}
            height={20}
            rx={10}
            fill="var(--bg-raised)"
            stroke="var(--line-strong)"
          />
          <text
            x={23}
            y={13.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight={500}
            fill="var(--fg-soft)"
            style={{ userSelect: "none" }}
          >
            +{node.hiddenChildren}
          </text>
          <title>{`${node.hiddenChildren} more children — click to open this branch`}</title>
        </g>
      )}

      {!!node.hiddenParents && (
        <g
          transform={`translate(${CARD_W / 2 - 23} ${-27})`}
          onClick={(e) => {
            e.stopPropagation();
            onReRoot(p.id);
          }}
        >
          <rect
            width={46}
            height={20}
            rx={10}
            fill="var(--bg-raised)"
            stroke="var(--line-strong)"
          />
          <text
            x={23}
            y={13.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight={500}
            fill="var(--fg-soft)"
            style={{ userSelect: "none" }}
          >
            ↑{node.hiddenParents}
          </text>
          <title>More ancestors recorded — click to open</title>
        </g>
      )}
    </g>
  );
});
