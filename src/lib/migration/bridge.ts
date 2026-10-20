import "server-only";
import { migrationServerConfig } from "./config";
import { AuthTokenError } from "./auth-errors";

const MIN_TOKEN_TTL_SECONDS = 300;
const REFRESH_INTERVAL_MS = 45_000;

type TokenClaims = {
  sub: string;
  sessionId: string;
  exp: number;
};

function decodeTokenClaims(token: string): TokenClaims {
  const encoded = token.split(".")[1];
  if (!encoded) throw new Error("Authentication token is malformed.");
  const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<TokenClaims>;
  if (!claims.sub || !claims.sessionId || typeof claims.exp !== "number") {
    throw new Error("Authentication token lacks required claims.");
  }
  return { sub: claims.sub, sessionId: claims.sessionId, exp: claims.exp };
}

function assertTokenLifetime(claims: TokenClaims): void {
  const remaining = claims.exp - Math.floor(Date.now() / 1_000);
  if (remaining <= MIN_TOKEN_TTL_SECONDS) {
    throw new AuthTokenError(503, "short-lifetime");
  }
}

async function requestFreshToken(cookie: string, origin: string): Promise<{ token: string; claims: TokenClaims }> {
  const { convexSiteUrl } = migrationServerConfig();
  const originUrl = new URL(origin);
  let response: Response;
  try { response = await fetch(`${convexSiteUrl}/api/auth/convex/token`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
    headers: {
      accept: "application/json",
      cookie,
      "x-forwarded-host": originUrl.host,
      "x-forwarded-proto": originUrl.protocol.replace(":", ""),
      "x-better-auth-forwarded-host": originUrl.host,
      "x-better-auth-forwarded-proto": originUrl.protocol.replace(":", ""),
    },
  }); } catch { throw new AuthTokenError(503); }
  if (!response.ok) throw new AuthTokenError(response.status, undefined, response.headers.get("Retry-After"));
  let body: { token?: unknown }, claims: TokenClaims;
  try {
    body = await response.json() as { token?: unknown };
    if (typeof body.token !== "string") throw new Error("Invalid token type");
    claims = decodeTokenClaims(body.token);
  } catch { throw new AuthTokenError(503, "invalid-response"); }
  assertTokenLifetime(claims);
  return { token: body.token as string, claims };
}

export class MigrationTokenManager {
  private token = "";
  private principal: Pick<TokenClaims, "sub" | "sessionId"> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly cookie: string,
    private readonly origin: string,
    readonly abortController: AbortController,
  ) {}

  async initialize(): Promise<void> {
    if (!this.cookie) throw new Error("Unauthenticated.");
    await this.refresh();
    this.timer = setInterval(() => {
      void this.refresh().catch((error) => this.abortController.abort(error));
    }, REFRESH_INTERVAL_MS);
  }

  async refresh(): Promise<void> {
    const fresh = await requestFreshToken(this.cookie, this.origin);
    if (
      this.principal &&
      (fresh.claims.sub !== this.principal.sub ||
        fresh.claims.sessionId !== this.principal.sessionId)
    ) {
      throw new Error("Authenticated principal changed during the run.");
    }
    this.principal = { sub: fresh.claims.sub, sessionId: fresh.claims.sessionId };
    this.token = fresh.token;
  }

  getToken(): string {
    if (!this.token) throw new Error("Authentication token is unavailable.");
    return this.token;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export async function callMigrationBridge<T>(
  manager: MigrationTokenManager,
  body: unknown,
  options: { ignoreAbort?: boolean } = {},
): Promise<T> {
  const { convexSiteUrl, serverSecret } = migrationServerConfig();
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, "utf8") > 128_000) {
    throw new Error("Bridge request is too large.");
  }
  const response = await fetch(`${convexSiteUrl}/migration/bridge`, {
    method: "POST",
    cache: "no-store",
    signal: options.ignoreAbort
      ? AbortSignal.timeout(10_000)
      : AbortSignal.any([manager.abortController.signal, AbortSignal.timeout(10_000)]),
    headers: {
      authorization: `Bearer ${manager.getToken()}`,
      "content-type": "application/json",
      "x-portia-server-secret": serverSecret,
    },
    body: serialized,
  });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "Unauthenticated." : "Migration request was rejected.");
  }
  return await response.json() as T;
}
