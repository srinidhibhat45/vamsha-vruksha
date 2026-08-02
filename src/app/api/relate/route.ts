import { NextResponse } from "next/server";
import { getArchive, fullName } from "@/lib/archive";
import { relate } from "@/lib/kinship";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  if (!a || !b) {
    return NextResponse.json({ error: "Need both a and b" }, { status: 400 });
  }

  const archive = getArchive();
  const pa = archive.people.get(a);
  const pb = archive.people.get(b);
  if (!pa || !pb) {
    return NextResponse.json({ error: "Unknown person" }, { status: 404 });
  }

  const r = relate(archive, a, b);
  return NextResponse.json({
    a: { id: a, name: fullName(pa) },
    b: { id: b, name: fullName(pb) },
    kind: r.kind,
    term: r.term,
    reciprocal: r.reciprocal,
    degrees: r.degrees,
    distance: r.distance,
    consanguinity: r.consanguinity,
    commonAncestors: (r.commonAncestorIds ?? []).map((id) => ({
      id,
      name: fullName(archive.people.get(id)!),
    })),
    path: r.path.map((s) => ({
      via: s.via,
      toId: s.toId,
      label: s.label,
    })),
  });
}
