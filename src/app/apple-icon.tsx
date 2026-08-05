import { ImageResponse } from "next/og";

/** iOS home-screen icon — Apple ignores SVG favicons, so this generates the
 *  same tree glyph as icon.svg as a PNG at the size Apple documents. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbf6ec",
        }}
      >
        <svg
          width="132"
          height="132"
          viewBox="0 0 32 32"
          fill="none"
          stroke="#a8322a"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <path d="M16 27V14" />
          <path d="M16 18.5c-2.6-.6-4.4-2-5.2-4.2M16 18.5c2.6-.6 4.4-2 5.2-4.2" />
          <path d="M16 23c-3.6-.5-6.2-2.2-7.6-4.8M16 23c3.6-.5 6.2-2.2 7.6-4.8" />
          <circle cx="16" cy="8.6" r="4.2" />
          <circle cx="8.6" cy="12.4" r="3.1" />
          <circle cx="23.4" cy="12.4" r="3.1" />
          <path d="M11 28h10" strokeWidth={2} />
          <path d="M12.6 28c.5-1.2 1.7-1.9 3.4-1.9s2.9.7 3.4 1.9" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
