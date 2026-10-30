/**
 * Express-style helper: read Apps Gateway identity from X-User-Id.
 * On login-required paths the gateway guarantees the header; still defend in depth.
 */
export type GatewayUser = {
  email: string;
  requestId?: string;
};

export function getGatewayUser(req: {
  headers: Record<string, string | string[] | undefined>;
}): GatewayUser | null {
  const raw = req.headers["x-user-id"];
  const email = Array.isArray(raw) ? raw[0] : raw;
  if (!email || typeof email !== "string") return null;

  const rid = req.headers["x-request-id"];
  const requestId = Array.isArray(rid) ? rid[0] : rid;

  return { email, requestId: typeof requestId === "string" ? requestId : undefined };
}

/** Defense in depth for login-required handlers. */
export function requireGatewayUser(req: {
  headers: Record<string, string | string[] | undefined>;
}): GatewayUser {
  const user = getGatewayUser(req);
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { statusCode?: number }).statusCode = 401;
    throw err;
  }
  return user;
}

export function isSkipLoginPath(pathname: string): boolean {
  return (
    pathname === "/dangerously-skip-login" ||
    pathname.startsWith("/dangerously-skip-login/")
  );
}
