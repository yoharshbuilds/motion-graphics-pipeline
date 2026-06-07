# Motion Graphics Pipeline

Extracts motion-graphics frames from videos, enriches them with an LLM, uploads
to blob storage, and serves a searchable viewer.

## Layout

- `extract_motion_graphics.py` — detect & extract motion-graphics frames
- `enrich_artifacts.py` — add LLM descriptions/metadata to extracted frames
- `batch_extract.py` — run extraction over many inputs
- `test_ingest.py` — few-shot ingestion / labeling experiment
- `upload_to_blob.py` — push artifacts to Vercel Blob
- `viewer/` — Next.js app to search and browse the artifacts
- `motion_graphics/`, `test_artifacts/` — extracted image data

## Setup

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill in OPENROUTER_KEY
export $(grep -v '^#' .env | xargs)
```

## Viewer

```bash
cd viewer
npm install
npm run dev
```

Set `OPENROUTER_KEY` (and optional `GEMINI_API_KEY`) in `viewer/.env.local`.

## Configuration

All API keys come from environment variables — see `.env.example`. Never commit
real keys.
