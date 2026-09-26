import { randomBytes } from "node:crypto";
import * as Alchemy from "alchemy";
import * as Docker from "alchemy/Docker";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { defaultSlug } from "./lease-store";
import { dockerHostName, dockerPgName, writeTenantBootConfig } from "./tenant-config";

/**
 * The sandbox lease as an alchemy Stack (plan 032; stages are leases):
 *
 *   alchemy deploy --stage sandbox-<slug>   → acquire (spawn pg + host)
 *   alchemy destroy --stage sandbox-<slug>  → release
 *
 * One stage = one tenant = one state file + one set of physical container
 * names; prop changes are replacements (delete-first), so republish is a
 * plain re-deploy (the throwaway pg rotates with it). The gen only PLANS —
 * containers materialize during apply — so post-apply facts (bound ports,
 * the gateway lease handoff) belong to the CLI (`bos sandbox start`), not
 * here. Machine provider: the Docker provider through the local docker CLI
 * context; production swaps the resources for a cloud container runtime
 * (Fly Machines / ECS) consuming the pushed platform image — never
 * Cloudflare Workers (Node image constraint).
 *
 * Tenant parameters ride the environment (set by `bos sandbox start`):
 * BOS_SANDBOX_ACCOUNT / BOS_SANDBOX_GATEWAY (required),
 * BOS_SANDBOX_IMAGE (default citynode-platform:spike),
 * BOS_SANDBOX_CONFIG_DIR (generates + mounts the tenant boot config),
 * BOS_SANDBOX_SHARED_NETWORK (joins the host container so a dockerized
 * shared host can proxy to it by container DNS name).
 */
export default Alchemy.Stack(
  "bos-sandbox",
  {
    providers: Docker.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const account = process.env.BOS_SANDBOX_ACCOUNT;
    const gateway = process.env.BOS_SANDBOX_GATEWAY;
    if (!account || !gateway) {
      return yield* Effect.die("BOS_SANDBOX_ACCOUNT and BOS_SANDBOX_GATEWAY are required");
    }
    const slug = defaultSlug(account);
    const image = process.env.BOS_SANDBOX_IMAGE ?? "citynode-platform:spike";
    const configDir = process.env.BOS_SANDBOX_CONFIG_DIR;
    const sharedNetwork = process.env.BOS_SANDBOX_SHARED_NETWORK;

    const pgPassword = randomBytes(16).toString("hex");
    const authSecret = randomBytes(32).toString("base64");

    const network = yield* Docker.Network("lease");

    const pgImage = yield* Docker.RemoteImage("pg-image", {
      name: "postgres",
      tag: "17-alpine",
      alwaysPull: false,
    });
    yield* Docker.Container("pg-container", {
      name: dockerPgName(slug),
      image: pgImage,
      environment: {
        POSTGRES_USER: "sandbox",
        POSTGRES_PASSWORD: pgPassword,
        POSTGRES_DB: "sandbox",
      },
      networks: [{ name: network.name, aliases: ["sandbox-pg"] }],
      healthcheck: {
        cmd: "pg_isready -U sandbox -d sandbox",
        interval: "5 seconds",
        timeout: "5 seconds",
        retries: 10,
      },
      start: true,
    });

    const pgUrl = `postgres://sandbox:${pgPassword}@sandbox-pg:5432/sandbox`;
    const bootConfigPath = configDir
      ? writeTenantBootConfig({ account, gateway }, configDir)
      : null;
    yield* Docker.Container("host", {
      name: dockerHostName(slug),
      image,
      environment: {
        BOS_ACCOUNT: account,
        BOS_GATEWAY: gateway,
        BETTER_AUTH_SECRET: authSecret,
        DATABASE_URL: pgUrl,
        API_DATABASE_URL: pgUrl,
        AUTH_DATABASE_URL: pgUrl,
      },
      volumes: bootConfigPath
        ? [
            {
              hostPath: bootConfigPath,
              containerPath: "/app/.bos/regression/image/config-ssr.json",
            },
          ]
        : [],
      networks: [{ name: network.name }, ...(sharedNetwork ? [{ name: sharedNetwork }] : [])],
      ports: [{ external: 0, internal: 4100 }],
      healthcheck: {
        cmd: "curl -f http://localhost:4100/health || exit 1",
        interval: "10 seconds",
        timeout: "5 seconds",
        retries: 30,
      },
      start: true,
    });

    return {
      slug,
      stage: `sandbox-${slug}`,
      hostContainer: dockerHostName(slug),
      pgContainer: dockerPgName(slug),
    };
  }),
);
