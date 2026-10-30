---
name: setup-gcs
description: Plan Google Cloud Storage for this app — project, bucket, default GCS_FOLDER inside the bucket, and GKE WIF auth.
---

# Setup GCS

Plan and document GCS for this project using the `gcs-implementations` plugin.

## Steps

1. Read skills `use-gcs-storage` and `connect-gcs-wif`.
2. Load `data/gcs-config.json`, `data/env-vars.json`, `data/wif-gke.json`.
3. Add env vars to `.env.example` and list values the team must fill in `.env` / deploy:
   - `GCS_PROJECT_ID`
   - `GCS_BUCKET`
   - `GCS_FOLDER` (default folder inside the bucket where the app stores files) — **default it to the
     application id** (the git remote's repo name). The deployment platform provisions the bucket with an
     `{appname}/` folder, so any other prefix silently writes outside what it created.
4. Confirm the app stores objects under `GCS_FOLDER` (may append further sub-paths within it).
5. Outline WIF: KSA name, GSA email, IAM binding, no key files.
6. Do not write production code until env placeholders and WIF plan are clear (unless user said implement now).

## Output

```markdown
## GCS setup — <app>

### Project
- GCS_PROJECT_ID: <placeholder>

### Bucket
- GCS_BUCKET: <placeholder>

### Folder (default inside bucket)
- GCS_FOLDER: <app-id>   # the platform provisions {appname}/ — match it
- Object path: gs://GCS_BUCKET/GCS_FOLDER/...

### WIF (GKE)
- KSA / namespace / GSA
- workloadIdentityUser binding
- Storage IAM roles on GSA
```
