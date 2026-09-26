import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareLocalProductionConfig } from "../local-prod-config";
import type { BosConfig } from "../types";
import { sanitizeDockerName } from "./lease-store";

const sanitizeRemoteName = (pkgName: string): string => pkgName.replace(/[^A-Za-z0-9_]/g, "_");

/**
 * Tenant boot config for the sandbox host container. Mirrors the deploy
 * image's regression staging (scripts/regression/container-build.ts): the
 * fixed container-local port plan, bundle URLs addressed same-origin under
 * /bundles/<base-account>/<base-gateway>/ (ADR 0011 — the image serves its
 * staged namespace), with the TENANT account as the runtime identity.
 */
export function buildTenantBootConfig(
  tenant: { account: string; gateway: string },
  configDir: string,
): BosConfig {
  const configPath = join(configDir, "bos.config.json");
  if (!existsSync(configPath)) {
    throw new Error(`bos.config.json not found at ${configPath}`);
  }
  const base = JSON.parse(readFileSync(configPath, "utf8")) as BosConfig;
  const baseGateway = base.domain ?? "localhost";

  const ports = { hostDist: 4105, api: 4101, auth: 4102, ui: 4103, authUi: 4104 };
  const nsBase = `/bundles/${base.account}/${baseGateway}`;

  const authDevelopment = base.app?.auth?.development;
  let authUiName: string | undefined;
  if (typeof authDevelopment === "string" && authDevelopment.startsWith("local:")) {
    try {
      authUiName = sanitizeRemoteName(
        (
          JSON.parse(
            readFileSync(
              join(configDir, authDevelopment.slice("local:".length), "package.json"),
              "utf8",
            ),
          ) as { name: string }
        ).name,
      );
    } catch {
      authUiName = undefined;
    }
  }

  const localPlugins = Object.entries(base.plugins ?? {})
    .filter(
      ([, ref]) =>
        typeof ref === "object" &&
        typeof ref.development === "string" &&
        ref.development.startsWith("local:"),
    )
    .map(([key]) => key)
    .sort((a, b) => a.localeCompare(b));

  const plan = {
    host: `http://localhost:${ports.hostDist}`,
    ui: {
      production: `http://localhost:${ports.ui}`,
      ssr: `http://localhost:${ports.ui}/ssr`,
      publicUrl: `${nsBase}/ui`,
    },
    api: `http://localhost:${ports.api}`,
    auth: `http://localhost:${ports.auth}`,
    authUi: {
      production: `http://localhost:${ports.authUi}`,
      ssr: `http://localhost:${ports.authUi}/ssr`,
      ...(authUiName ? { name: authUiName } : {}),
      publicUrl: `${nsBase}/auth-ui`,
    },
    plugins: Object.fromEntries(
      localPlugins.map((key) => [
        key,
        {
          production: `http://localhost:${key === "auth" ? ports.auth : 4110 + localPlugins.indexOf(key)}`,
          uiPublicUrl: `${nsBase}/${key}`,
        },
      ]),
    ),
  };

  return prepareLocalProductionConfig({ ...base, account: tenant.account }, plan);
}

/** Materializes the tenant boot config next to a per-tenant temp dir; the path is volume-mounted into the container. */
export function writeTenantBootConfig(
  tenant: { account: string; gateway: string },
  configDir: string,
): string {
  const dir = mkdtempSync(join(tmpdir(), "bos-sandbox-"));
  const path = join(dir, "config-ssr.json");
  writeFileSync(path, `${JSON.stringify(buildTenantBootConfig(tenant, configDir), null, 2)}\n`);
  return path;
}

export const dockerPgName = (slug: string): string => `bos-sandbox-pg-${sanitizeDockerName(slug)}`;
export const dockerHostName = (slug: string): string =>
  `bos-sandbox-host-${sanitizeDockerName(slug)}`;
