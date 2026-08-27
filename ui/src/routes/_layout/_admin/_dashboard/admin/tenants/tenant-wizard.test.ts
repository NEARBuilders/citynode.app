import { describe, expect, it } from "vitest";
import { resolveTenantIdentity } from "./tenant-wizard";

describe("tenant wizard identity", () => {
  it("uses the configured testnet parent for the complete node slug", () => {
    const identity = resolveTenantIdentity({
      slug: "chicago",
      network: "testnet",
      mainnetAccount: "v1.citynode.near",
      authVariables: {
        siwn: {
          subAccount: {
            testnet: { parentAccount: "citynode-dev.testnet" },
          },
        },
      },
    });

    expect(identity).toEqual({
      parentAccount: "citynode-dev.testnet",
      accountId: "chicago.citynode-dev.testnet",
    });
  });

  it("uses the runtime account for mainnet", () => {
    expect(
      resolveTenantIdentity({
        slug: "chicago",
        network: "mainnet",
        mainnetAccount: "v1.citynode.near",
      }),
    ).toEqual({
      parentAccount: "v1.citynode.near",
      accountId: "chicago.v1.citynode.near",
    });
  });

  it("falls back to the shared testnet parent", () => {
    expect(
      resolveTenantIdentity({
        slug: "chicago",
        network: "testnet",
        mainnetAccount: "v1.citynode.near",
      }),
    ).toEqual({
      parentAccount: "v1.citynode.testnet",
      accountId: "chicago.v1.citynode.testnet",
    });
  });
});
