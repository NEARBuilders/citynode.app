import {
  createOutlayerClient,
  OutlayerError,
  providerRefusalCodes,
} from "@near-intents-agent-api/outlayer";
import { describe, expect, it } from "vitest";

describe("vendored outlayer surface", () => {
  it("creates a client exposing wallet, signing, funds, cross-chain and query operations", () => {
    const client = createOutlayerClient() as unknown as Record<string, unknown>;
    expect(client.network).toBe("mainnet");
    expect(client.contractId).toBeTruthy();
    expect(typeof client.registerWallet).toBe("function");
    expect(typeof client.address).toBe("function");
    expect(typeof client.depositIntentStatus).toBe("function");
  });

  it("exposes the provider refusal code vocabulary including the serialization rules", () => {
    expect(providerRefusalCodes).toBeInstanceOf(Set);
    expect(providerRefusalCodes.has("wallet_busy")).toBe(true);
    expect(providerRefusalCodes.has("route_unavailable")).toBe(true);
    expect(providerRefusalCodes.has("made_up_code")).toBe(false);
  });

  it("OutlayerError carries a code, status and resent flag", () => {
    const error = new OutlayerError("wallet_busy", 409);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("wallet_busy");
    expect(error.status).toBe(409);
    expect(error.resent).toBe(false);
  });
});
