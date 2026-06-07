import subprocess, json, base64, os
from pathlib import Path
from openai import OpenAI

OPENROUTER_KEY = os.environ["OPENROUTER_KEY"]
MODEL = "anthropic/claude-sonnet-4-5"
OUT_DIR = Path("test_artifacts")
OUT_DIR.mkdir(exist_ok=True)

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_KEY)

# ── Few-shot from user-labeled examples ───────────────────────────────────
positive_files = sorted(OUT_DIR.glob("gt_small_gt_positive_*.jpg"))
with open(OUT_DIR / "ground_truth_nyKTfqS8fIo.json") as f:
    gt = json.load(f)
skip_files = sorted(
    [Path(i["frame_path"]) for i in gt if i["label"] == "skip" and Path(i["frame_path"]).exists()],
    key=lambda p: p.stat().st_size
)[:2]

few_shot_msgs = []
for fp in positive_files[:6]:
    b64 = base64.b64encode(fp.read_bytes()).decode()
    few_shot_msgs += [
        {"role": "user", "content": [{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}, {"type": "text", "text": "Is this a graphic?"}]},
        {"role": "assistant", "content": '{"type":"graphic"}'}
    ]
for fp in skip_files:
    b64 = base64.b64encode(fp.read_bytes()).decode()
    few_shot_msgs += [
        {"role": "user", "content": [{"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}, {"type": "text", "text": "Is this a graphic?"}]},
        {"role": "assistant", "content": '{"type":"skip"}'}
    ]
print(f"Few-shot: {len(positive_files[:6])} positive + {len(skip_files)} negative")

SYSTEM = """You classify video frames for a video editor building a reference library.

Return "graphic" for ANY of these composed visual frames:
- Screenshot of a webpage, article, document, or news story shown as evidence
- Historical or archival photo/image with styled text overlay (names, dates, facts)
- Bold large-text stat or fact reveal over a blurred or cinematic background
- Split-screen layout combining two visual elements (e.g. building + host, two subjects)
- Infographic, chart, diagram, or data visualization
- Illustrated or animated scene used to explain a concept

Return "skip" ONLY for:
- Plain talking head with just subtitle captions (person speaking, nothing else designed)
- Blank/black transition frames

When in doubt, return "graphic"."""

def ssim_score(fp1, fp2):
    r = subprocess.run(["ffmpeg", "-i", str(fp1), "-i", str(fp2), "-lavfi", "ssim", "-f", "null", "-"], capture_output=True, text=True)
    line = next((l for l in r.stderr.split("\n") if "All:" in l), "")
    try:
        return float(line.split("All:")[1].split()[0])
    except:
        return 0.0

def cluster_and_pick_best(artifacts):
    groups = []
    for a in artifacts:
        fp = Path(a["frame_path"])
        placed = False
        for group in groups:
            best = max(group, key=lambda x: Path(x["frame_path"]).stat().st_size)
            if ssim_score(Path(best["frame_path"]), fp) > 0.75:
                group.append(a); placed = True; break
        if not placed:
            groups.append([a])
    return [max(g, key=lambda a: Path(a["frame_path"]).stat().st_size) for g in groups]

# ── Fetch 5 shorts from @aevytv ───────────────────────────────────────────
print("\nFetching 5 shorts from @aevytv...")
result = subprocess.run([
    "yt-dlp", "--flat-playlist", "-I", "1:5",
    "--print", "%(id)s %(title)s",
    "https://www.youtube.com/@aevytv/shorts"
], capture_output=True, text=True)

videos = []
for line in result.stdout.strip().split("\n"):
    line = line.strip()
    if not line: continue
    parts = line.split(" ", 1)
    videos.append({"id": parts[0], "title": parts[1] if len(parts) > 1 else "Unknown"})
    print(f"  {videos[-1]['id']} — {videos[-1]['title']}")

all_final = []

for vid in videos:
    video_id    = vid["id"]
    video_title = vid["title"]
    print(f"\n{'─'*60}")
    print(f"▶ {video_title} ({video_id})")

    # Download
    video_path = OUT_DIR / f"short_{video_id}.mp4"
    if not video_path.exists():
        print("  Downloading...")
        subprocess.run([
            "yt-dlp", "-f", "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best",
            "-o", str(video_path), f"https://www.youtube.com/shorts/{video_id}"
        ], check=True)

    # Duration
    probe = subprocess.run(["ffprobe","-v","quiet","-print_format","json","-show_streams",str(video_path)], capture_output=True, text=True)
    duration = float(next(s["duration"] for s in json.loads(probe.stdout)["streams"] if s.get("codec_type")=="video"))
    print(f"  Duration: {duration:.1f}s")

    # Extract 1 frame/sec at +0.5s offset
    print(f"  Extracting {int(duration)+1} frames...")
    raw_frames = []
    for ts in range(0, int(duration) + 1):
        fp = OUT_DIR / f"every_{video_id}_{ts}s.jpg"
        subprocess.run(["ffmpeg","-y","-ss",f"{ts+0.5:.1f}","-i",str(video_path),"-frames:v","1","-q:v","2","-vf","scale=720:-1",str(fp)], capture_output=True)
        if fp.exists() and fp.stat().st_size > 5000:
            raw_frames.append((ts, fp))

    # Classify
    print(f"  Classifying {len(raw_frames)} frames...")
    artifacts = []
    for ts, fp in raw_frames:
        b64 = base64.b64encode(fp.read_bytes()).decode()
        msgs = [{"role": "system", "content": SYSTEM}] + few_shot_msgs + [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                {"type": "text", "text": 'JSON only: {"type":"graphic"|"skip","description":"...","tags":[...]}'}
            ]
        }]
        try:
            resp = client.chat.completions.create(model=MODEL, messages=msgs, max_tokens=120)
            raw = resp.choices[0].message.content.strip().replace("```json","").replace("```","").strip()
            data = json.loads(raw)
            data.update({"timestamp_sec": ts, "frame_path": str(fp),
                         "video_id": video_id, "video_title": video_title,
                         "source_channel": "aevytv"})
            if data["type"] == "graphic":
                artifacts.append(data)
                print(f"    🎨 t={ts}s — {data.get('description','')[:60]}")
        except Exception as e:
            print(f"    t={ts}s error: {e}")

    # Cluster + pick best
    print(f"  Clustering {len(artifacts)} raw graphics...")
    final = cluster_and_pick_best(artifacts)
    print(f"  → {len(final)} unique graphics after dedup")
    all_final.extend(final)

    # Save per-video
    per_video_out = OUT_DIR / f"graphics_{video_id}_final.json"
    with open(per_video_out, "w") as f:
        json.dump(final, f, indent=2)

# ── Save combined repo ────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"TOTAL: {len(all_final)} unique graphics across {len(videos)} shorts")
combined_out = OUT_DIR / "repo_aevytv.json"
with open(combined_out, "w") as f:
    json.dump(all_final, f, indent=2)
print(f"Combined repo saved: {combined_out}")
