import { Effect, Result } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NearRpcUnavailableError, NearViewCallError, viewFunction } from "../services/near-rpc";
import { verifyNodeApplicant } from "../services/node-applicant";

vi.mock("../services/near-rpc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/near-rpc")>()),
  viewFunction: vi.fn(),
}));

const view = vi.mocked(viewFunction);

async function failureOf(effect: Effect.Effect<boolean, unknown>) {
  const outcome = await Effect.runPromise(Effect.result(effect));
  return Result.isFailure(outcome)
    ? (outcome.failure as { code?: string; message?: string })
    : undefined;
}

describe("verifyNodeApplicant", () => {
  beforeEach(() => view.mockReset());

  it("checks testnet DAOs on testnet even when the identity says mainnet", async () => {
    view.mockResolvedValue({ roles: [{ kind: { Group: ["alice.testnet"] } }] });
    await expect(
      Effect.runPromise(
        verifyNodeApplicant("city.sputnik-dao.testnet", "alice.testnet", "mainnet"),
      ),
    ).resolves.toBe(true);
    expect(view).toHaveBeenCalledWith(expect.objectContaining({ network: "testnet" }));
  });

  it("maps an RPC outage to SERVICE_UNAVAILABLE", async () => {
    view.mockRejectedValueOnce(
      new NearRpcUnavailableError({ network: "mainnet", attempts: 3, lastError: "timeout" }),
    );
    const failure = await failureOf(
      verifyNodeApplicant("city.sputnik-dao.near", "alice.near", "mainnet"),
    );
    expect(failure?.code).toBe("SERVICE_UNAVAILABLE");
    expect(failure?.message).toBe("Couldn't reach NEAR, try again");
  });

  it("maps a non-DAO account to BAD_REQUEST", async () => {
    view.mockRejectedValueOnce(
      new NearViewCallError({
        accountId: "x.near",
        methodName: "get_policy",
        kind: "METHOD_NOT_FOUND",
        detail: "MethodNotFound",
      }),
    );
    const failure = await failureOf(verifyNodeApplicant("x.near", "alice.near", "mainnet"));
    expect(failure?.code).toBe("BAD_REQUEST");
  });
});
