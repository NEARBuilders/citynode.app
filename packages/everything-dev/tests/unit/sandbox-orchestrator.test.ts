import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { leaseKey, readLeases, sandboxLeasesPath } from "../../src/sandbox/lease-store";
import { makeSandboxOrchestrator } from "../../src/sandbox/orchestrator";
import type {
  SandboxLease,
  SandboxMachineProviderShape,
  SandboxMachineSpec,
} from "../../src/sandbox/types";
import { SandboxError } from "../../src/sandbox/types";

interface FakeMachine {
  spec: SandboxMachineSpec;
  containerId: string;
}

function fakeProvider(options?: { healthReadyAfter?: number }) {
  const machines = new Map<string, FakeMachine>();
  const networks = new Set<string>();
  let healthChecks = 0;
  let nextPort = 20_000;
  const readyAfter = options?.healthReadyAfter ?? 0;

  const provider: SandboxMachineProviderShape = {
    findFreePort: () => Effect.succeed(++nextPort),
    ensureNetwork: (name) =>
      Effect.sync(() => {
        networks.add(name);
      }),
    connectNetwork: (network, container) =>
      Effect.sync(() => {
        networks.add(`${network}:${container}`);
      }),
    spawn: (spec) =>
      Effect.succeed({
        name: spec.name,
        port: spec.port,
        containerId: `id-${spec.name}`,
        imageDigest: spec.image ? "sha256:fake" : null,
      }).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            machines.set(spec.name, { spec, containerId: `id-${spec.name}` });
          }),
        ),
      ),
    stop: (name) =>
      Effect.sync(() => {
        machines.delete(name);
      }),
    healthCheck: (url) =>
      Effect.sync(() => {
        healthChecks++;
        return (
          healthChecks > readyAfter &&
          [...machines.keys()].some((n) => n.startsWith("sandbox-host-"))
        );
      }),
    imageDigest: (image) => Effect.succeed(image ? "sha256:fake" : null),
  };

  return { provider, machines, networks, healthChecks: () => healthChecks };
}

