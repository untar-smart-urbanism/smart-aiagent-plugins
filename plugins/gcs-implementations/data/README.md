# GCS implementations data

| File | Purpose |
|------|---------|
| `gcs-config.json` | GCS as mandatory storage: URLs, project, bucket, default folder inside bucket |
| `wif-gke.json` | WIF on GKE + ADC app auth (singleton client) |
| `env-vars.json` | Env vars: `GCS_PROJECT_ID`, `GCS_BUCKET`, `GCS_FOLDER` |

Template: `templates/gcs-client.ts` — ADC + `globalThis` Storage singleton.

References:

- [Cloud Storage docs](https://cloud.google.com/storage/docs)
- [Workload Identity for GKE](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
