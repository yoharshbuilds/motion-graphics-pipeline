import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { selectedArtifacts, prompt, mode } = await req.json();

  // STUB — Veo 2 / Imagen integration placeholder
  // When ready: call Google AI Studio API with:
  //   - selectedArtifacts[].frame_url as reference images
  //   - prompt as generation instruction
  //   - mode: "image" | "video"
  //
  // const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  // const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/veo-2:generateVideo", {
  //   method: "POST",
  //   headers: { "Authorization": `Bearer ${GEMINI_API_KEY}` },
  //   body: JSON.stringify({ referenceImages: selectedArtifacts.map(a => a.frame_url), prompt })
  // });

  return NextResponse.json({
    status: "stub",
    message: `Generation ready to wire up. Selected ${selectedArtifacts?.length || 0} artifacts. Prompt: "${prompt}". Mode: ${mode || "image"}.`,
    selectedCount: selectedArtifacts?.length || 0,
    prompt,
    mode: mode || "image",
  });
}
