import type { Context } from "hono";
import type { AuthVariables } from "../lib/auth";
import { createBindingResolver } from "../services/binding-resolver";
import type { RuntimeConfig } from "../services/config";
import { logger } from "../utils/logger";
import { proxyRequest } from "./static-proxy";

type HonoEnv = { Variables: AuthVariables };

/**
 * Sandbox tenant proxy (plan 032, `BOS_SANDBOX=1` only): when the request
 * hostname resolves to a sandbox binding, the WHOLE request (SSR pages,
 * static assets, `/api/*`, `/bundles/*`) proxies wholesale to the tenant's
 * sandbox host. Base-host requests and shared-host tenant bindings fall
 * through untouched. Registered before every other handler in program.ts.
 */
export function createSandboxProxyHandler(config: RuntimeConfig) {
  const bindingResolver = createBindingResolver(config);

  return async (c: Context<HonoEnv>, next: () => Promise<void>) => {
    const hostname = new URL(c.req.url).hostname.toLowerCase();
    try {
      const binding = await bindingResolver.resolve(hostname);
      if (binding?.hostMode === "sandbox" && binding.sandboxUrl) {
        return proxyRequest(c.req.raw, binding.sandboxUrl);
      }
    } catch (error) {
      logger.error(
        `[SandboxProxy] ${hostname} resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await next();
  };
}