describe("sandbox orchestrator", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "bos-sandbox-test-"));
    writeFileSync(
      join(configDir, "bos.config.json"),
      JSON.stringify({
        account: "v1.citynode.near",
        domain: "citynode.app",
        plugins: {},
      }),
    );
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  const leasesPath = () => join(configDir, ".bos", "sandboxes.json");

  it("acquires a lease: spawns pg + host, waits for health, persists the lease file", async () => {
    const fake = fakeProvider();
    const orchestrator = makeSandboxOrchestrator(fake.provider, {
      leasesPath: leasesPath(),
      image: "citynode-platform:spike",
      configDir,
    });

    const lease = await Effect.runPromise(
      orchestrator.acquireLease({ account: "t.near", gateway: "citynode.app" }),
    );

    expect(lease.account).toBe("t.near");
    expect(lease.gateway).toBe("citynode.app");
    expect(lease.url).toMatch(/^http:\/\/localhost:\d+$/);
    expect(lease.containers).toHaveLength(2);
    expect(fake.machines.has("sandbox-pg-t-near-citynode-app")).toBe(true);
    expect(fake.machines.has("sandbox-host-t-near-citynode-app")).toBe(true);
    expect(fake.networks.has("sandbox-t-near-citynode-app")).toBe(true);

    const persisted = readLeases(leasesPath());
    expect(persisted).toHaveLength(1);
    expect(persisted[0].account).toBe("t.near");
  });

  it("cleans up spawned machines when the host never becomes healthy", async () => {
    const fake = fakeProvider({ healthReadyAfter: 1_000_000 });
    const orchestrator = makeSandboxOrchestrator(fake.provider, {
      leasesPath: leasesPath(),
      image: "citynode-platform:spike",
      configDir,
      healthPollIntervalMs: 1,
      healthTimeoutMs: 10,
    });

    const result = await Effect.runPromiseExit(
      orchestrator.acquireLease({ account: "t.near", gateway: "citynode.app" }),
    );

    expect(result._tag).toBe("Failure");
    expect(fake.machines.size).toBe(0);
    expect(readLeases(leasesPath())).toHaveLength(0);
  });

  it("replaces an existing lease on re-acquire (stops old machines)", async () => {
    const fake = fakeProvider();
    const orchestrator = makeSandboxOrchestrator(fake.provider, {
      leasesPath: leasesPath(),
      image: "citynode-platform:spike",
      configDir,
    });

    const first = await Effect.runPromise(
      orchestrator.acquireLease({ account: "t.near", gateway: "citynode.app" }),
    );
    const second = await Effect.runPromise(
      orchestrator.acquireLease({ account: "t.near", gateway: "citynode.app" }),
    );

    expect(second.hostPort).not.toBe(first.hostPort);
    const persisted = readLeases(leasesPath());
    expect(persisted).toHaveLength(1);
    expect(persisted[0].createdAt).toBe(second.createdAt);
  });

  it("sweepIdle releases only leases older than the ttl", async () => {
    const fake = fakeProvider();
    const orchestrator = makeSandboxOrchestrator(fake.provider, {
      leasesPath: leasesPath(),
      image: "citynode-platform:spike",
      configDir,
    });

    await Effect.runPromise(
      orchestrator.acquireLease({ account: "old.near", gateway: "citynode.app" }),
    );
    await Effect.runPromise(
      orchestrator.acquireLease({ account: "new.near", gateway: "citynode.app" }),
    );

    const raw = JSON.parse(readFileSync(leasesPath(), "utf8")) as { leases: SandboxLease[] };
    raw.leases = raw.leases.map((l) =>
      l.account === "old.near"
        ? {
            ...l,
            createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            lastUsedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          }
        : l,
    );
    writeFileSync(leasesPath(), JSON.stringify(raw));

    const stopped = await Effect.runPromise(orchestrator.sweepIdle(30 * 60 * 1000));

    expect(stopped).toEqual(["old.near/citynode.app"]);
    expect(fake.machines.has("sandbox-host-old-near-citynode-app")).toBe(false);
    const persisted = readLeases(leasesPath());
    expect(persisted).toHaveLength(1);
    expect(persisted[0].account).toBe("new.near");
  });

  it("releaseLease stops containers and removes the persisted record", async () => {
    const fake = fakeProvider();
    const orchestrator = makeSandboxOrchestrator(fake.provider, {
      leasesPath: leasesPath(),
      image: "citynode-platform:spike",
      configDir,
    });

    await Effect.runPromise(
      orchestrator.acquireLease({ account: "t.near", gateway: "citynode.app" }),
    );
    await Effect.runPromise(
      orchestrator.releaseLease({ account: "t.near", gateway: "citynode.app" }),
    );

    expect(fake.machines.size).toBe(0);
    expect(readLeases(leasesPath())).toHaveLength(0);
  });

  it("rejects a tenant without account or gateway", async () => {
    const fake = fakeProvider();
    const orchestrator = makeSandboxOrchestrator(fake.provider, {
      leasesPath: leasesPath(),
      image: "citynode-platform:spike",
    });

    const result = await Effect.runPromiseExit(
      orchestrator.acquireLease({ account: "", gateway: "g" }),
    );
    expect(result._tag).toBe("Failure");
  });
});

describe("lease store", () => {
  it("sandboxLeasesPath honors BOS_SANDBOX_LEASES and configDir", () => {
    delete process.env.BOS_SANDBOX_LEASES;
    const path = sandboxLeasesPath("/tmp/project");
    expect(path.endsWith(join(".bos", "sandboxes.json"))).toBe(true);
    expect(path.startsWith("/tmp/project")).toBe(true);
  });

  it("readLeases returns [] for missing or corrupt files", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-sandbox-lease-"));
    try {
      expect(readLeases(join(dir, "missing.json"))).toEqual([]);
      const corrupt = join(dir, "corrupt.json");
      writeFileSync(corrupt, "{ not json");
      expect(readLeases(corrupt)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaseKey is account/gateway", () => {
    expect(leaseKey({ account: "a.near", gateway: "g.app" })).toBe("a.near/g.app");
  });
});
