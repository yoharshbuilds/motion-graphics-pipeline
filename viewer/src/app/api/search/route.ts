import { NextRequest, NextResponse } from "next/server";
import allData from "@/data.json";
import type { Artifact } from "@/lib/types";

function score(artifact: Artifact, query: string): number {
  const words = query.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2);
  const text = [
    artifact.visual_style || "",
    artifact.visual_topic || "",
    artifact.color_palette || "",
    (artifact.tags || []).join(" "),
    artifact.type.replace(/_/g, " "),
    artifact.description || "",
    artifact.video_title || "",
  ].join(" ").toLowerCase();

  let s = 0;
  for (const w of words) {
    if (text.includes(w)) s += 2;
    // partial match
    for (const token of text.split(/\s+/)) {
      if (token.startsWith(w) || w.startsWith(token)) s += 0.5;
    }
  }
  s += (artifact.quality_score || 5) * 0.2;
  return s;
}

export async function POST(req: NextRequest) {
  const { query } = await req.json();
  if (!query?.trim()) return NextResponse.json({ results: (allData as Artifact[]).map((_, i) => i) });

  const scored = (allData as Artifact[])
    .map((a, i) => ({ index: i, score: score(a, query) }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ results: scored.map(r => r.index) });
}
