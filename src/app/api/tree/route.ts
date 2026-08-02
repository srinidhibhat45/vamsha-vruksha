import { NextResponse } from "next/server";
import { buildTreePayload, resolveLineage } from "@/lib/treeSource";

export const dynamic = "force-dynamic";

/**
 * Returns a whole lineage subgraph. Used when the reader jumps to a person in
 * a different family from the one currently loaded in the viewer.
 */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lineageId =
    searchParams.get("lineage") ??
    resolveLineage(searchParams.get("person") ?? undefined);

  if (!lineageId) {
    return NextResponse.json({ error: "No lineages in the archive" }, { status: 404 });
  }

  const payload = buildTreePayload(lineageId);
  if (!payload) {
    return NextResponse.json({ error: "Unknown lineage" }, { status: 404 });
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" },
  });
}
