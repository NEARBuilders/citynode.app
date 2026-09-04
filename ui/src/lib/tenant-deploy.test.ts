import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { publishDaoTenantConfig } from "./tenant-deploy";

describe("publishDaoTenantConfig", () => {
  it("prepares the DAO-owned config and submits it through the Trezu signer", async () => {
    const prepareRegistryConfigWrite = vi.fn().mockResolvedValue({
      data: {
        contractId: "dev.everything.near",
        methodName: "__fastdata_kv",
        args: { "apps/chicago.sputnik-dao.near/citynode.app/bos.config.json": "{}" },
        gas: "300 Tgas",
        attachedDeposit: "0 yocto",
      },
    });
    const signTransaction = vi.fn().mockResolvedValue({ transaction: "submitted" });

    await publishDaoTenantConfig(
      { apps: { prepareRegistryConfigWrite } } as unknown as ApiClient,
      {
        daoAccountId: "chicago.sputnik-dao.near",
        gatewayId: "citynode.app",
        baseAccount: "everything.near",
        hostname: "chicago.citynode.app",
        title: "Chicago",
      },
      signTransaction,
    );

    expect(prepareRegistryConfigWrite).toHaveBeenCalledWith({
      accountId: "chicago.sputnik-dao.near",
      gatewayId: "citynode.app",
      config: {
        extends: "bos://everything.near/citynode.app",
        account: "chicago.sputnik-dao.near",
        domain: "chicago.citynode.app",
        title: "Chicago",
        description: "Chicago",
      },
    });
    expect(signTransaction).toHaveBeenCalledWith("chicago.sputnik-dao.near", {
      receiverId: "dev.everything.near",
      methodName: "__fastdata_kv",
      args: { "apps/chicago.sputnik-dao.near/citynode.app/bos.config.json": "{}" },
      gas: "300 Tgas",
      attachedDeposit: "0 yocto",
    });
  });
});
