/**
 * Fetch the temple photographs.
 *
 *   node scripts/fetch-temple-photos.ts
 *
 * Every image in the gallery is somebody else's photograph, used under a
 * licence that requires attribution. This script is the only thing that puts
 * files in public/temples/, and it refuses to write one whose licence and
 * author it could not read — so an unattributed image cannot reach the site by
 * being dropped into the folder and forgotten about.
 *
 * Two things it deliberately does not do. It does not download originals: it
 * asks Commons for a 1600px rendition, which is more than the page needs and a
 * fraction of the bandwidth of a 24-megapixel source. And it does not re-fetch
 * what is already on disk, so running it again after adding one temple costs
 * one request rather than twenty-two.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const API = "https://commons.wikimedia.org/w/api.php";
/** ASCII only: an HTTP header value cannot carry anything above U+00FF. */
const UA = "VanshVriksha/0.1 (Saraswat community genealogy archive; educational)";

const OUT_DIR = path.join(process.cwd(), "public", "temples");
const MANIFEST = path.join(process.cwd(), "data", "reference", "temple-sources.json");
const TARGET = path.join(process.cwd(), "data", "reference", "temples.json");

/** Long edge of the stored file. Enough to fill a wide card on a retina screen. */
const MAX_EDGE = 1400;
const QUALITY = 76;

const ALLOWED = [
  "cc by-sa",
  "cc by",
  "cc0",
  "public domain",
  "pd-",
];

interface SourceEntry {
  id: string;
  file: string;
  name: string;
  devanagari?: string;
  kuladevataId?: string;
  mathId?: string;
  placeId?: string;
  originPlaceId?: string;
  blurb?: string;
}

interface CommonsInfo {
  url: string;
  thumbUrl: string;
  descriptionUrl: string;
  artist: string;
  license: string;
  licenseUrl?: string;
}

function stripHtml(value: string | undefined): string {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function commonsInfo(title: string): Promise<CommonsInfo | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    titles: title,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: String(MAX_EDGE),
  });

  // Commons rate-limits scripted clients, and a run of twenty-odd will meet it.
  // Backing off is the difference between a rerun that completes the set and
  // one that gives up on whatever it happened to be asking for at the time.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(`${API}?${params}`, { headers: { "User-Agent": UA } });
    if (res.ok) break;
    if (res.status !== 429 && res.status < 500) {
      throw new Error(`Commons replied ${res.status} for ${title}`);
    }
    await sleep(4000 * 2 ** attempt);
  }
  if (!res?.ok) {
    throw new Error(`Commons replied ${res?.status ?? "nothing"} for ${title}`);
  }

  const data = (await res.json()) as {
    query?: { pages?: Record<string, {
      imageinfo?: {
        url?: string;
        thumburl?: string;
        descriptionurl?: string;
        extmetadata?: Record<string, { value?: string }>;
      }[];
    }> };
  };

  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info?.url) return null;

  const meta = info.extmetadata ?? {};
  return {
    url: info.url,
    thumbUrl: info.thumburl ?? info.url,
    descriptionUrl: info.descriptionurl ?? "",
    artist: stripHtml(meta.Artist?.value),
    license: stripHtml(meta.LicenseShortName?.value),
    licenseUrl: meta.LicenseUrl?.value,
  };
}

async function main() {
  const entries = JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as {
    _readme?: string;
    items: SourceEntry[];
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });

  /*
   * What the last run produced, keyed by id.
   *
   * The script rewrites temples.json wholesale, so without this a rerun that
   * meets a rate limit halfway would publish a *shorter* list than the one
   * already on disk — a transient network problem silently deleting twelve
   * temples from the site. An entry whose image is still in public/temples is
   * carried forward when its metadata cannot be re-fetched.
   */
  const previous = new Map<string, Record<string, unknown>>();
  if (fs.existsSync(TARGET)) {
    try {
      const doc = JSON.parse(fs.readFileSync(TARGET, "utf8")) as {
        items?: { id: string }[];
      };
      for (const item of doc.items ?? []) {
        previous.set(item.id, item as Record<string, unknown>);
      }
    } catch {
      /* An unreadable file is replaced rather than merged. */
    }
  }

  const out: Record<string, unknown>[] = [];
  let fetched = 0;
  let skipped = 0;
  let carried = 0;

  for (const entry of entries.items) {
    const dest = path.join(OUT_DIR, `${entry.id}.jpg`);

    let info: CommonsInfo | null = null;
    try {
      info = await commonsInfo(entry.file);
    } catch (error) {
      console.error(`  ! ${entry.id}: ${(error as Error).message}`);
    }

    if (!info) {
      const kept = fs.existsSync(dest) ? previous.get(entry.id) : undefined;
      if (kept) {
        out.push(kept);
        carried += 1;
        console.error(`  ~ ${entry.id}: kept the entry already on disk`);
      } else {
        console.error(`  ! ${entry.id}: no file info for ${entry.file} — skipped`);
      }
      continue;
    }

    const licence = info.license.toLowerCase();
    if (!ALLOWED.some((ok) => licence.startsWith(ok))) {
      // Not a judgement about the photograph — only that this script cannot
      // confirm the archive is allowed to redistribute it.
      console.error(
        `  ! ${entry.id}: licence "${info.license}" is not one this script will publish — skipped`,
      );
      continue;
    }
    if (!info.artist) {
      console.error(`  ! ${entry.id}: no author recorded on Commons — skipped`);
      continue;
    }

    let width: number | undefined;
    let height: number | undefined;

    if (fs.existsSync(dest)) {
      const meta = await sharp(dest).metadata();
      width = meta.width;
      height = meta.height;
      skipped += 1;
    } else {
      const image = await fetch(info.thumbUrl, { headers: { "User-Agent": UA } });
      if (!image.ok) {
        console.error(`  ! ${entry.id}: download failed (${image.status})`);
        continue;
      }
      const bytes = Buffer.from(await image.arrayBuffer());
      const resized = await sharp(bytes)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
        .toBuffer();

      fs.writeFileSync(dest, resized);
      const meta = await sharp(resized).metadata();
      width = meta.width;
      height = meta.height;
      fetched += 1;
      console.log(
        `  + ${entry.id}.jpg  ${width}×${height}  ${Math.round(resized.length / 1024)} KB  ${info.license}`,
      );
      // Commons asks for restraint from scripted clients, and this runs rarely.
      await sleep(1500);
    }

    out.push({
      id: entry.id,
      name: entry.name,
      devanagari: entry.devanagari,
      kuladevataId: entry.kuladevataId,
      mathId: entry.mathId,
      placeId: entry.placeId,
      originPlaceId: entry.originPlaceId,
      blurb: entry.blurb,
      image: {
        src: `/temples/${entry.id}.jpg`,
        width,
        height,
        credit: info.artist,
        license: info.license,
        licenseUrl: info.licenseUrl,
        source: info.descriptionUrl,
      },
    });
  }

  const doc = {
    _readme:
      "Photographs of the temples and mathas this community names, gathered from Wikimedia Commons under free licences. Regenerate with `npm run media:temples`. Every entry carries its photographer, its licence and the page it came from; the site renders all three wherever the image appears, which is a condition of using them. Do not hand-edit the image blocks — the script owns them.",
    items: out,
  };

  fs.writeFileSync(TARGET, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(
    `\n${out.length} temples written to data/reference/temples.json ` +
      `(${fetched} downloaded, ${skipped} already present, ${carried} carried over)`,
  );

  const missing = entries.items.length - out.length;
  if (missing > 0) {
    console.log(
      `${missing} could not be resolved. Rerun to pick them up — what is already on disk is not re-fetched.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
