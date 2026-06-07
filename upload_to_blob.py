import subprocess, json, os, sys
from pathlib import Path

# Read OIDC token from .env.local
env = {}
for line in Path("viewer/.env.local").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        env[k] = v.strip('"')

OIDC_TOKEN = env.get("VERCEL_OIDC_TOKEN", "")
STORE_ID = "store_zICJh1ANvOenqPFu"

if not OIDC_TOKEN:
    print("No OIDC token found"); sys.exit(1)

# Find all final output files
gifs  = sorted(Path("motion_graphics").glob("*_mg*.gif"))
jpgs  = sorted(Path("motion_graphics").glob("*_complete*.jpg"))
files = gifs + jpgs
print(f"Uploading {len(gifs)} GIFs + {len(jpgs)} JPGs = {len(files)} files")

uploaded = {}
errors = []

for i, fp in enumerate(files):
    size_mb = fp.stat().st_size / 1024 / 1024
    print(f"  [{i+1}/{len(files)}] {fp.name} ({size_mb:.1f}MB)...", end=" ", flush=True)

    r = subprocess.run([
        "vercel", "blob", "put", str(fp),
        "--store-id", STORE_ID,
        "--oidc-token", OIDC_TOKEN,
        "--output", "json"
    ], capture_output=True, text=True, cwd="viewer")

    if r.returncode == 0:
        try:
            data = json.loads(r.stdout)
            url = data.get("url", "")
            uploaded[fp.name] = url
            print(f"✓ {url.split('/')[-1][:40]}")
        except:
            print(f"✗ parse error: {r.stdout[:80]}")
            errors.append(fp.name)
    else:
        print(f"✗ {r.stderr[:80]}")
        errors.append(fp.name)

# Save URL mapping
out = Path("motion_graphics/blob_urls.json")
with open(out, "w") as f:
    json.dump(uploaded, f, indent=2)

print(f"\n✓ {len(uploaded)} uploaded, ✗ {len(errors)} failed")
if errors: print(f"Failed: {errors[:5]}")
print(f"Saved: {out}")
