import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { NearMock, nearCalls, builder } = vi.hoisted(() => {
  const nearCalls: Array<Record<string, unknown>> = [];
  const send = vi.fn();
  const functionCall = vi.fn(() => ({ send }));
  const transaction = vi.fn(() => ({ functionCall }));
  class NearMock {
    transaction = transaction;
    constructor(config: Record<string, unknown>) {
      nearCalls.push(config);
    }
  }
  return { NearMock, nearCalls, builder: { send, functionCall, transaction } };
});

vi.mock("near-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("near-kit")>();
  return { ...actual, Near: NearMock };
});

import { resolveSigningKey, submitFunctionCallTransaction } from "../../src/near-signer";

const VALID_KEY =
  "ed25519:5dGS92auiST5KtcLpBG3hQXnWUX2ny94BGYHbzup4jhzyYcpisz6TeoSGKhVQNTtcdANs9MJp5tqqPe21aCGjtBx";
const VALID_PUBLIC_KEY = "ed25519:Co6fppChuw6TKA4CkkKP5DKVBgysE6i1BA8oZYw6Tm6N";

function withCredentialsHome(network: string, account: string, privateKey: string): string {
  const home = mkdtempSync(join(tmpdir(), "near-signer-"));
  const credDir = join(home, ".near-credentials", network);
  mkdirSync(credDir, { recursive: true });
  writeFileSync(
    join(credDir, `${account}.json`),
    JSON.stringify({ account_id: account, public_key: VALID_PUBLIC_KEY, private_key: privateKey }),
  );
  return home;
}

describe("resolveSigningKey", () => {
  const originalHome = process.env.HOME;
  const originalNearKey = process.env.NEAR_PRIVATE_KEY;
  const originalBosKey = process.env.BOS_NEAR_PRIVATE_KEY;
  const tempHomes: string[] = [];

  afterEach(() => {
    if (originalNearKey === undefined) delete process.env.NEAR_PRIVATE_KEY;
    else process.env.NEAR_PRIVATE_KEY = originalNearKey;
    if (originalBosKey === undefined) delete process.env.BOS_NEAR_PRIVATE_KEY;
    else process.env.BOS_NEAR_PRIVATE_KEY = originalBosKey;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    for (const home of tempHomes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  it("prefers an explicitly provided private key", async () => {
    const resolved = await resolveSigningKey({
      privateKey: VALID_KEY,
      account: "v1.citynode.near",
      network: "mainnet",
    });

    expect(resolved).toEqual({ source: "provided", privateKey: VALID_KEY });
  });

  it("falls back to the near-cli credentials file for the account", async () => {
    const home = withCredentialsHome("mainnet", "v1.citynode.near", VALID_KEY);
    tempHomes.push(home);
    process.env.HOME = home;

    const resolved = await resolveSigningKey({
      account: "v1.citynode.near",
      network: "mainnet",
    });

    expect(resolved).toEqual({ source: "credentials-file", privateKey: VALID_KEY });
  });

  it("prefers NEAR_PRIVATE_KEY over the credentials file", async () => {
    const home = withCredentialsHome("mainnet", "v1.citynode.near", VALID_KEY);
    tempHomes.push(home);
    process.env.HOME = home;
    process.env.NEAR_PRIVATE_KEY = VALID_KEY;

    const resolved = await resolveSigningKey({
      account: "v1.citynode.near",
      network: "mainnet",
    });

    expect(resolved).toEqual({ source: "provided", privateKey: VALID_KEY });
  });

  it("throws actionable guidance when no key is available", async () => {
    const home = mkdtempSync(join(tmpdir(), "near-signer-"));
    tempHomes.push(home);
    process.env.HOME = home;

    const promise = resolveSigningKey({
      account: "v1.citynode.near",
      network: "mainnet",
    });

    await expect(promise).rejects.toThrow(/NEAR_PRIVATE_KEY/);
    await expect(promise).rejects.toThrow(/near-credentials/);
  });
});

describe("submitFunctionCallTransaction", () => {
  beforeEach(() => {
    nearCalls.length = 0;
    builder.send.mockReset();
    builder.functionCall.mockClear();
    builder.transaction.mockClear();
  });

  const txArgs = {
    account: "v1.citynode.near",
    contract: "dev.everything.near",
    method: "__fastdata_kv",
    args: {
      "apps/v1.citynode.near/citynode.app/bos.config.json": '{"account":"v1.citynode.near"}',
    },
    network: "mainnet" as const,
    privateKey: VALID_KEY,
  };

  it("submits a function call via near-kit and returns the transaction hash", async () => {
    builder.send.mockResolvedValueOnce({ transaction: { hash: "ABCDEF123" } });

    const result = await submitFunctionCallTransaction(txArgs);

    expect(result).toEqual({ success: true, txHash: "ABCDEF123" });
    expect(nearCalls[0]).toEqual({
      network: "mainnet",
      defaultSignerId: "v1.citynode.near",
      privateKey: VALID_KEY,
    });
    expect(builder.transaction).toHaveBeenCalledWith("v1.citynode.near");
    expect(builder.functionCall).toHaveBeenCalledWith(
      "dev.everything.near",
      "__fastdata_kv",
      txArgs.args,
      expect.objectContaining({
        gas: expect.stringContaining("Tgas"),
        attachedDeposit: expect.anything(),
      }),
    );
    expect(builder.send).toHaveBeenCalledTimes(1);
  });

  it("propagates near-kit submission errors so callers can format actionable messages", async () => {
    const cause = new Error("does not have enough allowance on this key");
    builder.send.mockRejectedValueOnce(cause);

    await expect(submitFunctionCallTransaction(txArgs)).rejects.toBe(cause);
  });
});
