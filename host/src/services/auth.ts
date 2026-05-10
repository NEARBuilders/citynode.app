import type { Context, Next } from "hono";
import type { HostPluginEntry, PluginResult } from "./plugins";

interface AuthServices {
  handler: (req: Request) => Promise<Response>;
  auth: {
    api: {
      getSession: (args: { headers: Headers }) => Promise<{ user?: any; session?: any } | null>;
    };
  };
}

interface AuthUser {
  id: string;
  [key: string]: unknown;
}

interface AuthSession {
  activeOrganizationId?: string | null;
  [key: string]: unknown;
}

export interface AuthVariables {
  user: AuthUser | null;
  session: AuthSession | null;
  reqHeaders: Record<string, string>;
  getRawBody: () => Promise<string>;
  walletAddress: string | null;
}

export type HonoEnv = { Variables: AuthVariables };

function resolveAuthEntry(plugins: PluginResult): HostPluginEntry | null {
  return plugins.auth ?? plugins.plugins.auth ?? null;
}

function getAuthServices(plugins: PluginResult): AuthServices | null {
  const entry = resolveAuthEntry(plugins);
  if (!entry?.initialized?.context) return null;
  return entry.initialized.context as AuthServices;
}

export function registerAuthHandler(app: { on: (...args: any[]) => any }, plugins: PluginResult) {
  const services = getAuthServices(plugins);
  if (!services) return;
  app.on(["POST", "GET"], "/api/auth/*", (c: Context<HonoEnv>) => services.handler(c.req.raw));
}

export function createSessionMiddleware(plugins: PluginResult) {
  const services = getAuthServices(plugins);
  const authApi = services?.auth?.api ?? null;

  return async (c: Context<HonoEnv>, next: Next) => {
    if (c.req.path.startsWith("/api/auth/")) {
      return next();
    }

    const reqHeaders = Object.fromEntries(c.req.raw.headers);
    c.set("reqHeaders", reqHeaders);

    const rawClone = c.req.method === "GET" || c.req.method === "HEAD" ? null : c.req.raw.clone();
    let cachedRawBody: string | null = null;
    c.set("getRawBody", async () => {
      if (cachedRawBody !== null) return cachedRawBody;
      if (!rawClone) {
        cachedRawBody = "";
        return cachedRawBody;
      }
      cachedRawBody = await rawClone.text();
      return cachedRawBody;
    });

    if (!authApi) {
      c.set("user", null);
      c.set("session", null);
      c.set("walletAddress", null);
      await next();
      return;
    }

    try {
      const headers = new Headers(Object.entries(reqHeaders) as [string, string][]);
      const sessionResult = await authApi.getSession({ headers });
      c.set("user", sessionResult?.user ?? null);
      c.set("session", sessionResult?.session ?? null);
      c.set("walletAddress", sessionResult?.user?.walletAddress ?? null);
    } catch (error) {
      console.warn(
        `[Auth] Session resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      c.set("user", null);
      c.set("session", null);
      c.set("walletAddress", null);
    }

    await next();
  };
}

export function buildPluginContext(c: Context<HonoEnv>) {
  const user = c.get("user");
  const session = c.get("session");
  const walletAddress = c.get("walletAddress");

  return {
    userId: user?.id,
    user: user ?? undefined,
    walletAddress: walletAddress ?? undefined,
    organizationId: session?.activeOrganizationId ?? undefined,
    reqHeaders: c.get("reqHeaders"),
    getRawBody: c.get("getRawBody"),
  };
}
