/**
 * GCS Storage client — Application Default Credentials + singleton.
 *
 * Authenticates via Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS
 * or workload identity). The Storage client is a lazily-created singleton, cached
 * on globalThis to avoid leaking clients across hot reloads (mirrors db.ts).
 *
 * On GKE with WIF: leave GOOGLE_APPLICATION_CREDENTIALS unset; ADC uses the
 * metadata server after KSA↔GSA binding (see data/wif-gke.json).
 * Locally: gcloud auth application-default login, or set GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Env: GCS_PROJECT_ID, GCS_BUCKET, GCS_FOLDER
 */
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

/** Default bucket for app object storage. */
export function getBucket() {
  const name = process.env.GCS_BUCKET;
  if (!name) {
    throw new Error("GCS_BUCKET is required");
  }
  return getStorage().bucket(name);
}

/**
 * Default folder (prefix) inside the bucket where the app stores files.
 * Object key = `${GCS_FOLDER}/${relativePath}`
 */
export function getFolderPrefix(): string {
  const folder = process.env.GCS_FOLDER;
  if (!folder) {
    throw new Error("GCS_FOLDER is required");
  }
  return folder.replace(/^\/+|\/+$/g, "");
}

export function objectKey(relativePath: string): string {
  const folder = getFolderPrefix();
  const clean = relativePath.replace(/^\/+/, "");
  return `${folder}/${clean}`;
}
