import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context, Effect, Layer, Schedule } from "effect";
import { prepareLocalProductionConfig } from "../local-prod-config";
import type { BosConfig } from "../types";
import { dockerProvider } from "./docker-provider";
import {
  defaultSlug,
  leaseKey,
  readLeases,
  removeLease,
  sanitizeContainerPart,
  upsertLease,
  writeLeases,
} from "./lease-store";
import type { SandboxLease, SandboxMachineProviderShape, SandboxTenant } from "./types";
import { SandboxError } from "./types";

export interface SandboxOrchestratorOptions {
  readonly leasesPath: string;
  readonly image: string;
  readonly configDir?: string;
  readonly healthPollIntervalMs?: number;
  readonly healthTimeoutMs?: number;
  readonly sharedNetwork?: string;
}

export interface SandboxOrchestratorShape {
  readonly acquireLease: (tenant: SandboxTenant) => Effect.Effect<SandboxLease, SandboxError>;
  readonly releaseLease: (tenant: SandboxTenant) => Effect.Effect<void, SandboxError>;
  readonly listLeases: () => Effect.Effect<readonly SandboxLease[], SandboxError>;
  readonly sweepIdle: (ttlMs: number) => Effect.Effect<readonly string[], SandboxError>;
}

export class SandboxOrchestrator extends Context.Service<
  SandboxOrchestrator,
  SandboxOrchestratorShape
>()("SandboxOrchestrator") {}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 120_000;

const pgContainerName = (tenant: SandboxTenant): string =>
  `sandbox-pg-${sanitizeContainerPart(tenant.account)}-${sanitizeContainerPart(tenant.gateway)}`;

const hostContainerName = (tenant: SandboxTenant): string =>
  `sandbox-host-${sanitizeContainerPart(tenant.account)}-${sanitizeContainerPart(tenant.gateway)}`;

const networkName = (tenant: SandboxTenant): string =>
  `sandbox-${sanitizeContainerPart(tenant.account)}-${sanitizeContainerPart(tenant.gateway)}`;

const sanitizeRemoteName = (pkgName: string): string => pkgName.replace(/[^A-Za-z0-9_]/g, "_");

/**
 * Tenant boot config for the sandbox host container. Mirrors the deploy
 * image's regression staging (scripts/regression/container-build.ts): the
 * fixed container-local port plan, bundle URLs addressed same-origin under
 * /bundles/<base-account>/<base-gateway>/ (ADR 0011 — the image serves its
 * staged namespace), with the TENANT account as the runtime identity.
 */
