import subprocess, json, sys
from pathlib import Path

OUT_DIR = Path("motion_graphics")
OUT_DIR.mkdir(exist_ok=True)

CHANNEL = "https://www.youtube.com/@aevytv/shorts"
N = int(sys.argv[1]) if len(sys.argv) > 1 else 10

# Fetch N shorts
print(f"Fetching {N} shorts from @aevytv...")
result = subprocess.run([
    "yt-dlp", "--flat-playlist", "-I", f"1:{N}",
    "--print", "%(id)s %(title)s", CHANNEL
], capture_output=True, text=True)

videos = []
for line in result.stdout.strip().split("\n"):
    line = line.strip()
    if not line: continue
    vid_id, title = line.split(" ", 1)[0], line.split(" ", 1)[1]
    videos.append({"id": vid_id, "title": title})
    print(f"  [{len(videos)}] {title}")

print(f"\nProcessing {len(videos)} videos...\n")

all_results = []
for i, vid in enumerate(videos):
    print(f"\n{'═'*60}")
    print(f"[{i+1}/{len(videos)}] {vid['title']}")
    print(f"{'═'*60}")

    url = f"https://www.youtube.com/shorts/{vid['id']}"
    out_json = OUT_DIR / f"{vid['id']}_motion_graphics.json"

    # Skip if already processed
    if out_json.exists():
        print("  Already processed — skipping")
        data = json.load(open(out_json))
        all_results.extend(data)
        continue

    r = subprocess.run(
        ["venv/bin/python3", "extract_motion_graphics.py", url],
        capture_output=False
    )

    if out_json.exists():
        data = json.load(open(out_json))
        print(f"  → {len(data)} motion graphics extracted")
        all_results.extend(data)
    else:
        print(f"  → No output (may have failed)")

# Save combined repo
repo_path = OUT_DIR / "repo_motion_graphics.json"
with open(repo_path, "w") as f:
    json.dump(all_results, f, indent=2)

print(f"\n{'='*60}")
print(f"TOTAL: {len(all_results)} motion graphics from {len(videos)} videos")
by_type = {}
for a in all_results:
    t = a.get("type","?")
    by_type[t] = by_type.get(t, 0) + 1
for t, c in sorted(by_type.items(), key=lambda x: -x[1]):
    print(f"  {t}: {c}")
print(f"Saved: {repo_path}")
