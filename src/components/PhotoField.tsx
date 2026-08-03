"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ACCEPTED_TYPES,
  ImageCompressError,
  compressImage,
  formatBytes,
} from "@/lib/imageCompress";
import type { PhotoRef } from "@/lib/types";

/**
 * Attaching a photograph.
 *
 * Optional everywhere it appears, and it has to stay that way: most of what
 * this archive records is people photographed rarely or never, and a form that
 * implies a picture is expected quietly says those records are worth less.
 *
 * The compression is not hidden. It tells the contributor what it did — nine
 * megabytes down to three hundred kilobytes — because otherwise the first
 * thing a family historian notices is that the archive degraded their scan,
 * and the honest answer ("so it still loads in forty years, and keep your
 * original") is one they generally agree with once it is said out loud.
 */
export function PhotoField({
  value,
  onChange,
  label = "A photograph",
  hint = "Optional. One good picture does more for a record than a paragraph.",
  compact = false,
}: {
  value: PhotoRef | null;
  onChange: (photo: PhotoRef | null) => void;
  label?: string;
  hint?: string;
  /** Tighter presentation, for a row inside the family builder. */
  compact?: boolean;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // The object url is the browser's, not React's — it survives re-render and
  // has to be handed back explicitly or every replaced photograph leaks.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);

    try {
      const result = await compressImage(file);

      const form = new FormData();
      form.append("full", result.full.blob, "photo.jpg");
      form.append("thumb", result.thumb.blob, "thumb.jpg");
      form.append("width", String(result.full.width));
      form.append("height", String(result.full.height));

      const res = await fetch("/api/media", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That image could not be uploaded.");
        return;
      }

      if (preview) URL.revokeObjectURL(preview);
      setPreview(URL.createObjectURL(result.full.blob));
      setSaved(
        `${formatBytes(result.originalBytes)} → ${formatBytes(result.full.bytes)}, ${result.full.width}×${result.full.height}`,
      );
      onChange({ ...data.photo, caption: value?.caption, credit: value?.credit });
    } catch (e) {
      setError(
        e instanceof ImageCompressError
          ? e.message
          : "That image could not be read.",
      );
    } finally {
      setBusy(false);
      // Cleared so choosing the same file twice still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setSaved(null);
    setError(null);
    onChange(null);
  };

  const shown = preview ?? value?.thumbUrl ?? value?.url ?? null;

  return (
    <div>
      <label className="label" htmlFor={`${uid}-file`}>
        {label}
      </label>

      <div
        className={`mt-1.5 flex gap-3 rounded-[var(--shape-md)] border border-[var(--outline-soft)] p-3 ${
          compact ? "items-center" : "flex-wrap items-start"
        }`}
      >
        {shown ? (
          // Deliberately not next/image: the source is a route handler backed
          // by an object store, the dimensions are already what they will be
          // rendered at, and the optimiser would add a round trip to re-encode
          // an image this component just encoded.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown}
            alt=""
            className="h-20 w-20 shrink-0 rounded-[var(--shape-sm)] object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--shape-sm)] bg-[var(--bg-inset)] text-[1.5rem] text-[var(--fg-faint)]"
          >
            ◻
          </div>
        )}

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            id={`${uid}-file`}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            disabled={busy}
            aria-describedby={`${uid}-hint`}
            onChange={(e) => handle(e.target.files?.[0])}
            className="block w-full text-[0.85rem] text-[var(--fg-soft)] file:mr-3 file:cursor-pointer file:rounded-[var(--shape-full)] file:border file:border-[var(--outline)] file:bg-transparent file:px-3.5 file:py-1.5 file:text-[0.85rem] file:text-[var(--accent)]"
          />

          <div aria-live="polite" className="mt-1">
            {busy && (
              <p className="text-[0.82rem] text-[var(--fg-soft)]">
                Resizing and uploading…
              </p>
            )}
            {saved && !busy && (
              <p className="text-[0.82rem] text-[var(--color-tulsi)]">
                Compressed {saved}. Keep your original — this is a copy.
              </p>
            )}
            {error && (
              <p role="alert" className="text-[0.82rem] text-[var(--accent)]">
                {error}
              </p>
            )}
          </div>

          {value && !busy && (
            <button type="button" onClick={clear} className="btn btn-text btn-sm mt-1">
              Remove the photograph
            </button>
          )}
        </div>
      </div>

      <p id={`${uid}-hint`} className="hint mt-1">
        {hint} Resized to 1600px and compressed in your browser before it is
        sent; location data is removed in the process.
      </p>

      {value && !compact && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`${uid}-caption`}>
              What is happening in it
            </label>
            <input
              id={`${uid}-caption`}
              className="field mt-1.5"
              value={value.caption ?? ""}
              onChange={(e) =>
                onChange({ ...value, caption: e.target.value || undefined })
              }
              placeholder="At the Mangueshi temple, about 1954"
            />
          </div>
          <div>
            <label className="label" htmlFor={`${uid}-credit`}>
              Who holds the original
            </label>
            <input
              id={`${uid}-credit`}
              className="field mt-1.5"
              value={value.credit ?? ""}
              onChange={(e) =>
                onChange({ ...value, credit: e.target.value || undefined })
              }
              placeholder="From my mother's album"
            />
          </div>
        </div>
      )}
    </div>
  );
}