function buildTenantBootConfig(tenant: SandboxTenant, configDir: string): BosConfig {
  const configPath = join(configDir, "bos.config.json");
  if (!existsSync(configPath)) {
    throw new Error(`bos.config.json not found at ${configPath}`);
  }
  const base = JSON.parse(readFileSync(configPath, "utf8")) as BosConfig;
  const baseGateway = base.domain ?? "localhost";

  const ports = { hostDist: 4105, api: 4101, auth: 4102, ui: 4103, authUi: 4104 };
  const nsBase = `/bundles/${base.account}/${baseGateway}`;

  const authDevelopment = base.app?.auth?.development;
  const authUiName =
    typeof authDevelopment === "string" && authDevelopment.startsWith("local:")
      ? sanitizeRemoteName(
          (
            JSON.parse(
              readFileSync(
                join(configDir, authDevelopment.slice("local:".length), "package.json"),
                "utf8",
              ),
            ) as { name: string }
          ).name,
        )
      : undefined;

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

export const makeSandboxOrchestrator = (
  provider: SandboxMachineProviderShape,
  options: SandboxOrchestratorOptions,
): SandboxOrchestratorShape => {
  const pollInterval = options.healthPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const healthTimeout = options.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;

  const pollSchedule = Schedule.spaced(`${pollInterval} millis`).pipe(
    Schedule.upTo({ duration: `${healthTimeout} millis` }),
  );

  const waitForHealth = (url: string): Effect.Effect<void, SandboxError> =>
    Effect.gen(function* () {
      const ok = yield* provider.healthCheck(url);
      if (!ok) {
        return yield* Effect.fail(
          new SandboxError({ reason: `${url}/health not ready`, phase: "health" }),
        );
      }
    }).pipe(
      Effect.retry({ schedule: pollSchedule }),
      Effect.catch(() =>
        Effect.fail(
          new SandboxError({
            reason: `sandbox host never became healthy at ${url}/health within ${healthTimeout}ms`,
            phase: "health",
          }),
        ),
      ),
    );

  const stopTenant = (tenant: SandboxTenant): Effect.Effect<void, never> =>
    Effect.gen(function* () {
      yield* provider.stop(hostContainerName(tenant));
      yield* provider.stop(pgContainerName(tenant));
    });

  const acquire = (tenant: SandboxTenant): Effect.Effect<SandboxLease, SandboxError> =>
    Effect.gen(function* () {
      if (!tenant.account || !tenant.gateway) {
        return yield* Effect.fail(
          new SandboxError({ reason: "account and gateway are required", phase: "spawn" }),
        );
      }

      const existing = readLeases(options.leasesPath);
      if (existing.some((l) => leaseKey(l) === leaseKey(tenant))) {
        yield* stopTenant(tenant);
      }

      const pgPort = yield* provider.findFreePort();
      const hostPort = yield* provider.findFreePort();
      const network = networkName(tenant);
      yield* provider.ensureNetwork(network);

      const pg = yield* provider.spawn({
        name: pgContainerName(tenant),
        kind: "postgres",
        port: pgPort,
        env: {},
        binds: {},
        network,
      });

      let bootConfigPath: string | null = null;
      if (options.configDir) {
        try {
          const tenantConfig = buildTenantBootConfig(tenant, options.configDir);
          const dir = mkdtempSync(join(tmpdir(), "bos-sandbox-"));
          bootConfigPath = join(dir, "config-ssr.json");
          writeFileSync(bootConfigPath, `${JSON.stringify(tenantConfig, null, 2)}\n`);
        } catch (cause) {
          return yield* Effect.fail(
            new SandboxError({
              reason: "tenant boot config generation failed",
              phase: "config",
              cause,
            }),
          );
        }
      }

      const secret = randomBytes(32).toString("base64");
      const pgUrl = `postgres://sandbox:sandbox@${pgContainerName(tenant)}:5432/sandbox`;
      const host = yield* provider.spawn({
        name: hostContainerName(tenant),
        kind: "host",
        port: hostPort,
        env: {
          BOS_ACCOUNT: tenant.account,
          BOS_GATEWAY: tenant.gateway,
          BETTER_AUTH_SECRET: secret,
          DATABASE_URL: pgUrl,
          API_DATABASE_URL: pgUrl,
          AUTH_DATABASE_URL: pgUrl,
          BASE_URL: `http://localhost:${hostPort}`,
        },
        binds: bootConfigPath
          ? { [bootConfigPath]: "/app/.bos/regression/image/config-ssr.json" }
          : {},
        network,
        image: options.image,
      });

      const url = `http://localhost:${hostPort}`;
      yield* waitForHealth(url);

      let proxyUrl = url;
      if (options.sharedNetwork) {
        yield* provider.connectNetwork(options.sharedNetwork, hostContainerName(tenant));
        proxyUrl = `http://${hostContainerName(tenant)}:4100`;
      }

      const now = new Date().toISOString();
      const lease: SandboxLease = {
        account: tenant.account,
        gateway: tenant.gateway,
        slug: defaultSlug(tenant.account),
        url: proxyUrl,
        proxyUrlAlias: url,
        hostPort,
        pgPort,
        image: options.image,
        imageDigest: host.imageDigest,
        containers: [pg.containerId, host.containerId],
        network,
        createdAt: now,
        lastUsedAt: now,
      };

      yield* writeLeases(options.leasesPath, upsertLease(readLeases(options.leasesPath), lease));
      return lease;
    });

  return {
    acquireLease: (tenant) => acquire(tenant).pipe(Effect.onError(() => stopTenant(tenant))),

    releaseLease: (tenant) =>
      Effect.gen(function* () {
        yield* stopTenant(tenant);
        yield* writeLeases(options.leasesPath, removeLease(readLeases(options.leasesPath), tenant));
      }),

    listLeases: () =>
      Effect.try({
        try: () => readLeases(options.leasesPath),
        catch: (cause) =>
          new SandboxError({ reason: `read ${options.leasesPath}`, phase: "lease-store", cause }),
      }),

    sweepIdle: (ttlMs) =>
      Effect.gen(function* () {
        const now = Date.now();
        const expired = readLeases(options.leasesPath).filter((lease) => {
          const stamp = Math.max(
            Date.parse(lease.lastUsedAt) || 0,
            Date.parse(lease.createdAt) || 0,
          );
          return now - stamp > ttlMs;
        });
        for (const lease of expired) {
          yield* stopTenant(lease);
        }
        if (expired.length > 0) {
          const expiredKeys = new Set(expired.map(leaseKey));
          yield* writeLeases(
            options.leasesPath,
            readLeases(options.leasesPath).filter((lease) => !expiredKeys.has(leaseKey(lease))),
          );
        }
        return expired.map((l) => leaseKey(l));
      }),
  };
};

export const sandboxOrchestratorLayer = (
  options: SandboxOrchestratorOptions,
): Layer.Layer<SandboxOrchestrator> =>
  Layer.succeed(SandboxOrchestrator, makeSandboxOrchestrator(dockerProvider(), options));
