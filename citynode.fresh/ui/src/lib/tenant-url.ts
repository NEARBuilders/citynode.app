/**
 * Tenant origin construction.
 *
 * Tenant bindings are stored as `<label>` or `<label>.<gatewayId>`, and the
 * host resolves a tenant from the request hostname. In production that means
 * `https://<label>.<gatewayId>`. Locally the gateway id is still the production
 * domain (`bos.config.json` -> `domain`), so linking straight at it would send
 * you to prod. Against a `localhost` origin we therefore point at
 * `http://<label>.localhost:<port>`, which the host's binding resolver maps
 * back to `<label>.<gatewayId>` in development.
 */

const LOCALHOST_SUFFIX = ".localhost";

export function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]" ||
    normalized.endsWith(LOCALHOST_SUFFIX)
  );
}

/** Strips a `<label>.<gatewayId>` hostname (or a bare label) down to its label. */
export function tenantLabel(hostnameOrLabel: string, gatewayId?: string): string {
  const normalized = hostnameOrLabel.trim().toLowerCase().replace(/\/+$/, "");
  if (!normalized) return "";
  const gateway = gatewayId?.trim().toLowerCase();
  if (gateway && normalized.endsWith(`.${gateway}`)) {
    return normalized.slice(0, -(gateway.length + 1));
  }
  if (normalized.endsWith(LOCALHOST_SUFFIX)) {
    return normalized.slice(0, -LOCALHOST_SUFFIX.length);
  }
  return normalized.split(".")[0] ?? "";
}

export interface BuildTenantUrlOptions {
  /** Current browser origin hostname. Defaults to `window.location.hostname`. */
  currentHostname?: string;
  /** Current browser origin port. Defaults to `window.location.port`. */
  currentPort?: string;
  /** Appended to the origin, e.g. `/stake`. */
  path?: string;
}

/**
 * Builds the absolute origin for a tenant, dev-aware.
 *
 * `buildTenantUrl("chicago", "citynode.app")`
 *   -> `https://chicago.citynode.app` in production
 *   -> `http://chicago.localhost:3000` when served from localhost
 */
export function buildTenantUrl(
  hostnameOrLabel: string,
  gatewayId: string,
  options: BuildTenantUrlOptions = {},
): string | null {
  const label = tenantLabel(hostnameOrLabel, gatewayId);
  if (!label) return null;

  const path = options.path ?? "";
  const currentHostname =
    options.currentHostname ??
    (typeof window === "undefined" ? undefined : window.location.hostname);

  if (currentHostname && isLocalHostname(currentHostname)) {
    const currentPort =
      options.currentPort ?? (typeof window === "undefined" ? "" : window.location.port);
    const port = currentPort ? `:${currentPort}` : "";
    return `http://${label}${LOCALHOST_SUFFIX}${port}${path}`;
  }

  const gateway = gatewayId.trim().toLowerCase();
  if (!gateway) return null;
  return `https://${label}.${gateway}${path}`;
}
