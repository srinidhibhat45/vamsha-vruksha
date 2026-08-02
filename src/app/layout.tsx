import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getArchive } from "@/lib/archive";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ec" },
    { media: "(prefers-color-scheme: dark)", color: "#14110e" },
  ],
};

/**
 * Applied before paint so the page never flashes the wrong theme. Reads an
 * explicit choice from localStorage, otherwise follows the system.
 */
const THEME_BOOTSTRAP = `
(function(){
  try {
    var saved = localStorage.getItem("vv-theme");
    var dark = saved ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const archive = getArchive();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/*
          Loaded with a plain stylesheet link rather than next/font so the build
          does not depend on network access to Google's servers. The stacks in
          globals.css degrade to serviceable system faces if it fails.
        */}
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..600&family=Archivo:wght@400..700&family=Noto+Serif+Devanagari:wght@400..600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <a
          href="#main"
          className="btn btn-filled sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50"
        >
          Skip to content
        </a>
        <SiteHeader
          totalPeople={archive.stats.people}
          sampleOnly={archive.sampleOnly}
        />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter stats={archive.stats} />
      </body>
    </html>
  );
}
