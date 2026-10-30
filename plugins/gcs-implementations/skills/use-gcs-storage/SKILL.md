---
name: use-gcs-storage
description: Use Google Cloud Storage for application file/object storage. Load GCS_PROJECT_ID, GCS_BUCKET, and GCS_FOLDER from env. Store files under GCS_FOLDER inside the bucket by default. Use eagerly when implementing uploads, downloads, or persistent file storage — do not use local disk, S3, or Azure Blob for new work.
---

# Use GCS storage

**Mandatory object storage** for new application file/object storage: **Google Cloud Storage (GCS)**.

## When to use (do not wait for the user to ask)

Activate when **any** of the following is true:

1. Feature uploads, downloads, or stores files/objects
2. User asks for "storage", "bucket", "S3", "blob", or file upload
3. You are about to write upload handlers or storage services
4. Deploying static assets to GCP storage

## Data to load

| File | Purpose |
|------|---------|
| `data/gcs-config.json` | Provider, URLs, project, buckets, folder policy |
| `data/env-vars.json` | Env var names for `.env` / `.env.example` |
| `data/wif-gke.json` | How to authenticate on GKE (WIF) |

## Mandatory choices

| Topic | Policy |
|-------|--------|
| Provider | **GCS only** for new work |
| Project | `GCS_PROJECT_ID` in env |
| Bucket | `GCS_BUCKET` in env — **fill real bucket name in local `.env` / deploy config** |
| Folder | Required `GCS_FOLDER` — **default folder inside the bucket** where the app stores files |
| Auth on GKE | **WIF** — see skill `connect-gcs-wif` |

## URLs

- Docs: https://cloud.google.com/storage/docs
- Console: https://console.cloud.google.com/storage
- Object HTTP: `https://storage.googleapis.com/{bucket}/{object}`
- URI: `gs://{bucket}/{object}`
- Node SDK: `@google-cloud/storage`

## Env checklist (before coding storage)

Add to `.env.example` (placeholders only) and local `.env` (real values, gitignored):

```bash
GCS_PROJECT_ID=my-gcp-project
GCS_BUCKET=myapp-storage-dev
GCS_FOLDER=uploads
```

**Do not** hardcode bucket, folder, or project strings in source.

## Folder (default inside the bucket)

`GCS_FOLDER` is the **default folder** inside `GCS_BUCKET`. Store files under it:

- Object path: `gs://{GCS_BUCKET}/{GCS_FOLDER}/...`
- Keys: `${GCS_FOLDER}/${filename}` or `${GCS_FOLDER}/${subPath}/${filename}` if the app adds further sub-paths

Do not store app files at the bucket root — always use `GCS_FOLDER` as the base path.

Sanitize user-controlled path segments (no `..`, no absolute paths). Follow OWASP file management (`code-review` plugin).

## Implementation outline (Node.js)

1. Depend on `@google-cloud/storage` (run `scan-dependency` / `check-dependency` first).
2. Authenticate via **Application Default Credentials** (`GOOGLE_APPLICATION_CREDENTIALS` or workload identity) — see skill `connect-gcs-wif` and `templates/gcs-client.ts`.
3. Use a **lazily-created Storage singleton** cached on `globalThis` (mirrors `db.ts`; avoids leaking clients across hot reloads).
4. Read `GCS_BUCKET` / `GCS_FOLDER`; store under the folder. Do **not** pass `keyFilename` in production.
5. Wire GKE WIF platform steps via skill `connect-gcs-wif`.
6. Validate uploads (type, size, auth) per OWASP file management.

## Forbidden for new work

- Persistent uploads on local pod disk only
- AWS S3 / Azure Blob as default for new company apps (unless explicit override)
- Service account JSON keys in repo or as long-lived secrets for GCS on GKE
