import subprocess, json, base64, sys, os
from pathlib import Path
from openai import OpenAI

OPENROUTER_KEY = os.environ["OPENROUTER_KEY"]
MODEL = "google/gemini-2.5-flash"
OUT_DIR = Path("motion_graphics")
OUT_DIR.mkdir(exist_ok=True)

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_KEY)

VIDEO_URL = sys.argv[1] if len(sys.argv) > 1 else "https://youtube.com/shorts/2sZ6MYfACLo"

# ── Download ──────────────────────────────────────────────────────────────
print(f"Fetching: {VIDEO_URL}")
info = subprocess.run(["yt-dlp","--print","%(id)s %(title)s", VIDEO_URL], capture_output=True, text=True)
line = info.stdout.strip().split("\n")[0]
video_id, video_title = line.split(" ",1)[0], line.split(" ",1)[1]
print(f"Video: {video_title}")

video_path = OUT_DIR / f"{video_id}.mp4"
if not video_path.exists():
    subprocess.run([
        "yt-dlp", "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best",
        "-o", str(video_path), VIDEO_URL
    ], check=True)

probe = subprocess.run(["ffprobe","-v","quiet","-print_format","json","-show_streams",str(video_path)], capture_output=True, text=True)
duration = float(next(s["duration"] for s in json.loads(probe.stdout)["streams"] if s.get("codec_type")=="video"))
print(f"Duration: {duration:.1f}s\n")

def extract_frame(ts, suffix="", size=320):
    fp = OUT_DIR / f"{video_id}_{suffix}{ts:.1f}s.jpg"
    subprocess.run(["ffmpeg","-y","-ss",f"{ts:.2f}","-i",str(video_path),
                    "-frames:v","1","-q:v","3","-vf",f"scale={size}:-1",str(fp)], capture_output=True)
    return fp if fp.exists() and fp.stat().st_size > 2000 else None

def b64(fp): return base64.b64encode(Path(fp).read_bytes()).decode()

def ask(messages, max_tokens=1500):
    resp = client.chat.completions.create(model=MODEL, messages=messages, max_tokens=max_tokens)
    raw = resp.choices[0].message.content.strip().replace("```json","").replace("```","").strip()
    return json.loads(raw)

# ══════════════════════════════════════════════════════════════════════════
# PASS 1 — Coarse scan: find rough motion graphic segments
# ══════════════════════════════════════════════════════════════════════════
print("── PASS 1: Coarse scan (every 2s) ──")
coarse_frames = []
for ts in [i*2 for i in range(int(duration/2)+1)]:
    fp = extract_frame(ts, "coarse_", 320)
    if fp: coarse_frames.append((ts, fp))
print(f"Extracted {len(coarse_frames)} frames")

# Build multi-image message
content = []
for ts, fp in coarse_frames:
    content.append({"type":"text","text":f"t={ts}s:"})
    content.append({"type":"image_url","image_url":{"url":f"data:image/jpeg;base64,{b64(fp)}"}})
content.append({"type":"text","text":"""These are frames from a short video sampled every 2 seconds.

Identify ALL motion graphic segments — composed visual frames that are NOT plain talking head:
- Bold text reveals / stat cards
- Split-screen layouts (B-roll + host)
- Webpage/article screenshots shown as evidence
- Historical photo composites with text overlay
- Infographics, charts, animated text

For each segment return:
{
  "segments": [
    {
      "rough_start": <timestamp in seconds>,
      "rough_end": <timestamp in seconds>,
      "type": "text_reveal|split_screen|screenshot|composite|infographic|other",
      "description": "<brief description>"
    }
  ]
}

JSON only."""})

print("Sending to Gemini for coarse detection...")
try:
    result = ask([{"role":"user","content":content}])
    segments = result.get("segments", [])
    print(f"Found {len(segments)} rough segments:")
    for s in segments:
        print(f"  [{s['type']}] t={s['rough_start']}–{s['rough_end']}s — {s['description'][:60]}")
except Exception as e:
    print(f"Pass 1 error: {e}"); sys.exit(1)

# ══════════════════════════════════════════════════════════════════════════
# PASS 2 — Refine: zoom into each segment at 0.5s resolution
# ══════════════════════════════════════════════════════════════════════════
print("\n── PASS 2: Refine each segment (every 0.5s) ──")
refined = []

