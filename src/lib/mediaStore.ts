import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Where photographs live.
 *
 * Records are text and belong in git, where every change to them keeps an
 * author and a date forever. Photographs are not text: a few hundred family
 * scans would make every clone of the archive carry a couple of gigabytes of
 * binary that git cannot diff, cannot merge and will never let go of. So the
 * images go to an object store and the records keep urls.
 *
 * Two backends, one interface. Netlify Blobs in the deployment, because the
 * function filesystem is ephemeral and anything written there is gone with the
 * container. The local filesystem in development, because requiring a cloud
 * account before `npm run dev` will show you a photograph is a bad trade.
 * Which one is in play is decided by the environment rather than by a flag
 * somebody has to remember to set.
 *
 * The url a record stores is always `/api/media/<key>` — never a bucket url.
 * That indirection is what lets the archive change storage in ten years
 * without rewriting every record that points at a photograph, which on the
 * timescale this project is built for is not a hypothetical.
 */

export type MediaBackend = "blobs" | "local";

const LOCAL_DIR = path.join(process.cwd(), "data", "media");
const STORE_NAME = process.env.MEDIA_STORE_NAME || "vansh-media";

export function mediaBackend(): MediaBackend {
  const forced = process.env.MEDIA_BACKEND;
  if (forced === "blobs" || forced === "local") return forced;
  // Set by Netlify in every build and every function invocation.
  return process.env.NETLIFY ? "blobs" : "local";
}

export interface StoredMedia {
  key: string;
  url: string;
  bytes: number;
  contentType: string;
}

export interface MediaBlob {
  body: Uint8Array;
  contentType: string;
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isSupportedImageType(type: string): boolean {
  return type in EXTENSIONS;
}

/**
 * Whether the bytes are what the request claims they are.
 *
 * A public endpoint that writes whatever it is handed into a store other pages
 * then serve is an open redirect for content — the declared content type is
 * the attacker's to choose, so it is checked against the file's own magic
 * number rather than trusted.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  const ascii = (start: number, len: number) =>
    String.fromCharCode(...bytes.slice(start, start + len));
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return null;
}

/** `submissions/2026/8f3a1c-t.jpg` — sharded by year so a listing stays usable. */
export function mintMediaKey(contentType: string, suffix = ""): string {
  const ext = EXTENSIONS[contentType] ?? "bin";
  const year = new Date().getFullYear();
  const id = crypto.randomBytes(9).toString("hex");
  return `submissions/${year}/${id}${suffix}.${ext}`;
}

export function mediaUrl(key: string): string {
  return `/api/media/${key}`;
}

/**
 * Keys are minted here and then travel through a submission payload, which
 * means they come back from the outside world before they are used to read.
 * Anything but the shape this module produces is refused, so a crafted key
 * cannot walk out of the media namespace and into the rest of the store.
 */
export function isSafeMediaKey(key: string): boolean {
  return /^[a-z0-9][a-z0-9/_-]{0,180}\.(jpg|png|webp)$/i.test(key) &&
    !key.includes("..") &&
    !key.startsWith("/");
}

/* ------------------------------------------------------------------ */
/* Netlify Blobs                                                       */
/* ------------------------------------------------------------------ */

type BlobStore = {
  set(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { metadata?: Record<string, unknown> },
  ): Promise<unknown>;
  getWithMetadata(
    key: string,
    options: { type: "arrayBuffer" },
  ): Promise<{ data: ArrayBuffer; metadata: Record<string, unknown> } | null>;
  delete(key: string): Promise<unknown>;
};

let blobStorePromise: Promise<BlobStore> | null = null;

async function blobStore(): Promise<BlobStore> {
  blobStorePromise ??= (async () => {
    const mod = (await import("@netlify/blobs")) as {
      getStore: (options: string | Record<string, unknown>) => BlobStore;
    };

    // Inside a Netlify function the credentials are ambient. Outside one —
    // a script, a self-hosted build — they have to be supplied, and saying so
    // plainly beats a generic failure from inside the SDK.
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
    if (siteID && token) {
      return mod.getStore({ name: STORE_NAME, siteID, token, consistency: "strong" });
    }
    return mod.getStore({ name: STORE_NAME, consistency: "strong" });
  })();
  return blobStorePromise;
}

/* ------------------------------------------------------------------ */
/* Public interface                                                    */
/* ------------------------------------------------------------------ */

export async function putMedia(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<StoredMedia> {
  if (mediaBackend() === "blobs") {
    const store = await blobStore();
    await store.set(key, body, { metadata: { contentType } });
  } else {
    const file = path.join(LOCAL_DIR, key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Same temp-then-rename as the people files: a half-written photograph
    // served to a reader is worse than a missing one.
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file);
  }

  return { key, url: mediaUrl(key), bytes: body.byteLength, contentType };
}

export async function getMedia(key: string): Promise<MediaBlob | null> {
  if (!isSafeMediaKey(key)) return null;

  if (mediaBackend() === "blobs") {
    try {
      const store = await blobStore();
      const found = await store.getWithMetadata(key, { type: "arrayBuffer" });
      if (!found) return null;
      const declared = found.metadata?.contentType;
      return {
        body: new Uint8Array(found.data),
        contentType:
          typeof declared === "string" ? declared : "application/octet-stream",
      };
    } catch {
      return null;
    }
  }

  const file = path.join(LOCAL_DIR, key);
  // Belt and braces over isSafeMediaKey: whatever the regex allowed, the
  // resolved path has to still be inside the media directory.
  if (!path.resolve(file).startsWith(path.resolve(LOCAL_DIR) + path.sep)) {
    return null;
  }
  if (!fs.existsSync(file)) return null;

  const body = new Uint8Array(fs.readFileSync(file));
  return {
    body,
    contentType: sniffImageType(body) ?? "application/octet-stream",
  };
}

export async function deleteMedia(key: string): Promise<void> {
  if (!isSafeMediaKey(key)) return;
  if (mediaBackend() === "blobs") {
    const store = await blobStore();
    await store.delete(key);
    return;
  }
  const file = path.join(LOCAL_DIR, key);
  if (fs.existsSync(file)) fs.rmSync(file);
}
