import { getMedia, isSafeMediaKey } from "@/lib/mediaStore";

type Context = { params: Promise<{ key: string[] }> };

/**
 * Serving a stored photograph.
 *
 * Every image in the archive is addressed through here rather than through a
 * bucket url, so that the storage behind it can change — Netlify Blobs today,
 * something else in a decade — without rewriting the url on every record that
 * points at a photograph. On the timescale a family archive is built for, that
 * indirection will be worth more than the request it costs.
 *
 * Immutable caching is safe because keys are minted from random bytes and
 * never reused: a given key is one particular file for as long as it exists.
 */
export async function GET(_request: Request, { params }: Context) {
  const { key: segments } = await params;
  const key = segments.join("/");

  if (!isSafeMediaKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  const media = await getMedia(key);
  if (!media) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(media.body as BodyInit, {
    headers: {
      "Content-Type": media.contentType,
      "Content-Length": String(media.body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      // The store holds images and only images, but a browser that decides
      // otherwise about some future upload would be executing it in the
      // archive's own origin.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
