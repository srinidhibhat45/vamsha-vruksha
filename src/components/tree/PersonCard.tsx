import { memo } from "react";
import { CARD_H, CARD_W, type LaidOutPerson } from "@/lib/layout";

/**
 * A card in the tree.
 *
 * Drawn as raw SVG rather than a foreignObject: a large lineage puts several
 * hundred of these on screen at once, and HTML-in-SVG forces a layout pass per
 * node on every pan.
 *
 * ------------------------------------------------------------------
 * Why the card looks the way it does.
 *
 * A card in a tree is read at a glance, from a distance, while the reader is
 * looking for a name — so it carries a name, when they lived, and nothing
 * else that every other card on screen also says. Within one lineage the
 * gotra and the mool village are the same on every card, and printing them
 * three hundred times is not information, it is texture. The third line
 * therefore appears only when a person *departs* from the family's own
 * baseline — a wife who married in from another village, a branch that
 * changed matha — or when they have an epithet worth the space. The baseline
 * itself is stated once, in the key, where it is read once.
 *
 * Text is truncated by a weighted per-character estimate rather than a flat
 * average width, because a flat average is wrong in both directions at once:
 * it lets "Waman Waman Kamath" run past the card edge and cuts "Lilabai" that
 * had room to spare. The estimate is deliberately a little pessimistic, and a
 * clip path over the text column makes overrun impossible rather than
 * unlikely.
 * ------------------------------------------------------------------
 */

/*
 * Per-character widths as a fraction of the font size. Real metrics for
 * Archivo and Newsreader, rounded up: an M is not an i, and a name is mostly
 * the letters a flat average is worst at.
 */
function textWidth(text: string, fontPx: number, base: number): number {
  let units = 0;
  for (const ch of text) {
    if (" .,:;'’!|iltIjf".includes(ch)) units += 0.42;
    else if ("rt()[]-–…".includes(ch)) units += 0.62;
    else if ("mwMW".includes(ch)) units += 1.42;
    else if (ch >= "A" && ch <= "Z") units += 1.12;
    else units += 1;
  }
  return units * base * fontPx;
}

function truncate(
  text: string,
  maxPx: number,
  fontPx: number,
  base: number,
): string {
  if (textWidth(text, fontPx, base) <= maxPx) return text;
  const ellipsisPx = textWidth("…", fontPx, base);
  let used = 0;
  let out = "";
  for (const ch of text) {
    const w = textWidth(ch, fontPx, base);
    if (used + w + ellipsisPx > maxPx) break;
    used += w;
    out += ch;
  }
  return out.trimEnd() + "…";
}

/* Measured against rendered Archivo and Newsreader, then rounded up. */
const BODY = 0.56;
const DISPLAY = 0.6;

/**
 * Fit a name into the name column.
 *
 * Names here are patronymic triples — given name, father's name, surname —
 * and the surname is the part a reader is scanning for, so cutting from the
 * right is the one thing you must not do: "Madhav Waman Kama…" loses the
 * only word that says which family this is. When the full name will not fit,
 * the father's name goes to an initial first, which is how these names are
 * abbreviated on a temple register anyway. An ellipsis is the last resort.
 */
function fitName(name: string, maxPx: number, fontPx: number): string {
  if (textWidth(name, fontPx, DISPLAY) <= maxPx) return name;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    const abbreviated = [
      words[0],
      ...words.slice(1, -1).map((w) => `${w[0]}.`),
      words[words.length - 1],
    ].join(" ");
    if (textWidth(abbreviated, fontPx, DISPLAY) <= maxPx) return abbreviated;

    // Still too long: drop the patronymic outright. Siblings share it, so it
    // is the least identifying word on the card — where the surname is the
    // most, and an ellipsis would eat the surname first.
    const bare = `${words[0]} ${words[words.length - 1]}`;
    if (textWidth(bare, fontPx, DISPLAY) <= maxPx) return bare;
  }
  return truncate(name, maxPx, fontPx, DISPLAY);
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

