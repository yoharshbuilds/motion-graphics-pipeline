import { NextRequest, NextResponse } from "next/server";
import allData from "@/data.json";
import type { Artifact } from "@/lib/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENROUTER_KEY = process.env.OPENROUTER_KEY || "";

function scoreArtifact(artifact: Artifact, analysis: Record<string, string>): number {
  const query = Object.values(analysis).join(" ").toLowerCase();
  const words = query.split(/[\s,|]+/).filter(w => w.length > 2);

  const artifactText = [
    artifact.visual_style || "",
    artifact.visual_topic || "",
    artifact.color_palette || "",
    (artifact.tags || []).join(" "),
    artifact.type,
    artifact.description || "",
  ].join(" ").toLowerCase();

  let score = 0;
  for (const word of words) {
    if (artifactText.includes(word)) score++;
  }
  score += (artifact.quality_score || 5) * 0.2;
  return score;
}

export async function POST(req: NextRequest) {
  const { frames } = await req.json();

  if (!frames || frames.length === 0) {
    return NextResponse.json({ error: "No frames provided" }, { status: 400 });
  }

  let analysis: Record<string, string> = {
    visual_style: "",
    visual_topic: "",
    color_palette: "",
    mood: "",
  };

  try {
    const content = frames.slice(0, 8).flatMap((b64: string, i: number) => [
      { type: "text", text: `Frame ${i + 1}:` },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
    ]);
    content.push({
      type: "text",
      text: `Analyze these video frames for a video editor. Return JSON:
{
  "visual_style": "<2-4 style descriptors — e.g. 'dark minimal, kinetic text, neon accent' or 'retro illustration, warm palette, bold typography'>",
  "visual_topic": "<3-6 word topic — e.g. 'AI cost crisis' or 'Indian startup ecosystem'>",
  "color_palette": "<2-3 dominant colors>",
  "mood": "<1-2 words — e.g. 'urgent dramatic' or 'playful energetic'>"
}
JSON only.`,
    });

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
        max_tokens: 200,
      }),
    });

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content?.trim()
      .replace(/```json/g, "").replace(/```/g, "").trim();
    if (raw) analysis = JSON.parse(raw);
  } catch {
    // use empty analysis — still rank by quality
  }

  // Score + rank artifacts
  const artifacts = allData as Artifact[];
  const scored = artifacts
    .map((a, index) => ({ index, score: scoreArtifact(a, analysis) }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ analysis, results: scored.slice(0, 30) });
}
