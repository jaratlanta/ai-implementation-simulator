# Meaningful AI Content for RAG

Drop `.txt` files into this folder. They'll be chunked and inserted into the database so the owl advisors can draw on Meaningful AI's expertise during conversations.

## What to put here

- **Meeting transcripts** — stripped of personally identifiable info
- **LinkedIn posts** — copy/paste the text
- **White papers & strategy docs** — the Lighthouse strategy doc, flywheel framework, etc.
- **Framework documentation** — People/Process/Technology, strategy phases
- **Case studies** — anonymized client engagements
- **Technical content** — from Sean or the technology channel

## File naming

Name files descriptively with `.txt` extension:
- `transcript-strategy-discussion.txt`
- `linkedin-ai-readiness.txt`
- `whitepaper-lighthouse-strategy.txt`
- `framework-people-process-technology.txt`

## manifest.json (optional)

Create a `manifest.json` to tag each file with metadata:

```json
{
  "transcript-strategy-discussion.txt": {
    "source_type": "transcript",
    "source_name": "Strategy Discussion - March 2026",
    "tags": ["strategy", "change-management"]
  },
  "linkedin-ai-readiness.txt": {
    "source_type": "linkedin",
    "source_name": "AI Readiness LinkedIn Post",
    "tags": ["readiness", "assessment"]
  }
}
```

Valid `source_type` values: `transcript`, `linkedin`, `whitepaper`, `framework`, `case_study`, `technical`

If no manifest.json exists, files are auto-tagged based on their filename.

## Ingestion

Once files are here, run:
```bash
cd server && npm run ingest-content
```

This clears all existing chunks and re-ingests everything fresh.
