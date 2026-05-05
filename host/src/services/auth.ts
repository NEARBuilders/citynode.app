import type { Context, Next } from "hono";
import type { LoadedPlugin, PluginResult } from "./plugins";

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
}

export type HonoEnv = { Variables: AuthVariables };

function resolveAuthPlugin(plugins: PluginResult): LoadedPlugin | null {
  return plugins.auth ?? plugins.plugins.auth ?? null;
}

function getAuthInternals(plugins: PluginResult) {
  const authPlugin = resolveAuthPlugin(plugins);
  if (!authPlugin) return null;
  return (authPlugin as any).initialized?.context ?? null;
}

export function registerAuthHandler(app: { on: (...args: any[]) => any }, plugins: PluginResult) {
  const internals = getAuthInternals(plugins);
  if (typeof internals?.handler === "function") {
    app.on(["POST", "GET"], "/api/auth/*", (c: Context<HonoEnv>) => internals.handler(c.req.raw));
  }
}

export function createSessionMiddleware(plugins: PluginResult) {
  const authApi = getAuthInternals(plugins)?.auth?.api ?? null;

  return async (c: Context<HonoEnv>, next: Next) => {
    if (c.req.path.startsWith("/api/auth/")) {
      return next();
    }

    const reqHeaders = Object.fromEntries(c.req.raw.headers);
    c.set("reqHeaders", reqHeaders);

    if (!authApi) {
      c.set("user", null);
      c.set("session", null);
      await next();
      return;
    }

    try {
      const headers = new Headers(Object.entries(reqHeaders) as [string, string][]);
      const sessionResult = await authApi.getSession({ headers });
      c.set("user", sessionResult?.user ?? null);
      c.set("session", sessionResult?.session ?? null);
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
    userId: user?.id,
    user: user ?? undefined,
    organizationId: session?.activeOrganizationId ?? undefined,
    reqHeaders: c.get("reqHeaders"),
  };
}
