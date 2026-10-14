import { NextResponse } from "next/server";
import { suggest } from "@/lib/search";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  return NextResponse.json(
    { suggestions: suggest(q, 8) },
    {
      headers: {
        // Type-ahead results change only when the archive does, so let the
        // browser and any CDN in front of it hold them.
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
