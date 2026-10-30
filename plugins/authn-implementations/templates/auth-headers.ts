/**
 * DEV-only helpers to simulate Apps Gateway identity locally.
 *
 * Production: front-end must NEVER send X-User-Id — the gateway injects it.
 * Local: attach X-User-Id from localStorage key `dev_user` when DEV is true.
 *
 * Prefer mounting mock login at `/dev-login`, not `/auth/ui/login`.
 */

export const DEV_USER_KEY = "dev_user";

export function isDevClient(): boolean {
  if (typeof window === "undefined") return false;
  const metaEnv =
    typeof import.meta !== "undefined"
      ? (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env
      : undefined;
  return Boolean(
    metaEnv?.DEV ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"
  );
}

/** Attach simulated identity ONLY in dev. In prod this returns {}. */
export function authHeaders(): Record<string, string> {
  if (!isDevClient()) return {};
  const email = window.localStorage.getItem(DEV_USER_KEY);
  return email ? { "X-User-Id": email } : {};
}

export function setDevUser(email: string): void {
  if (!isDevClient()) return;
  window.localStorage.setItem(DEV_USER_KEY, email);
}

export function clearDevUser(): void {
  if (!isDevClient()) return;
  window.localStorage.removeItem(DEV_USER_KEY);
}

/** Full-page login navigation (production / behind gateway). */
export function goToGatewayLogin(redirectPath?: string): void {
  const path = redirectPath ?? `${window.location.pathname}${window.location.search}`;
  window.location.assign(
    `/auth/ui/login?redirect=${encodeURIComponent(path.startsWith("/") ? path : `/${path}`)}`
  );
}

/** Full-page logout (clears gateway session; CAS SLO when configured). */
export function goToGatewayLogout(): void {
  window.location.assign("/auth/logout");
}