/** What every card in this tree shares, and therefore need not repeat. */
export interface TreeBaseline {
  gotraLabel?: string;
  moolLabel?: string;
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
const PAD_X = 16;
const RADIUS = 14;
const MONO_R = 17;
const MONO_CX = 38;
const TEXT_X = MONO_CX + MONO_R + 11; // 66
const DETAIL_Y = 81;
const MARK_X = CARD_W - 20; // the dot's own edge lands on the card's padding
const MARK_Y = 77;

/* Shared clip paths, mounted once by the viewer via <TreeCardDefs />. */
const CARD_CLIP_ID = "tree-card-clip";
const TEXT_CLIP_ID = "tree-card-text-clip";

export function TreeCardDefs() {
  return (
    <defs>
      <clipPath id={CARD_CLIP_ID} clipPathUnits="userSpaceOnUse">
        <rect width={CARD_W} height={CARD_H} rx={RADIUS} />
      </clipPath>
      {/* Nothing in the text column may cross the card's right padding. */}
      <clipPath id={TEXT_CLIP_ID} clipPathUnits="userSpaceOnUse">
        <rect width={CARD_W - PAD_X} height={CARD_H} />
      </clipPath>
    </defs>
  );
}

export const PersonCard = memo(function PersonCard({
  node,
  state,
  baseline,
  onSelect,
  onReRoot,
  onExpand,
  openDown,
  openUp,
}: {
  node: LaidOutPerson;
  state: CardState;
  baseline: TreeBaseline;
  onSelect: (id: string) => void;
  onReRoot: (id: string) => void;
  /** Open or close one more layer around this card. */
  onExpand: (which: "up" | "down", id: string) => void;
  openDown: boolean;
  openUp: boolean;
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

  // Only what sets this person apart from the rest of the tree.
  const departures = [
    p.gotraLabel && p.gotraLabel !== baseline.gotraLabel
      ? `${p.gotraLabel} gotra`
      : null,
    p.moolLabel && p.moolLabel !== baseline.moolLabel ? p.moolLabel : null,
  ].filter(Boolean) as string[];

  const detail = p.epithet ?? (departures.length ? departures.join(" · ") : "");

  const accent = genderColor(p.gender);
  const emphasised = node.isFocus || isSelected || isOnPath;
  const strokeColor = node.isFocus
    ? "var(--accent)"
    : isSelected || isOnPath
      ? "var(--color-gold)"
      : "var(--line-strong)";
  const strokeWidth = node.isFocus ? 1.6 : isSelected || isOnPath ? 1.4 : 1;

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

  // Two cards' worth of geometry, one card. With a third line the block sits
  // high and the line hangs below it; without one the block centres, so a
  // two-line card does not read as a three-line card missing its bottom.
  const monoCy = detail ? 34 : 46;
  const nameY = detail ? 32 : 42;
  const yearsY = detail ? 51 : 61;

  return (
    <g
      className="tree-card"
      transform={`translate(${node.x} ${node.y})`}
      opacity={isDimmed ? 0.2 : 1}
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
              ? "drop-shadow(0 6px 16px rgb(0 0 0 / 0.14))"
              : "drop-shadow(0 1px 2px rgb(0 0 0 / 0.06))",
        }}
      />

      {/* Leading indicator. Sex, as a spine flush with the leading edge and
          clipped to the card's own corner, so it reads as part of the card
          rather than as a mark laid on top of it. Never the only signal: the
          panel and the full record both say it in words. */}
      <g clipPath={`url(#${CARD_CLIP_ID})`}>
        <rect width={4} height={CARD_H} fill={accent} opacity={0.9} />
      </g>

      {/* Monogram. No stock silhouettes: an initial is honest about the fact
          that we have no picture, where a generic avatar is not. */}
      <circle
        cx={MONO_CX}
        cy={monoCy}
        r={MONO_R}
        /* Same mix variables the HTML monogram uses, so a card and the
           panel that opens from it are never two different greens. */
        fill={`color-mix(in oklab, ${accent} var(--facet-fill), var(--bg-inset))`}
        stroke={`color-mix(in oklab, ${accent} var(--facet-edge), transparent)`}
        strokeWidth={1}
      />
      <text
        x={MONO_CX}
        y={monoCy + 4.5}
        textAnchor="middle"
        fontSize={12.5}
        fontWeight={500}
        fill={`color-mix(in oklab, ${accent} var(--facet-ink), var(--fg))`}
        style={{ userSelect: "none", fontFamily: "var(--font-display)" }}
      >
        {initials}
      </text>

      <g clipPath={`url(#${TEXT_CLIP_ID})`}>
        <text
          x={TEXT_X}
          y={nameY}
          fontSize={15}
          fontWeight={emphasised ? 600 : 500}
          fill="var(--fg)"
          style={{ userSelect: "none", fontFamily: "var(--font-display)" }}
        >
          {/* The lamp only takes a bite out of the name column when there is
              a lamp to draw. */}
          {fitName(p.name, CARD_W - TEXT_X - PAD_X - (p.living ? 20 : 0), 15)}
        </text>

        <text
          x={TEXT_X}
          y={yearsY}
          fontSize={11.5}
          fill="var(--fg-soft)"
          style={{ userSelect: "none", letterSpacing: "0.01em" }}
        >
          {years}
        </text>

        {detail && (
          <text
            x={PAD_X}
            y={DETAIL_Y}
            fontSize={11}
            fill="var(--fg-faint)"
            style={{ userSelect: "none" }}
          >
            {/* Room left at the right end for the attestation mark. */}
            {truncate(detail, CARD_W - PAD_X * 2 - 20, 11, BODY)}
          </text>
        )}
      </g>

      {/* How well attested, as one dot in the same corner on every card. The
          words are in the tooltip and in the key; the colour is the thing
          that survives being seen at a quarter scale. */}
      <g transform={`translate(${MARK_X} ${MARK_Y})`}>
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
        <g transform={`translate(${CARD_W - 25} 13)`} opacity={0.95}>
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

      {/* A daughter whose descendants are read as her husband's family. Said
          on the card, because a branch that simply stops looks like a branch
          nobody recorded — which is the opposite of what has happened. */}
      {node.marriedOut && (
        <g transform={`translate(${CARD_W - 25} ${CARD_H - 13})`} opacity={0.9}>
          <title>
            Her line continues in the family she married into. Her children are
            drawn; open the tab below her for the rest.
          </title>
          <path
            d="M-5 0h10M2 -4l4 4-4 4"
            fill="none"
            stroke="var(--color-kumkum)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Branches not drawn. A count and a chevron pointing the way the branch
          runs — the same affordance an org chart uses, because it is the one
          people already know. Clicking opens *this* branch and moves nothing
          else; double-clicking the card still re-roots the whole tree. */}
      {(!!node.hiddenChildren || openDown) && (
        <CountTab
          x={CARD_W / 2}
          y={CARD_H + 6}
          count={node.hiddenChildren ?? 0}
          direction={openDown ? "up" : "down"}
          title={
            openDown
              ? "Close this branch again"
              : node.lineSummarised
                ? `${node.hiddenChildren} more recorded below — her line is read as her husband's family, click to follow it anyway`
                : `${node.hiddenChildren} more ${node.hiddenChildren === 1 ? "child" : "children"} — click to show the next generation`
          }
          onClick={() => onExpand("down", p.id)}
        />
      )}

      {(!!node.hiddenParents || openUp) && (
        <CountTab
          x={CARD_W / 2}
          y={-28}
          count={node.hiddenParents ?? 0}
          direction={openUp ? "down" : "up"}
          title={
            openUp
              ? "Close the generation above again"
              : "Show the generation above — their own household"
          }
          onClick={() => onExpand("up", p.id)}
        />
      )}
    </g>
  );
});

/**
 * The tab that opens one more layer.
 *
 * With a count it reads as a promise — "three more below here" — and without
 * one, which is how it comes back after the layer is open, it is just the
 * chevron pointing the way back. Same control, same place, so the reader does
 * not have to hunt for the way to close what they opened.
 */
function CountTab({
  x,
  y,
  count,
  direction,
  title,
  onClick,
}: {
  x: number;
  y: number;
  count: number;
  direction: "up" | "down";
  title: string;
  onClick: () => void;
}) {
  const W = count > 0 ? 48 : 30;
  const H = 22;
  const chevronX = count > 0 ? 33 : 15;
  return (
    <g
      transform={`translate(${x - W / 2} ${y})`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ cursor: "pointer" }}
    >
      <title>{title}</title>
      <rect
        width={W}
        height={H}
        rx={11}
        fill="var(--bg-raised)"
        stroke="var(--line-strong)"
      />
      {count > 0 && (
        <text
          x={17}
          y={15}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="var(--fg-soft)"
          style={{ userSelect: "none" }}
        >
          {count}
        </text>
      )}
      <path
        d={
          direction === "down"
            ? `M${chevronX - 3} 9.5 ${chevronX} 12.5 ${chevronX + 3} 9.5`
            : `M${chevronX - 3} 12.5 ${chevronX} 9.5 ${chevronX + 3} 12.5`
        }
        fill="none"
        stroke="var(--fg-faint)"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
