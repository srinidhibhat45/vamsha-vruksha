import manifest from "../../public/temples/w900/sizes.json" with { type: "json" };
import type { TempleImage } from "./types.ts";

/**
 * Point a temple photograph at its display-sized copy.
 *
 * public/temples holds the archival rendition — around 1400px, which is what
 * Commons was asked for and what should be kept. Nothing on the site draws one
 * wider than about 450 CSS pixels, so scripts/resize-media.ts writes a 900px
 * set beside it and this is what makes the components read those instead.
 * /diaspora alone went from 3.6 MB of photographs to 1.2 MB.
 *
 * The dimensions come from the manifest the script wrote rather than from the
 * original, because they are not proportional to it: a few of the sources are
 * already narrower than 900px and are left alone, so assuming a fixed ratio
 * would reserve the wrong box and shift the page as each one loaded.
 *
 * Falls back to the original whenever a derivative is missing, so a temple
 * added to the JSON before the script is re-run still shows a picture.
 */
export function displayImage(image: TempleImage | undefined):
  | (TempleImage & { width: number; height: number })
  | undefined {
  if (!image) return undefined;

  const id = image.src.replace(/^.*\//, "").replace(/\.jpg$/i, "");
  const sized = (manifest.sizes as Record<string, { width: number; height: number }>)[id];

  if (!sized) {
    return image.width && image.height
      ? { ...image, width: image.width, height: image.height }
      : undefined;
  }

  return {
    ...image,
    src: `/temples/w900/${id}.jpg`,
    width: sized.width,
    height: sized.height,
  };
}
