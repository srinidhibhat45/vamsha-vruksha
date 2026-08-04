import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Archivo, Newsreader, Noto_Serif_Devanagari } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getArchive } from "@/lib/archive";

/*
  The three faces, fetched once at build and served from this site's own
  origin.

  They used to arrive through a plain <link> to fonts.googleapis.com. That
  stylesheet is render-blocking and cross-origin, so every page — even the
  ones prerendered to static HTML sitting on a CDN — could not paint until
  two DNS lookups, two TLS handshakes and two round trips to Google had
  finished. On a slow or filtered connection that is the whole of the wait a
  reader experiences, and no amount of server-side speed makes up for it.

  next/font downloads the files at build time and emits a preload for the
  faces this page actually uses, so there is no third-party request left on
  the critical path at all. `fallback` keeps the metric-adjusted local stack
  the CSS already named, so the text that paints before the webfont arrives
  is close to the right size and the page does not jump.
*/
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
  fallback: ["Iowan Old Style", "Palatino Linotype", "Palatino", "Georgia", "serif"],
});

const archivo = Archivo({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-archivo",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

/* Only the Konkani needs this one, which is why it is a variable of its own
   rather than part of the body stack — it is never in the critical path for
   a page with no Devanagari on it. */
const devanagari = Noto_Serif_Devanagari({
  subsets: ["devanagari"],
  display: "swap",
  variable: "--font-noto-devanagari",
  fallback: ["Nirmala UI", "Kohinoor Devanagari", "serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Vansh Vriksha — a shared lineage archive",
    template: "%s · Vansh Vriksha",
  },
  description:
    "A public, community-built family tree and archive, open to every family and every community. Free to read, free to search, and no account needed to contribute.",
  openGraph: {
    title: "Vansh Vriksha — a shared lineage archive",
    description:
      "One family tree, open to every family. Search by name, gotra, kuladevata or ancestral village.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#fbf6ec",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const archive = getArchive();

  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${archivo.variable} ${devanagari.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="btn btn-filled sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        >
          Skip to content
        </a>
        {/*
          The header reads the query string, so that the search box on
          /search holds what was searched for rather than coming up empty.
          useSearchParams() opts its subtree out of prerendering, and without
          this boundary that subtree would be the root layout — which is to
          say every page on the site, including the hundreds that are static
          files on a CDN today. The boundary keeps the deopt where it belongs:
          the header still prerenders, and the one value it cannot know until
          the browser has a URL arrives on hydration.
        */}
        <Suspense>
          <SiteHeader
            totalPeople={archive.stats.people}
            sampleOnly={archive.sampleOnly}
          />
        </Suspense>
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter stats={archive.stats} />
      </body>
    </html>
  );
}
