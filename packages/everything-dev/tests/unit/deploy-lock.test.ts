import { afterEach, describe, expect, it } from "vitest";
import {
  buildDeployLockKey,
  buildDeployLockUrl,
  parseDeployLockValue,
} from "../../src/cli/deploy-lock";
import {
  DEPLOY_LOCK_TTL_DEFAULT_MS,
  PUBLISH_LOCK_TTL_DEFAULT_MS,
  resolveDeployLockTtlFromEnv,
} from "../../src/plugin";

describe("deploy-lock TTL resolution", () => {
  const previous = process.env.BOS_DEPLOY_LOCK_TTL_MS;

  afterEach(() => {
    if (previous === undefined) delete process.env.BOS_DEPLOY_LOCK_TTL_MS;
    else process.env.BOS_DEPLOY_LOCK_TTL_MS = previous;
  });

  it("uses 10 min default for publish", () => {
    delete process.env.BOS_DEPLOY_LOCK_TTL_MS;
    expect(resolveDeployLockTtlFromEnv()).toBe(PUBLISH_LOCK_TTL_DEFAULT_MS);
    expect(resolveDeployLockTtlFromEnv({ extended: false })).toBe(PUBLISH_LOCK_TTL_DEFAULT_MS);
  });

  it("uses 25 min default for deploy", () => {
    delete process.env.BOS_DEPLOY_LOCK_TTL_MS;
    expect(resolveDeployLockTtlFromEnv({ extended: true })).toBe(DEPLOY_LOCK_TTL_DEFAULT_MS);
  });

  it("honors BOS_DEPLOY_LOCK_TTL_MS override for both modes", () => {
    process.env.BOS_DEPLOY_LOCK_TTL_MS = "1800000";
    expect(resolveDeployLockTtlFromEnv()).toBe(1_800_000);
    expect(resolveDeployLockTtlFromEnv({ extended: true })).toBe(1_800_000);
  });

  it("falls back to default when env value is invalid", () => {
    process.env.BOS_DEPLOY_LOCK_TTL_MS = "not-a-number";
    expect(resolveDeployLockTtlFromEnv()).toBe(PUBLISH_LOCK_TTL_DEFAULT_MS);
    expect(resolveDeployLockTtlFromEnv({ extended: true })).toBe(DEPLOY_LOCK_TTL_DEFAULT_MS);
  });
});

describe("deploy-lock helpers", () => {
  describe("parseDeployLockValue", () => {
    it("returns null for empty/sentinel values", () => {
      expect(parseDeployLockValue(null)).toBeNull();
      expect(parseDeployLockValue(undefined)).toBeNull();
      expect(parseDeployLockValue("{}")).toBeNull();
    });

    it("parses stringified JSON values", () => {
      const stored = JSON.stringify({
        owner: "alice",
        pid: 4242,
        startedAt: 1,
        expiresAt: Date.now() + 60_000,
        network: "mainnet",
        nonce: "abc123",
      });
      const result = parseDeployLockValue(stored);
      expect(result).not.toBeNull();
      expect(result?.owner).toBe("alice");
      expect(result?.pid).toBe(4242);
      expect(result?.nonce).toBe("abc123");
      expect(result?.network).toBe("mainnet");
    });

    it("parses object values", () => {
      const result = parseDeployLockValue({
        owner: "deployer",
        pid: 99,
        startedAt: 1000,
        expiresAt: 2000,
        network: "testnet",
        nonce: "deadbeef",
      });
      expect(result?.owner).toBe("deployer");
      expect(result?.network).toBe("testnet");
    });

    it("returns null when nonce or expiresAt is missing", () => {
      expect(parseDeployLockValue({ owner: "x" })).toBeNull();
      expect(parseDeployLockValue({ nonce: "abc" })).toBeNull();
      expect(parseDeployLockValue({ expiresAt: 1000 })).toBeNull();
    });
  });

  describe("buildDeployLockKey", () => {
    it("returns expected apps/.../lock/deploy.json path", () => {
      expect(buildDeployLockKey("v1.foo.near", "citynode.app")).toBe(
        "apps/v1.foo.near/citynode.app/lock/deploy.json",
      );
    });
  });

  describe("buildDeployLockUrl", () => {
    it("builds the FastKV GET URL for mainnet", () => {
      const url = buildDeployLockUrl("v1.foo.near", "citynode.app", "mainnet");
      expect(url).toContain("kv.main.fastnear.com");
      expect(url).toContain("v1.foo.near");
      expect(encodeURIComponent("apps/v1.foo.near/citynode.app/lock/deploy.json")).toBeTruthy();
      expect(
        decodeURIComponent(encodeURIComponent("apps/v1.foo.near/citynode.app/lock/deploy.json")),
      ).toBe("apps/v1.foo.near/citynode.app/lock/deploy.json");
      expect(url).toContain("deploy.json");
    });

    it("builds the FastKV GET URL for testnet", () => {
      const url = buildDeployLockUrl("v1.foo.near", "citynode.app", "testnet");
      expect(url).toContain("kv.test.fastnear.com");
    });
  });
});
