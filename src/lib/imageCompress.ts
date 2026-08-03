/**
 * Shrinking a photograph in the browser, before it is ever uploaded.
 *
 * The compression happens on the contributor's machine rather than on the
 * server for three reasons, in ascending order of how much they matter:
 *
 * 1. A phone photograph is eight to twelve megabytes. Somebody on a Konkan
 *    mobile connection uploading eleven of them is uploading a hundred
 *    megabytes and will give up before the form submits. Compressed first, it
 *    is four megabytes and finishes.
 *
 * 2. Nothing has to be installed on the server, and no image library sits in a
 *    request path processing untrusted binary from the public internet.
 *
 * 3. **It strips EXIF, and that is a privacy fix, not a size one.** Phone
 *    photographs carry the GPS coordinates of where they were taken. A public,
 *    search-indexed archive of family photographs where every image quietly
 *    publishes a home address to street precision is a serious harm, and it is
 *    invisible — nobody uploading a picture of their grandmother knows they
 *    are doing it. Drawing the image onto a canvas and re-encoding keeps the
 *    pixels and discards every metadata block, so the harm cannot happen
 *    rather than being something reviewers are asked to remember.
 *
 * The target is legibility in fifty years rather than fidelity now. 1600px on
 * the long edge is enough to read a face, to see the border of a sari, and to
 * print at postcard size; it is not enough to be worth the storage of the
 * original. Contributors keep their originals — this archive is a copy of
 * record, and says so.
 */

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

export interface CompressResult {
  full: CompressedImage;
  /** Small rendition for cards, the tree and search results. */
  thumb: CompressedImage;
  /** The file as it arrived, for the "saved you 9.1 MB" line. */
  originalBytes: number;
  originalName: string;
}

/** Long edge of the stored image. */
const MAX_EDGE = 1600;
/** Long edge of the thumbnail. */
const THUMB_EDGE = 400;
/** What the full rendition aims to come in under. */
const TARGET_BYTES = 340 * 1024;
/**
 * Quality is walked down towards the target, but never past this — below about
 * 0.55 JPEG starts visibly blocking on skin and on fabric, which is precisely
 * the detail worth keeping in a photograph of a person.
 */
const MIN_QUALITY = 0.55;
const START_QUALITY = 0.85;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
/** Refused before decoding — a 60 MB raw scan will exhaust the tab's memory. */
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export class ImageCompressError extends Error {}

function scaleTo(width: number, height: number, edge: number) {
  const longest = Math.max(width, height);
  if (longest <= edge) return { width, height };
  const ratio = edge / longest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap honours EXIF orientation with this flag, which matters:
  // re-encoding without it turns every portrait phone photograph on its side.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* Safari on older iOS, and HEIC anywhere — fall through to <img>. */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(
          new ImageCompressError(
            "That image could not be read. JPEG, PNG or WebP work everywhere.",
          ),
        );
      img.src = url;
    });
  } finally {
    // Revoked after decode rather than in onload: the bitmap is already in
    // memory by then, and leaving it attached leaks the whole file per upload.
    URL.revokeObjectURL(url);
  }
}

function draw(
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageCompressError("This browser cannot resize images.");

  // Photographs of photographs are the common case here — a phone picture of a
  // framed portrait — and they downscale badly with nearest-neighbour.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // A transparent PNG flattened onto nothing encodes to black in JPEG. Scans
  // of documents are frequently transparent PNGs, so paint white first.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new ImageCompressError("The image could not be encoded.")),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Encode, and step the quality down if the result is over budget.
 *
 * A fixed quality is the wrong tool: 0.85 on a flat studio portrait is 90 KB
 * and on a busy group photograph is 700 KB, because JPEG spends bits on
 * detail and those two images have wildly different amounts of it. Walking
 * down until the file fits spends the bits where they are needed and stops
 * early on the images that do not need them — three encodes at worst.
 */
async function encodeWithinBudget(
  canvas: HTMLCanvasElement,
  budget: number,
): Promise<Blob> {
  let quality = START_QUALITY;
  let blob = await toBlob(canvas, quality);

  while (blob.size > budget && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.12);
    blob = await toBlob(canvas, quality);
  }
  return blob;
}

export async function compressImage(file: File): Promise<CompressResult> {
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageCompressError(
      `That file is ${(file.size / 1024 / 1024).toFixed(0)} MB. The limit is ${
        MAX_INPUT_BYTES / 1024 / 1024
      } MB — try exporting it smaller first.`,
    );
  }

  const source = await decode(file);
  const naturalWidth =
    "width" in source ? source.width : (source as HTMLImageElement).naturalWidth;
  const naturalHeight =
    "height" in source
      ? source.height
      : (source as HTMLImageElement).naturalHeight;

  if (!naturalWidth || !naturalHeight) {
    throw new ImageCompressError("That image appears to be empty.");
  }

  const fullSize = scaleTo(naturalWidth, naturalHeight, MAX_EDGE);
  const fullCanvas = draw(source, fullSize.width, fullSize.height);
  const fullBlob = await encodeWithinBudget(fullCanvas, TARGET_BYTES);

  const thumbSize = scaleTo(naturalWidth, naturalHeight, THUMB_EDGE);
  const thumbCanvas = draw(source, thumbSize.width, thumbSize.height);
  const thumbBlob = await toBlob(thumbCanvas, 0.78);

  if ("close" in source && typeof source.close === "function") source.close();

  return {
    full: {
      blob: fullBlob,
      width: fullSize.width,
      height: fullSize.height,
      bytes: fullBlob.size,
    },
    thumb: {
      blob: thumbBlob,
      width: thumbSize.width,
      height: thumbSize.height,
      bytes: thumbBlob.size,
    },
    originalBytes: file.size,
    originalName: file.name,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
