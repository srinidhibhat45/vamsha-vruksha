/**
 * Transliteration-tolerant matching for romanised Indic names.
 *
 * The problem this solves: the same person is written Shreenivas, Srinivasa,
 * Sreenivas and Shrinivas by four different cousins, and a plain string search
 * finds none of the others. Roman spellings of Konkani/Sanskrit names vary along
 * a small number of predictable axes:
 *
 *   - aspiration is inconsistently written    bh/b, dh/d, kh/k, th/t, ph/f
 *   - sibilants collapse in speech            sh/s/ś/ṣ
 *   - long vowels are doubled or not          aa/a, ee/i, oo/u
 *   - v and w are the same sound              Vasudev / Wasudev
 *   - the Sanskrit final -a is often dropped  Rama / Ram, Ganesha / Ganesh
 *   - ksh is written ksh, ksh, x              Lakshmi / Laxmi
 *
 * So we fold a name down to a phonetic key along exactly those axes, and then
 * allow a bounded edit distance on top for everything else. This is a
 * Soundex-in-spirit algorithm tuned for Indic romanisation rather than English.
 *
 * Native-script strings (Devanagari, Kannada) are passed through unfolded and
 * indexed as-is — they are already unambiguous.
 */

/** Strip combining marks: Bhāradvāja -> Bharadvaja. */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const DEVANAGARI = /[ऀ-ॿ]/;
const KANNADA = /[ಀ-೿]/;

export function isNativeScript(s: string): boolean {
  return DEVANAGARI.test(s) || KANNADA.test(s);
}

/**
 * Fold one word to its phonetic key. Order matters throughout — digraphs must
 * be resolved before bare 'h' is dropped, and the Sanskrit final -a must be
 * dropped before doubled letters are collapsed (so that Bhatta and Bhatt both
 * land on 'bat').
 */
export function phoneticKey(input: string): string {
  if (!input) return "";
  if (isNativeScript(input)) return input.trim();

  let s = stripDiacritics(input).toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "";

  // 1. Digraphs and clusters, longest first.
  s = s
    .replace(/ksh/g, "ks")
    .replace(/chh/g, "c")
    .replace(/ch/g, "c")
    .replace(/sh/g, "s")
    .replace(/zh/g, "j")
    .replace(/jn/g, "gn")
    .replace(/bh/g, "b")
    .replace(/dh/g, "d")
    .replace(/gh/g, "g")
    .replace(/jh/g, "j")
    .replace(/kh/g, "k")
    .replace(/ph/g, "p")
    .replace(/th/g, "t");

  // 2. Bare 'h' is unreliable except word-initially (Hari, Hegde).
  s = s[0] + s.slice(1).replace(/h/g, "");

  // 3. Single-letter equivalences.
  s = s
    .replace(/w/g, "v")
    .replace(/f/g, "p")
    .replace(/z/g, "j")
    .replace(/q/g, "k")
    .replace(/x/g, "ks");

  // 4. Long vowels written as doubles.
  s = s
    .replace(/aa/g, "a")
    .replace(/ee/g, "i")
    .replace(/ie/g, "i")
    .replace(/ii/g, "i")
    .replace(/oo/g, "u")
    .replace(/uu/g, "u")
    .replace(/ou/g, "u");

  // 5. y is a vowel in most of these names (Nayak, Narayan).
  s = s.replace(/y/g, "i");

  // 6. Sanskrit final -a, kept in the south, dropped in the north.
  //    Ganesha -> ganes, Rama -> ram. Guarded by length so short names survive.
  if (s.length >= 5 && s.endsWith("a")) s = s.slice(0, -1);

  // 7. Collapse doubled letters: Bhatt -> bat, Nadkarni unaffected.
  s = s.replace(/(.)\1+/g, "$1");

  return s;
}

/** Fold a whole name string into its ordered list of phonetic tokens. */
export function phoneticTokens(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[\s.,;/()\-_]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map(phoneticKey)
    .filter(Boolean);
}

/** Plain lowercase tokens, diacritics removed — used for exact/prefix matching. */
export function plainTokens(input: string): string[] {
  if (!input) return [];
  return stripDiacritics(input)
    .toLowerCase()
    .split(/[\s.,;/()\-_]+/)
    .map((w) => w.replace(/[^a-z0-9ऀ-ॿಀ-೿]/g, ""))
    .filter(Boolean);
}

/**
 * Bounded Levenshtein. Returns `max + 1` as soon as it is clear the distance
 * exceeds `max`, so the common "these are nothing alike" case is cheap.
 */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const lo = Math.max(1, i - max);
    const hi = Math.min(b.length, i + max);
    // Cells outside the diagonal band cannot contribute a result <= max.
    for (let j = 1; j < lo; j++) cur[j] = max + 1;
    for (let j = lo; j <= hi; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    for (let j = hi + 1; j <= b.length; j++) cur[j] = max + 1;
    if (rowMin > max) return max + 1;
    const swap = prev;
    prev = cur;
    cur = swap;
  }
  return prev[b.length];
}

/**
 * Similarity of two name strings in [0, 1]. Used to rank search results and to
 * flag likely duplicate submissions before a moderator sees them.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = phoneticTokens(a);
  const tb = phoneticTokens(b);
  if (!ta.length || !tb.length) return 0;

  // Greedy best-match over tokens, order-independent: "Narayan Kamath" should
  // score highly against "Kamath, Narayan V."
  const used = new Set<number>();
  let total = 0;
  for (const x of ta) {
    let best = 0;
    let bestIdx = -1;
    tb.forEach((y, i) => {
      if (used.has(i)) return;
      let score: number;
      if (x === y) score = 1;
      else if (y.startsWith(x) || x.startsWith(y)) score = 0.8;
      else {
        const d = editDistance(x, y, 2);
        score = d <= 2 ? 1 - d / (Math.max(x.length, y.length) + 1) : 0;
      }
      if (score > best) {
        best = score;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) used.add(bestIdx);
    total += best;
  }
  return total / Math.max(ta.length, tb.length);
}

/**
 * Known spelling families that phonetic folding alone cannot bridge, because
 * they diverged through different colonial orthographies rather than through
 * pronunciation. Sinai/Shenoy is the classic case: same office-name, one routed
 * through Portuguese and one through English.
 */
export const SPELLING_FAMILIES: string[][] = [
  ["shenoy", "shenai", "shanai", "sinai", "sinari", "senoy"],
  ["kamath", "kamat", "kamathe", "camotim"],
  ["prabhu", "porobo", "prabhoo"],
  ["nayak", "naik", "naique", "nayaka"],
  ["pai", "pei", "pay", "pai"],
  ["bhat", "bhatt", "bhatta", "bhatte"],
  ["shanbhag", "shanbhogue", "shanbhog", "sambhag"],
  ["hegde", "hegade", "heggade", "hegde"],
  ["mallya", "mallia", "malya"],
  ["rao", "rau", "row"],
  ["nadkarni", "nadkarny"],
  ["padukone", "paddukone"],
  ["kudva", "kudwa"],
  ["baliga", "balliga"],
];

const FAMILY_LOOKUP = (() => {
  const m = new Map<string, number>();
  SPELLING_FAMILIES.forEach((family, i) => {
    for (const variant of family) m.set(phoneticKey(variant), i);
  });
  return m;
})();

/** Canonical group id for a surname, or null if it belongs to no known family. */
export function spellingFamily(word: string): number | null {
  const id = FAMILY_LOOKUP.get(phoneticKey(word));
  return id === undefined ? null : id;
}
