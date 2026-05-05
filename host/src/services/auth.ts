import type { Context, Next } from "hono";
import type { LoadedPlugin, PluginResult } from "./plugins";

export interface AuthVariables {
  user: {
    id: string;
    role?: string | null;
    email?: string | null;
    name?: string | null;
  } | null;
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    createdAt: Date;
    updatedAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    activeOrganizationId?: string | null;
  } | null;
  reqHeaders: Record<string, string>;
}

export type HonoEnv = { Variables: AuthVariables };

function resolveAuthPlugin(plugins: PluginResult): LoadedPlugin | null {
  return plugins.auth ?? plugins.plugins.auth ?? null;
}

function getAuthHandler(plugins: PluginResult): ((req: Request) => Promise<Response>) | null {
  const authPlugin = resolveAuthPlugin(plugins);
  if (!authPlugin) return null;
  const initialized = (authPlugin as any).initialized;
  return typeof initialized?.context?.handler === "function" ? initialized.context.handler : null;
}

function getAuthInstance(
  plugins: PluginResult,
): { api: { getSession: (opts: { headers: Headers }) => Promise<any> } } | null {
  const authPlugin = resolveAuthPlugin(plugins);
  if (!authPlugin) return null;
  const initialized = (authPlugin as any).initialized;
  return initialized?.context?.auth ?? null;
}

export function registerAuthHandler(app: { on: (...args: any[]) => any }, plugins: PluginResult) {
  const handler = getAuthHandler(plugins);
  if (handler) {
    app.on(["POST", "GET"], "/api/auth/*", (c: Context<HonoEnv>) => handler(c.req.raw));
  }
}

export function createSessionMiddleware(plugins: PluginResult) {
  const authInstance = getAuthInstance(plugins);

  return async (c: Context<HonoEnv>, next: Next) => {
    if (c.req.path.startsWith("/api/auth/")) {
      return next();
    }

    const reqHeaders: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      reqHeaders[key] = value;
    });
    c.set("reqHeaders", reqHeaders);

    if (!authInstance) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }

    try {
      const headers = new Headers(Object.entries(reqHeaders) as [string, string][]);
      const sessionResult = await authInstance.api.getSession({ headers });

      const user = sessionResult?.user
        ? {
            id: sessionResult.user.id,
            role: sessionResult.user.role ?? null,
            email: sessionResult.user.email ?? null,
            name: sessionResult.user.name ?? null,
          }
        : null;

      const session = sessionResult?.session
        ? {
            id: sessionResult.session.id,
            userId: sessionResult.session.userId,
            expiresAt: sessionResult.session.expiresAt,
            token: sessionResult.session.token,
            createdAt: sessionResult.session.createdAt,
            updatedAt: sessionResult.session.updatedAt,
            ipAddress: null,
            userAgent: null,
            activeOrganizationId: sessionResult.session.activeOrganizationId ?? null,
          }
        : null;

      c.set("user", user);
      c.set("session", session);
    } catch (error) {
      console.warn(
        `[Auth] Session resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      c.set("user", null);
      c.set("session", null);
    }

    await next();
  };
}

export function buildPluginContext(c: Context<HonoEnv>) {
  const user = c.get("user");
  const session = c.get("session");

  return {
    userId: user?.id ?? undefined,
    user: user
      ? {
          id: user.id,
          role: user.role ?? undefined,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
        }
      : undefined,
    organizationId: session?.activeOrganizationId ?? undefined,
    reqHeaders: c.get("reqHeaders"),
  };
}
