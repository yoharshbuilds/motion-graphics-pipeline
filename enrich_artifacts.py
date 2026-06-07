import json, base64, os
from pathlib import Path
from openai import OpenAI

OPENROUTER_KEY = os.environ["OPENROUTER_KEY"]
MODEL = "google/gemini-2.5-flash"

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_KEY)

data = json.load(open("motion_graphics/repo_motion_graphics.json"))
print(f"Enriching {len(data)} artifacts with visual metadata...\n")

for i, mg in enumerate(data):
    if mg.get("visual_style"):
        print(f"  [{i+1}/{len(data)}] already enriched, skipping")
        continue

    frame_path = Path(mg.get("complete_frame", ""))
    if not frame_path.exists():
        print(f"  [{i+1}/{len(data)}] no frame, skipping")
        continue

    b64 = base64.b64encode(frame_path.read_bytes()).decode()
    print(f"  [{i+1}/{len(data)}] {mg['type']} t={mg['start_time']}s — {mg['video_title'][:40]}...", end=" ", flush=True)

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    {"type": "text", "text": """Analyze this motion graphic frame for a video editor reference library.

Return JSON with these fields:

{
  "visual_style": "<2-4 descriptive style tags focused on HOW it looks — e.g. 'retro illustration, warm palette, serif typography, hand-drawn' or 'dark minimal, kinetic bold text, neon accent, sans-serif' or 'split-screen, documentary, text overlay, neutral tones'>",
  "visual_topic": "<what this graphic is ABOUT in 3-6 words — e.g. 'wealth inequality India' or 'AI cost crisis' or 'Rolex charity structure'>",
  "visible_text": "<all readable text visible in the frame, comma separated>",
  "color_palette": "<2-3 dominant colors — e.g. 'black, gold, white' or 'orange, beige, dark brown'>",
  "tags": ["<5-8 searchable keywords covering visual elements, topic, style, emotion>"]
}

Focus heavily on visual style — this is for editors searching by aesthetic, not just topic.
JSON only."""}
                ]
            }],
            max_tokens=300
        )

        raw = resp.choices[0].message.content.strip().replace("```json","").replace("```","").strip()
        enriched = json.loads(raw)
        mg.update(enriched)
        print(f"✓ {mg['visual_style'][:60]}")

    except Exception as e:
        print(f"✗ {e}")

# Save enriched repo
with open("motion_graphics/repo_motion_graphics.json", "w") as f:
    json.dump(data, f, indent=2)

# Update viewer data.json too
for mg in data:
    cf = Path(mg.get("complete_frame",""))
    gif_name = f"{mg['video_id']}_mg_{int(mg['start_time'])}s.gif"
    mg["frame_url"] = f"/frames/{cf.name}" if cf.name and (Path("viewer/public/frames")/cf.name).exists() else None
    mg["gif_url"] = f"/gifs/{gif_name}" if (Path("viewer/public/gifs")/gif_name).exists() else None

Path("viewer/src/data.json").write_text(json.dumps(data, indent=2))

print(f"\nDone. Sample enriched entry:")
sample = next((m for m in data if m.get("visual_style")), data[0])
print(f"  visual_style:  {sample.get('visual_style','—')}")
print(f"  visual_topic:  {sample.get('visual_topic','—')}")
print(f"  color_palette: {sample.get('color_palette','—')}")
print(f"  visible_text:  {str(sample.get('visible_text','—'))[:80]}")
print(f"  tags:          {sample.get('tags','—')}")
