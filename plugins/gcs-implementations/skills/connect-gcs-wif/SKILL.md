---
name: connect-gcs-wif
description: Connect apps to Google Cloud Storage via Application Default Credentials — GOOGLE_APPLICATION_CREDENTIALS locally or workload identity (WIF) on GKE. Use a lazily-created Storage singleton on globalThis. Use whenever implementing GCS clients or K8s manifests for apps that call GCS.
---

# Connect GCS via ADC / WIF

**App auth:** Application Default Credentials (ADC) — `GOOGLE_APPLICATION_CREDENTIALS` or **workload identity**.

**GKE platform auth:** Workload Identity Federation (WIF) — no long-lived key files in production.

Full platform steps: `data/wif-gke.json`. Client template: `templates/gcs-client.ts`.

## References

- [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials)
- [Workload Identity for GKE](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity)
- GCS config: `data/gcs-config.json`

## Application code (required pattern)

Authenticates via Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` or workload identity). The Storage client is a **lazily-created singleton**, cached on `globalThis` to avoid leaking clients across hot reloads (mirrors `db.ts`).

```ts
import { Storage } from "@google-cloud/storage";

const globalForGcs = globalThis as typeof globalThis & {
  __gcsStorage?: Storage;
};

export function getStorage(): Storage {
  if (!globalForGcs.__gcsStorage) {
    globalForGcs.__gcsStorage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      // No keyFilename — ADC (GOOGLE_APPLICATION_CREDENTIALS or workload identity)
    });
  }
  return globalForGcs.__gcsStorage;
}

export function getBucket() {
  return getStorage().bucket(process.env.GCS_BUCKET!);
}

/** Default folder inside the bucket */
export function objectKey(relativePath: string): string {
  const folder = process.env.GCS_FOLDER!.replace(/^\/+|\/+$/g, "");
  return `${folder}/${relativePath.replace(/^\/+/, "")}`;
}
```

Prefer copying / adapting `templates/gcs-client.ts`.

## Platform steps (GKE WIF)

1. **Pod uses a Kubernetes ServiceAccount (KSA)** annotated with the GCP Service Account (GSA) email:
   ```yaml
   apiVersion: v1
   kind: ServiceAccount
   metadata:
     name: <app-ksa>
     namespace: <app-namespace>
     annotations:
       iam.gke.io/gcp-service-account: <GSA_NAME>@<GCS_PROJECT_ID>.iam.gserviceaccount.com
   ```
   Deployment/Pod must set `spec.serviceAccountName: <app-ksa>`.

2. **GKE metadata server** exchanges the KSA token for a **short-lived GSA token**.

3. **IAM** `roles/iam.workloadIdentityUser` binds KSA → GSA.

4. **Pod receives GSA-scoped credentials** — ADC inside the process uses them automatically. **No `keyFilename`.** Leave `GOOGLE_APPLICATION_CREDENTIALS` unset on GKE.

## Checklist

- [ ] Storage client uses ADC (no `keyFilename` in production)
- [ ] Client is a lazy singleton on `globalThis` (avoid hot-reload leaks)
- [ ] Objects stored under `GCS_FOLDER` inside `GCS_BUCKET`
- [ ] KSA annotated with GSA; Deployment uses that KSA
- [ ] `roles/iam.workloadIdentityUser` binding exists
- [ ] GSA has Storage IAM on the target bucket
- [ ] `.env.example` documents `GCS_PROJECT_ID`, `GCS_BUCKET`, `GCS_FOLDER`

## Local development

- Prefer `gcloud auth application-default login`, or set `GOOGLE_APPLICATION_CREDENTIALS` to a non-committed path.
- Never commit key files. Document local vs GKE ADC differences in the app README.

## Forbidden

- Committing `*-key.json` / service account keys
- Mounting long-lived SA keys as Kubernetes Secrets for GCS on GKE
- Passing `keyFilename` / credentials JSON into `Storage` in production
- Creating a new `Storage` client on every request (use the singleton)
