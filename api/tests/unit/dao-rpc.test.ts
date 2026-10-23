import { ORPCError } from "@orpc/server";
import { Effect, Result } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NEAR_UNAVAILABLE_MESSAGE, verifyDaoMembership } from "../../src/services/dao";
import {
  NearRpcUnavailableError,
  NearViewCallError,
  viewFunction,
} from "../../src/services/near-rpc";

vi.mock("../../src/services/near-rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/services/near-rpc")>()),
  viewFunction: vi.fn(),
}));

const view = vi.mocked(viewFunction);

async function run(daoAccountId = "city.sputnik-dao.near") {
  const outcome = await Effect.runPromise(
    Effect.result(verifyDaoMembership({ daoAccountId, memberAccountId: "alice.near" })),
  );
  return Result.isSuccess(outcome)
    ? { value: outcome.success, error: undefined }
    : { value: undefined, error: outcome.failure };
}

describe("verifyDaoMembership RPC handling", () => {
  beforeEach(() => view.mockReset());

  it("reports an RPC outage as SERVICE_UNAVAILABLE, not as a non-DAO", async () => {
    view.mockRejectedValueOnce(
      new NearRpcUnavailableError({ network: "mainnet", attempts: 3, lastError: new Error("429") }),
    );
    const { error } = await run();
    expect(error).toBeInstanceOf(ORPCError);
    expect(error?.code).toBe("SERVICE_UNAVAILABLE");
    expect(error?.message).toBe(NEAR_UNAVAILABLE_MESSAGE);
    expect(error?.data).toMatchObject({ reason: "NEAR_RPC_UNAVAILABLE", network: "mainnet" });
    expect(error?.message).not.toMatch(/sputnik/);
  });

  it("reports a missing account or get_policy method as not a sputnik-dao contract", async () => {
    for (const kind of ["UNKNOWN_ACCOUNT", "METHOD_NOT_FOUND"] as const) {
      view.mockRejectedValueOnce(
        new NearViewCallError({
          accountId: "x.near",
          methodName: "get_policy",
          kind,
          detail: "nope",
        }),
      );
      const { error } = await run("x.near");
      expect(error?.code).toBe("BAD_REQUEST");
      expect(error?.message).toMatch(/not a sputnik-dao contract/);
      expect(error?.data).toMatchObject({ cause: expect.stringContaining(kind) });
    }
  });

  it("rejects a policy without roles as not a sputnik-dao contract", async () => {
    view.mockResolvedValue({ something: "else" });
    const { error } = await run();
    expect(error?.code).toBe("BAD_REQUEST");
  });

  it("queries testnet for .testnet DAOs even without an explicit network", async () => {
    view.mockResolvedValue({ roles: [{ name: "council", kind: { Group: ["alice.near"] } }] });
    const { value } = await run("city.sputnik-dao.testnet");
    expect(value).toMatchObject({ isSputnikContract: true, isMember: true });
    expect(view).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "city.sputnik-dao.testnet", network: "testnet" }),
    );
  });
});
