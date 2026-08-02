import fs from "node:fs";
import path from "node:path";
import { editDistance, phoneticKey } from "./translit.ts";

/**
 * Resolves free-text values from imported files onto the archive's controlled
 * vocabularies.
 *
 * Imported data says "Shri Mangesh", "Bharadwaj", "Kashi Mutt" and "Cortalim".
 * The archive stores `mangesh`, `bharadwaja`, `kashi-math` and `kushasthali`.
 * Without this step every import quietly fills the directory pages with
 * near-duplicate entries, which is exactly the decay a controlled vocabulary
 * exists to prevent.
 *
 * Matching runs in three passes, most confident first: exact id, then the
 * phonetic key of the name and of every recorded alternative, then a prefix
 * match on the phonetic key. Honorifics that carry no distinguishing
 * information — Shri, Sri, Shree — are dropped first.
 */

const HONORIFICS = /^(shri|sri|shree|sree|shrimad|shrimat|saint|st)\s+/i;
const NOISE = /\s+(temple|math|mutt|matha|samsthan|sansthan|village|gaon)$/i;

export type Vocabulary =
  | "gotras"
  | "maths"
  | "communities"
  | "kuladevatas"
  | "places";

interface RefItem {
  id: string;
  name: string;
  alt?: string[];
  alsoKnownAs?: string[];
}

const cache = new Map<Vocabulary, Map<string, string>>();

function loadVocabulary(vocabulary: Vocabulary): Map<string, string> {
  const cached = cache.get(vocabulary);
  if (cached) return cached;

  const file = path.join(
    process.cwd(),
    "data",
    "reference",
    `${vocabulary}.json`,
  );
  const lookup = new Map<string, string>();

  try {
    const doc = JSON.parse(fs.readFileSync(file, "utf8")) as {
      items?: RefItem[];
    };
    for (const item of doc.items ?? []) {
      const keys = [
        item.id,
        item.name,
        ...(item.alt ?? []),
        ...(item.alsoKnownAs ?? []),
      ];
      for (const key of keys) {
        if (!key) continue;
        const cleaned = key.replace(HONORIFICS, "").replace(NOISE, "");
        lookup.set(phoneticKey(cleaned), item.id);
        // Multi-word names also get an entry under their first word, so
        // "Shantadurga Kunkalikarin" is reachable as "Shantadurga".
        const first = cleaned.split(/\s+/)[0];
        const firstKey = phoneticKey(first);
        if (firstKey && !lookup.has(firstKey)) lookup.set(firstKey, item.id);
      }
    }
  } catch {
    // A missing vocabulary file is not fatal — the importer falls back to a
    // slug and the validator will report it.
  }

  cache.set(vocabulary, lookup);
  return lookup;
}

export interface ResolveResult {
  id: string;
  /** False when nothing matched and the value was slugified as a fallback. */
  matched: boolean;
}

export function resolveRef(
  vocabulary: Vocabulary,
  value: string | undefined,
): ResolveResult | undefined {
  if (!value?.trim()) return undefined;

  const lookup = loadVocabulary(vocabulary);
  const cleaned = value.trim().replace(HONORIFICS, "").replace(NOISE, "");
  const key = phoneticKey(cleaned);

  const exact = lookup.get(key);
  if (exact) return { id: exact, matched: true };

  // Prefix match, both ways: "Gokarn Partagali Jeevottam" against
  // "Gokarn Partagali", and "Shantadurga Kunkali" against "Shantadurga".
  if (key.length >= 4) {
    for (const [candidate, id] of lookup) {
      if (candidate.startsWith(key) || key.startsWith(candidate)) {
        return { id, matched: true };
      }
    }
  }

  // Finally, a bounded edit distance on the phonetic key. This is what catches
  // syncopated spellings that fold to a different key — "Bhardwaj" against
  // "Bharadwaja", "Shenvi" against "Shenoy" — where a dropped vowel survives
  // the phonetic pass. Only the single closest candidate counts, and only when
  // it is unambiguous, so a near-tie is reported unmatched rather than guessed.
  if (key.length >= 5) {
    let best: { id: string; distance: number } | null = null;
    let ambiguous = false;
    for (const [candidate, id] of lookup) {
      const d = editDistance(key, candidate, 2);
      if (d > 2) continue;
      if (!best || d < best.distance) {
        best = { id, distance: d };
        ambiguous = false;
      } else if (d === best.distance && id !== best.id) {
        ambiguous = true;
      }
    }
    if (best && !ambiguous) return { id: best.id, matched: true };
  }

  return {
    id: cleaned.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    matched: false,
  };
}

/** Convenience wrapper that records unmatched values for the import report. */
export function makeResolver(unmatched: Map<string, Set<string>>) {
  return (vocabulary: Vocabulary, value: string | undefined) => {
    const result = resolveRef(vocabulary, value);
    if (result && !result.matched && value) {
      const set = unmatched.get(vocabulary) ?? new Set<string>();
      set.add(value.trim());
      unmatched.set(vocabulary, set);
    }
    return result?.id;
  };
}
