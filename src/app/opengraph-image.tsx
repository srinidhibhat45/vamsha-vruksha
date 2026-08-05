import { ImageResponse } from "next/og";

/**
 * The default social-share image for the whole site.
 *
 * A route can override this by dropping its own opengraph-image.tsx in the
 * same folder; none currently do; every page falls back to this one, which
 * is generated once at build time (this file exports no dynamic data) and
 * served as a static file, exactly like the temple photographs.
 *
 * Colours are the same tokens as globals.css (`--color-paper`,
 * `--color-kumkum`, `--color-ink`, `--color-gold`) — ImageResponse renders
 * with Satori, which cannot read CSS custom properties from the app, so the
 * hex values are repeated here rather than shared.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbf6ec",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 980,
            height: 3,
            background: "#96702a",
            marginBottom: 40,
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 92,
            color: "#a8322a",
            fontWeight: 600,
            letterSpacing: -1,
          }}
        >
          Vansh Vriksha
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 22,
            fontSize: 32,
            color: "#4a4139",
            maxWidth: 880,
            textAlign: "center",
            justifyContent: "center",
          }}
        >
          A shared lineage archive — free to read, free to search
        </div>
        <div
          style={{
            display: "flex",
            width: 980,
            height: 3,
            background: "#96702a",
            marginTop: 40,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