for seg in segments:
    start = max(0, seg["rough_start"] - 1.0)
    end   = min(duration, seg["rough_end"] + 1.0)
    print(f"\n  Refining [{seg['type']}] t={seg['rough_start']}–{seg['rough_end']}s")

    fine_frames = []
    ts = start
    while ts <= end:
        fp = extract_frame(ts, "fine_", 540)
        if fp: fine_frames.append((ts, fp))
        ts = round(ts + 0.5, 1)

    content2 = []
    for ts, fp in fine_frames:
        content2.append({"type":"text","text":f"t={ts}s:"})
        content2.append({"type":"image_url","image_url":{"url":f"data:image/jpeg;base64,{b64(fp)}"}})
    content2.append({"type":"text","text":f"""These frames show a "{seg['type']}" motion graphic at 0.5s resolution.

Find the EXACT timestamps:
- start_time: when the animation first begins (first frame that differs from plain talking head)
- end_time: when the animation fully leaves the screen
- complete_time: the timestamp where ALL elements are fully in their final position — nothing is still moving/animating in

Return JSON only:
{{
  "start_time": <float>,
  "end_time": <float>,
  "complete_time": <float>,
  "type": "{seg['type']}",
  "description": "<description of what the complete motion graphic looks like>"
}}"""})

    try:
        r2 = ask([{"role":"user","content":content2}])
        r2["description_orig"] = seg["description"]
        clip_dur = min(5.0, max(2.0, r2["end_time"] - r2["start_time"]))
        r2["clip_duration"] = round(clip_dur, 1)
        print(f"    start={r2['start_time']}s end={r2['end_time']}s complete={r2['complete_time']}s ({clip_dur:.1f}s clip)")
        refined.append(r2)
    except Exception as e:
        print(f"    Refine error: {e}")

# ══════════════════════════════════════════════════════════════════════════
# PASS 3 — Verify + score complete frame
# ══════════════════════════════════════════════════════════════════════════
print("\n── PASS 3: Verify complete frames ──")
final = []

for seg in refined:
    ct = seg["complete_time"]
    fp = extract_frame(ct, "complete_", 720)
    if not fp:
        print(f"  t={ct}s — couldn't extract frame, skipping")
        continue

    content3 = [
        {"type":"image_url","image_url":{"url":f"data:image/jpeg;base64,{b64(fp)}"}},
        {"type":"text","text":f"""This should be the "complete" state of a motion graphic: "{seg['description']}".

Verify:
1. Is this frame fully rendered? (all text/elements in final position, no blur/fade/partial animation)
2. Quality score 1-10 (10 = crystal clear, compelling, would make great reference; 1 = blurry/mid-animation/plain talking head)
3. If the complete_time is wrong (frame looks mid-animation), suggest a better complete_time offset: -1.0, -0.5, 0, +0.5, or +1.0 seconds

JSON only:
{{
  "fully_rendered": true/false,
  "quality_score": <1-10>,
  "time_adjustment": <-1.0|-0.5|0|0.5|1.0>,
  "reason": "<brief>"
}}"""}
    ]

    try:
        r3 = ask([{"role":"user","content":content3}], max_tokens=200)
        score = r3.get("quality_score", 5)
        adj   = r3.get("time_adjustment", 0)
        print(f"  t={ct}s — score={score}/10 adj={adj:+.1f}s fully_rendered={r3.get('fully_rendered')} — {r3.get('reason','')[:60]}")

        if score < 6:
            print(f"    → Dropped (quality too low)")
            continue

        # Apply time adjustment if needed
        final_complete_time = round(ct + adj, 1)
        if adj != 0:
            fp = extract_frame(final_complete_time, "complete_adj_", 720) or fp

        seg["complete_time"]  = final_complete_time
        seg["complete_frame"] = str(fp)
        seg["quality_score"]  = score
        seg["verified"]       = r3.get("fully_rendered", False)
        final.append(seg)

    except Exception as e:
        print(f"  t={ct}s verify error: {e}")
        seg["complete_frame"] = str(fp)
        seg["quality_score"]  = 5
        final.append(seg)

# ══════════════════════════════════════════════════════════════════════════
# Generate GIFs + save results
# ══════════════════════════════════════════════════════════════════════════
print(f"\n── Generating {len(final)} GIFs ──")

for i, seg in enumerate(final):
    gif_path = OUT_DIR / f"{video_id}_mg{i+1}.gif"
    start = seg["start_time"]
    dur   = seg["clip_duration"]

    print(f"  [{i+1}] t={start}s ({dur}s) → {gif_path.name}")
    subprocess.run([
        "ffmpeg", "-y", "-ss", f"{start:.2f}", "-i", str(video_path),
        "-t", f"{dur:.1f}",
        "-vf", "fps=12,scale=540:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer",
        "-loop", "0", str(gif_path)
    ], capture_output=True)

    seg["gif_path"] = str(gif_path) if gif_path.exists() else None
    seg["video_id"] = video_id
    seg["video_title"] = video_title

# Save metadata
out_json = OUT_DIR / f"{video_id}_motion_graphics.json"
with open(out_json, "w") as f:
    json.dump(final, f, indent=2)

# Delete source video + intermediate frames to save space
video_path.unlink(missing_ok=True)
print(f"Deleted: {video_path.name}")
for f in OUT_DIR.glob(f"*_{video_id}_*.jpg"):
    f.unlink(missing_ok=True)
for f in OUT_DIR.glob(f"{video_id}_coarse_*.jpg"):
    f.unlink(missing_ok=True)
for f in OUT_DIR.glob(f"{video_id}_fine_*.jpg"):
    f.unlink(missing_ok=True)
print(f"Deleted intermediate frames")

print(f"\n{'='*60}")
print(f"DONE: {len(final)} motion graphics extracted")
for i, s in enumerate(final):
    print(f"  [{i+1}] {s['type']} t={s['start_time']}–{s['end_time']}s score={s['quality_score']}/10")
    print(f"       {s['description'][:70]}")
print(f"{'='*60}")
print(f"Saved: {out_json}")
