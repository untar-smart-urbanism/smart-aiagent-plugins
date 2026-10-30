---
name: check-gcs-wif
description: Audit whether GCS usage and GKE Workload Identity Federation follow company policy (env buckets, no key files).
---

# Check GCS + WIF

Audit this project against the `gcs-implementations` plugin.

## Steps

1. Load `data/gcs-config.json` and `data/wif-gke.json`.
2. Find storage usage (imports of `@google-cloud/storage`, upload handlers, S3 SDK).
3. Verify:
   - GCS is used (flag S3/local-only durable storage)
   - `GCS_PROJECT_ID`, `GCS_BUCKET`, and `GCS_FOLDER` exist in `.env.example`
   - App stores objects under `GCS_FOLDER` inside the bucket
   - No hardcoded bucket/project in source
   - No `keyFilename` / JSON keys for GKE production path — ADC only
   - Storage client is a lazy singleton on `globalThis` (not per-request)
   - KSA annotation + `serviceAccountName` if K8s manifests exist
4. Report violations with file paths and fixes.

## Report

```markdown
## GCS / WIF audit

### Compliant
- ...

### Violations
- ...

### Missing env
- ...
```
