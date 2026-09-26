import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSlug } from "../../src/sandbox/lease-store";
import { dockerHostName, dockerPgName } from "../../src/sandbox/tenant-config";

/**
 * Gated live-docker test (plan 032 spike): applies the REAL sandbox stack
 * through the alchemy CLI — network, throwaway Postgres, and the platform
 * image host container — asserts the containers come up with a bound host
 * port, then destroys the stage and asserts convergence. Skipped unless a
 * docker daemon is reachable AND the platform image is built locally (CI
 * runs the deploy-train builds instead; this test is the operator's local
 * e2e harness).
 */
const PLATFORM_IMAGE = process.env.BOS_SANDBOX_IMAGE ?? "citynode-platform:spike";

function dockerAvailable(): boolean {
  return spawnSync("docker", ["info", "--format", "ok"], { timeout: 10_000 }).status === 0;
}

function imagePresent(): boolean {
  return (
    spawnSync("docker", ["image", "inspect", PLATFORM_IMAGE], { timeout: 10_000 }).status === 0
  );
}

function containerStatus(name: string): string | null {
  const result = spawnSync(
    "docker",
    ["container", "inspect", "--format", "{{.State.Status}}", name],
    { timeout: 10_000 },
  );
  return result.status === 0 ? result.stdout.toString().trim() : null;
}

function boundPort(name: string): number {
  const result = spawnSync("docker", ["port", name, "4100"], { timeout: 10_000 });
  return Number(result.stdout.toString().trim().split("\n")[0]?.split(":").pop());
}

const GATED = dockerAvailable() && imagePresent();

describe.skipIf(!GATED)("sandbox stack (live docker, gated)", () => {
  const account = "stack-test.near";
  const gateway = "citynode.app";
  const slug = defaultSlug(account);
  const stage = `sandbox-${slug}`;
  const stackEntry = new URL("../../src/sandbox/stack.ts", import.meta.url).pathname;
  const worktreeRoot = join(import.meta.dirname, "../../../..");

  function runAlchemy(command: "deploy" | "destroy"): ReturnType<typeof spawnSync> {
    return spawnSync("bunx", ["alchemy", command, "--yes", "--stage", stage, stackEntry], {
      timeout: 300_000,
      env: {
        ...process.env,
        BOS_SANDBOX: "1",
        BOS_SANDBOX_ACCOUNT: account,
        BOS_SANDBOX_GATEWAY: gateway,
        BOS_SANDBOX_IMAGE: PLATFORM_IMAGE,
        BOS_SANDBOX_CONFIG_DIR: worktreeRoot,
      },
    });
  }

  it("deploys the lease (pg + host up, port bound) and converges teardown", () => {
    expect(existsSync(stackEntry)).toBe(true);

    const deploy = runAlchemy("deploy");
    expect(deploy.status).toBe(0);

    expect(containerStatus(dockerPgName(slug))).toBe("running");
    expect(containerStatus(dockerHostName(slug))).toBe("running");
    expect(boundPort(dockerHostName(slug))).toBeGreaterThan(0);

    const destroy = runAlchemy("destroy");
    expect(destroy.status).toBe(0);
    expect(containerStatus(dockerPgName(slug))).toBeNull();
    expect(containerStatus(dockerHostName(slug))).toBeNull();
  }, 600_000);
});
