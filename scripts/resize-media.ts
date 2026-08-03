/**
 * Make display-sized copies of the temple photographs.
 *
 *   node scripts/resize-media.ts
 *
 * fetch-temple-photos.ts asks Commons for a large rendition and keeps it, which
 * is right: the original is the archival copy, and re-fetching twenty-two
 * images because a layout changed would be rude to somebody else's servers.
 *
 * But nothing on the site displays one above about 450 CSS pixels. Shipping the
 * 1400px file to a phone means the gallery on /diaspora downloads three and a
 * half megabytes to draw twenty-two thumbnails, and the picture is not one
 * pixel better for it. So this writes a second, smaller set beside the first
 * and the components read those.
 *
 * 900px is deliberate: it is 2× the widest slot any of them renders in, so the
 * photograph is still sharp on a retina screen and nothing more is paid for.
 *
 * Reads and writes only; the originals are never touched, so raising WIDTH and
 * running this again is safe.
 */

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SOURCE = path.join(process.cwd(), "public", "temples");
const OUT = path.join(SOURCE, "w900");

/** Twice the widest slot the gallery gives a photograph. */
const WIDTH = 900;
/**
 * Chosen by looking at the output, not by taste: below about 55 the sky
 * behind a gopuram starts to band, and above it the file grows without the
 * stonework getting any more legible.
 */
const QUALITY = 58;

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE)) {
    console.error(`No ${path.relative(process.cwd(), SOURCE)} — run npm run media:temples first.`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });

  const files = fs
    .readdirSync(SOURCE)
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  let before = 0;
  let after = 0;
  const sizes: Record<string, { width: number; height: number }> = {};

  for (const file of files) {
    const src = path.join(SOURCE, file);
    const dest = path.join(OUT, file);

    const original = fs.statSync(src).size;
    const resized = await sharp(src)
      .resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();

    fs.writeFileSync(dest, resized);
    const meta = await sharp(resized).metadata();
    sizes[file.replace(/\.jpg$/, "")] = {
      width: meta.width ?? WIDTH,
      height: meta.height ?? 0,
    };

    before += original;
    after += resized.length;
    console.log(
      `  ${file.padEnd(32)} ${String(Math.round(original / 1024)).padStart(4)} KB → ${String(
        Math.round(resized.length / 1024),
      ).padStart(4)} KB`,
    );
  }

  console.log(
    `\n${files.length} images · ${Math.round(before / 1024)} KB → ${Math.round(
      after / 1024,
    )} KB (${Math.round((1 - after / before) * 100)}% smaller)`,
  );

  // The components need the height to reserve the right box before the image
  // arrives, so the dimensions go next to the files rather than being guessed.
  fs.writeFileSync(
    path.join(OUT, "sizes.json"),
    JSON.stringify(
      { _note: "Written by scripts/resize-media.ts. Do not edit by hand.", sizes },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
