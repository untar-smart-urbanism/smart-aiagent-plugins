# GCS Implementations

Company standard for **Google Cloud Storage** as application object/file storage, with **Workload Identity Federation (WIF)** on GKE (no key files).

## Purpose

When agents implement uploads, downloads, or persistent files:

1. Use **GCS** (not S3 / Azure Blob / local disk for durable storage)
2. Configure **project** (`GCS_PROJECT_ID`) + **bucket** (`GCS_BUCKET`) via env vars
3. Required **GCS_FOLDER** — default folder inside the bucket where the app stores files
4. Authenticate on GKE with **WIF** (KSA ↔ GSA)

## Auth flow (WIF on GKE + ADC in app)

1. Pod runs with a **Kubernetes ServiceAccount (KSA)** annotated with the **GCP Service Account (GSA)** email  
2. **GKE metadata server** exchanges the KSA token for a short-lived GSA token  
3. **IAM** verifies binding via `roles/iam.workloadIdentityUser`  
4. Pod gets GSA-scoped credentials — **no key file, no key rotation**  
5. App uses **Application Default Credentials** (`GOOGLE_APPLICATION_CREDENTIALS` or workload identity) with a **lazily-created Storage singleton** on `globalThis` (mirrors `db.ts`; see `templates/gcs-client.ts`)

## Components

| Component | Purpose |
|-----------|---------|
| `data/gcs-config.json` | URLs, project, buckets, folder policy |
| `data/wif-gke.json` | WIF steps + manifest hints |
| `data/env-vars.json` | Env var checklist |
| Skill `use-gcs-storage` | When/how to use GCS |
| Skill `connect-gcs-wif` | WIF connection on GKE |
| Rule `gcs-storage-enforcement` | Always-on when storage is needed |
| Rule `gcs-wif-gke` | File-scoped K8s / backend |
| Agent `gcs-storage-guardian` | Enforcement subagent |
| Commands `/setup-gcs`, `/check-gcs-wif` | Plan and audit |

## Install

```text
/add-plugin gcs-implementations
/plugin install gcs-implementations@smart-aiagent-plugins
```

Install with `tech-radar`, `code-review`, and `scan-dependency`.

## Env example

```bash
GCS_PROJECT_ID=my-gcp-project
GCS_BUCKET=myapp-storage-dev
GCS_FOLDER=uploads
```

Objects default to `gs://GCS_BUCKET/GCS_FOLDER/...`. Real values in gitignored `.env`; placeholders in `.env.example`.

## References

- [Cloud Storage docs](https://cloud.google.com/storage/docs)
- [Workload Identity for GKE](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- [Node.js Storage client](https://cloud.google.com/nodejs/docs/reference/storage/latest)
