import { NextResponse } from "next/server";
import {
  isSupportedImageType,
  mintMediaKey,
  putMedia,
  sniffImageType,
} from "@/lib/mediaStore";
import { clientIp, createRateLimiter, rateLimitResponse } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// A family submission can carry several photographs; a script re-uploading
// the same file cannot. 30 uploads in 10 minutes is generous for the former
// and still bounds the latter's storage cost.
const limiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 30 });

/**
 * Where a contributed photograph lands.
 *
 * Open, like the rest of the contribution path — requiring an account to
 * attach a picture of your own grandmother would defeat the point of an
 * archive anyone can add to. What stops it being an open file host is that
 * nothing uploaded here is reachable from any page until a reviewer approves
 * the submission that references it: an orphaned upload is a key nobody holds.
 *
 * The uploaded bytes are already compressed — see lib/imageCompress.ts, which
 * also strips the EXIF that would otherwise publish the coordinates of a
 * contributor's house. The limits below are a backstop against a client that
 * skipped that step, not the mechanism.
 */

/** Generous against the ~340 KB the compressor targets, tight against abuse. */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_THUMB_BYTES = 600 * 1024;

async function readImage(
  value: FormDataEntryValue | null,
  limit: number,
  what: string,
): Promise<{ bytes: Uint8Array; type: string } | { error: string }> {
  if (!value || typeof value === "string") {
    return { error: `No ${what} was included` };
  }
  if (value.size > limit) {
    return {
      error: `The ${what} is ${Math.round(value.size / 1024)} KB, over the ${Math.round(
        limit / 1024,
      )} KB limit`,
    };
  }

  const bytes = new Uint8Array(await value.arrayBuffer());

  // The declared type is the uploader's to choose, so it is not what decides
  // how the file is stored or served. The file's own magic number is.
  const sniffed = sniffImageType(bytes);
  if (!sniffed || !isSupportedImageType(sniffed)) {
    return { error: `The ${what} is not a JPEG, PNG or WebP` };
  }
  return { bytes, type: sniffed };
}

export async function POST(request: Request) {
  if (!limiter.check(clientIp(request))) {
    return rateLimitResponse(600);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Malformed upload" }, { status: 400 });
  }

  const full = await readImage(form.get("full"), MAX_UPLOAD_BYTES, "photograph");
  if ("error" in full) {
    return NextResponse.json({ error: full.error }, { status: 400 });
  }

  const width = Number(form.get("width")) || undefined;
  const height = Number(form.get("height")) || undefined;

  try {
    const key = mintMediaKey(full.type);
    const stored = await putMedia(key, full.bytes, full.type);

    // The thumbnail is optional: without it every card falls back to the full
    // image, which is slower but not broken. Losing the whole upload because
    // the small rendition failed would be the worse trade.
    let thumbUrl: string | undefined;
    const thumbEntry = form.get("thumb");
    if (thumbEntry && typeof thumbEntry !== "string") {
      const thumb = await readImage(thumbEntry, MAX_THUMB_BYTES, "thumbnail");
      if (!("error" in thumb)) {
        const thumbKey = mintMediaKey(thumb.type, "-t");
        thumbUrl = (await putMedia(thumbKey, thumb.bytes, thumb.type)).url;
      }
    }

    return NextResponse.json({
      ok: true,
      photo: {
        url: stored.url,
        thumbUrl,
        width,
        height,
        bytes: stored.bytes,
      },
    });
  } catch (error) {
    // A storage misconfiguration is the likely cause and the contributor can
    // do nothing about it, so it is logged for the maintainer and reported as
    // what it is rather than as their mistake.
    console.error("[media] upload failed", error);
    return NextResponse.json(
      { error: "The archive could not store that image. Try again shortly." },
      { status: 502 },
    );
  }
}
