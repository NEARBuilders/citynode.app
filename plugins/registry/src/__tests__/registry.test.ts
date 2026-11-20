import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchBosConfigFromFastKvMock = vi.fn();
const listLatestValuesMock = vi.fn();
const readLatestValueMock = vi.fn();

vi.mock("../services/fastkv", async () => {
  const actual = await vi.importActual<typeof import("../services/fastkv")>("../services/fastkv");
  return {
    ...actual,
    fetchBosConfigFromFastKv: fetchBosConfigFromFastKvMock,
    listLatestValues: listLatestValuesMock,
    readLatestValue: readLatestValueMock,
  };
});

const { createRegistryMethods, resolvePublishedRuntime } = await import("../services/registry");

describe("resolvePublishedRuntime", () => {
  const registryConfig = { namespace: "dev.everything.near" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats a runtime with no extends as its own lineage root", async () => {
    const result = await resolvePublishedRuntime(
      "pingpayio.near",
      "pingpay.io",
      {
        account: "pingpayio.near",
        domain: "pingpay.io",
      },
      registryConfig,
    );

    expect(result.lineage).toEqual({
      parent: null,
      root: "bos://pingpayio.near/pingpay.io",
      depth: 0,
      extendsChain: ["bos://pingpayio.near/pingpay.io"],
    });
    expect(fetchBosConfigFromFastKvMock).not.toHaveBeenCalled();
  });

  it("derives lineage from production extends refs and merges inherited config", async () => {
    fetchBosConfigFromFastKvMock.mockResolvedValueOnce({
      account: "pingpayio.near",
      domain: "pingpay.io",
      title: "PingPay",
      description: "Parent runtime",
      app: {
        ui: { production: "https://cdn.example.com/pingpay-ui" },
      },
    });

    const result = await resolvePublishedRuntime(
      "pizza.pingpayio.near",
      "pizza.com",
      {
        extends: {
          development: "bos://local-parent.near/dev.local",
          production: "bos://pingpayio.near/pingpay.io",
        },
        account: "pizza.pingpayio.near",
        domain: "pizza.com",
        title: "Pizza",
      },
      registryConfig,
    );

    expect(result.lineage).toEqual({
      parent: "bos://pingpayio.near/pingpay.io",
      root: "bos://pingpayio.near/pingpay.io",
      depth: 1,
      extendsChain: ["bos://pizza.pingpayio.near/pizza.com", "bos://pingpayio.near/pingpay.io"],
    });
    expect(result.resolvedConfig.title).toBe("Pizza");
    expect(result.resolvedConfig.description).toBe("Parent runtime");
    expect(result.resolvedConfig.app?.ui).toEqual({
      production: "https://cdn.example.com/pingpay-ui",
    });
  });

  it("computes nested depth and root for grandchild runtimes", async () => {
    fetchBosConfigFromFastKvMock
      .mockResolvedValueOnce({
        extends: "bos://pingpayio.near/pingpay.io",
        account: "pizza.pingpayio.near",
        domain: "pizza.com",
      })
      .mockResolvedValueOnce({
        account: "pingpayio.near",
        domain: "pingpay.io",
      });

    const result = await resolvePublishedRuntime(
      "chicago.pizza.pingpayio.near",
      "pizza.com",
      {
        extends: "bos://pizza.pingpayio.near/pizza.com",
        account: "chicago.pizza.pingpayio.near",
        domain: "pizza.com",
      },
      registryConfig,
    );

    expect(result.lineage).toEqual({
      parent: "bos://pizza.pingpayio.near/pizza.com",
      root: "bos://pingpayio.near/pingpay.io",
      depth: 2,
      extendsChain: [
        "bos://chicago.pizza.pingpayio.near/pizza.com",
        "bos://pizza.pingpayio.near/pizza.com",
        "bos://pingpayio.near/pingpay.io",
      ],
    });
  });

  it("lists registry apps with derived parent/root filters and lineage fields", async () => {
    listLatestValuesMock
      .mockResolvedValueOnce({
        entries: [
          {
            key: "apps/pingpayio.near/pingpay.io/bos.config.json",
            value: {
              account: "pingpayio.near",
              domain: "pingpay.io",
              app: {
                host: { production: "https://host.example.com" },
                ui: { production: "https://cdn.example.com/root-ui" },
                api: { production: "https://api.example.com/root" },
              },
            },
          },
          {
            key: "apps/pizza.pingpayio.near/pizza.com/bos.config.json",
            value: {
              extends: "bos://pingpayio.near/pingpay.io",
              account: "pizza.pingpayio.near",
              domain: "pizza.com",
              app: {
                host: { production: "https://pizza.example.com/host" },
                ui: { production: "https://cdn.example.com/pizza-ui" },
                api: { production: "https://api.example.com/pizza" },
              },
            },
          },
          {
            key: "apps/chicago.pizza.pingpayio.near/pizza.com/bos.config.json",
            value: {
              extends: "bos://pizza.pingpayio.near/pizza.com",
              account: "chicago.pizza.pingpayio.near",
              domain: "pizza.com",
              app: {
                host: { production: "https://chicago.example.com/host" },
                ui: { production: "https://cdn.example.com/chicago-ui" },
                api: { production: "https://api.example.com/chicago" },
              },
            },
          },
        ],
        pageToken: null,
      })
      .mockResolvedValueOnce({ entries: [], pageToken: null });

    fetchBosConfigFromFastKvMock.mockImplementation(async (bosUrl: string) => {
      if (bosUrl === "bos://pingpayio.near/pingpay.io") {
        return {
          account: "pingpayio.near",
          domain: "pingpay.io",
          app: {
            host: { production: "https://host.example.com" },
            ui: { production: "https://cdn.example.com/root-ui" },
            api: { production: "https://api.example.com/root" },
          },
        };
      }

      if (bosUrl === "bos://pizza.pingpayio.near/pizza.com") {
        return {
          extends: "bos://pingpayio.near/pingpay.io",
          account: "pizza.pingpayio.near",
          domain: "pizza.com",
          app: {
            host: { production: "https://pizza.example.com/host" },
            ui: { production: "https://cdn.example.com/pizza-ui" },
            api: { production: "https://api.example.com/pizza" },
          },
        };
      }

      throw new Error(`Unexpected BOS URL ${bosUrl}`);
    });

    readLatestValueMock.mockResolvedValue(null);

    const service = createRegistryMethods(registryConfig);
    const byParent = await service.listRegistryApps({
      parent: "bos://pingpayio.near/pingpay.io",
    });

    expect(byParent.data).toHaveLength(1);
    expect(byParent.data[0]).toMatchObject({
      accountId: "pizza.pingpayio.near",
      parent: "bos://pingpayio.near/pingpay.io",
      root: "bos://pingpayio.near/pingpay.io",
      depth: 1,
    });

    const byRoot = await service.listRegistryApps({ root: "bos://pingpayio.near/pingpay.io" });

    expect(byRoot.data).toHaveLength(3);
    expect(byRoot.data.map((item) => item.accountId)).toEqual([
      "chicago.pizza.pingpayio.near",
      "pingpayio.near",
      "pizza.pingpayio.near",
    ]);
    expect(
      byRoot.data.find((item) => item.accountId === "chicago.pizza.pingpayio.near"),
    ).toMatchObject({
      parent: "bos://pizza.pingpayio.near/pizza.com",
      root: "bos://pingpayio.near/pingpay.io",
      depth: 2,
    });

    const byAncestor = await service.listRegistryApps({
      ancestor: "bos://pizza.pingpayio.near/pizza.com",
    });

    expect(byAncestor.data).toHaveLength(1);
    expect(byAncestor.data[0]).toMatchObject({
      accountId: "chicago.pizza.pingpayio.near",
      parent: "bos://pizza.pingpayio.near/pizza.com",
      root: "bos://pingpayio.near/pingpay.io",
      depth: 2,
    });

    const wholeTreeFromRoot = await service.listRegistryApps({
      ancestor: "bos://pingpayio.near/pingpay.io",
    });

    expect(wholeTreeFromRoot.data.map((item) => item.accountId)).toEqual([
      "chicago.pizza.pingpayio.near",
      "pizza.pingpayio.near",
    ]);
  });
});

describe("listRegistryApps resilience", () => {
  const registryConfig = { namespace: "dev.everything.near" };

  const configEntry = (accountId: string, gatewayId: string, value: unknown) => ({
    key: `apps/${accountId}/${gatewayId}/bos.config.json`,
    value,
  });

  const readyApp = (accountId: string, gatewayId: string, extra: Record<string, unknown> = {}) => ({
    account: accountId,
    domain: gatewayId,
    app: {
      host: { production: `https://${gatewayId}/host` },
      ui: { production: `https://${gatewayId}/ui` },
    },
    ...extra,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    readLatestValueMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips an app whose parent cannot be resolved and returns the rest", async () => {
    listLatestValuesMock.mockImplementation(async (options: { baseUrl: string }) =>
      options.baseUrl.includes("test")
        ? { entries: [], pageToken: null }
        : {
            entries: [
              configEntry("good.near", "good.com", readyApp("good.near", "good.com")),
              configEntry(
                "bad.near",
                "bad.com",
                readyApp("bad.near", "bad.com", { extends: "bos://missing.near/x.com" }),
              ),
            ],
            pageToken: null,
          },
    );
    fetchBosConfigFromFastKvMock.mockRejectedValue(new Error("No config found"));

    const service = createRegistryMethods(registryConfig);
    const result = await service.listRegistryApps({});

    expect(result.data.map((item) => item.accountId)).toEqual(["good.near"]);
    expect(result.meta.total).toBe(1);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("bad.near/bad.com"));
  });

  it("returns the reachable network when the other network fails", async () => {
    listLatestValuesMock.mockImplementation(async (options: { baseUrl: string }) => {
      if (options.baseUrl.includes("test")) {
        throw new Error("testnet down");
      }
      return {
        entries: [configEntry("good.near", "good.com", readyApp("good.near", "good.com"))],
        pageToken: null,
      };
    });

    const service = createRegistryMethods(registryConfig);
    const result = await service.listRegistryApps({});

    expect(result.data.map((item) => item.accountId)).toEqual(["good.near"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("testnet"));
  });

  it("dedupes concurrent discovery and caches resolved runtimes", async () => {
    listLatestValuesMock.mockImplementation(async (options: { baseUrl: string }) =>
      options.baseUrl.includes("test")
        ? { entries: [], pageToken: null }
        : {
            entries: [
              configEntry(
                "child.near",
                "child.com",
                readyApp("child.near", "child.com", { extends: "bos://parent.near/parent.com" }),
              ),
            ],
            pageToken: null,
          },
    );
    fetchBosConfigFromFastKvMock.mockResolvedValue(readyApp("parent.near", "parent.com"));

    const service = createRegistryMethods(registryConfig);
    const [first, second] = await Promise.all([
      service.listRegistryApps({}),
      service.listRegistryApps({}),
    ]);

    expect(first.data.map((item) => item.accountId)).toEqual(["child.near"]);
    expect(second.data.map((item) => item.accountId)).toEqual(["child.near"]);
    expect(listLatestValuesMock).toHaveBeenCalledTimes(2);
    expect(fetchBosConfigFromFastKvMock).toHaveBeenCalledTimes(1);
  });

  it("serves stale discovery when a later refresh fails", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    let mainnetFails = false;
    listLatestValuesMock.mockImplementation(async (options: { baseUrl: string }) => {
      if (options.baseUrl.includes("test")) {
        return { entries: [], pageToken: null };
      }
      if (mainnetFails) {
        throw new Error("mainnet flaked");
      }
      return {
        entries: [configEntry("good.near", "good.com", readyApp("good.near", "good.com"))],
        pageToken: null,
      };
    });

    const service = createRegistryMethods(registryConfig);
    const first = await service.listRegistryApps({});
    expect(first.data.map((item) => item.accountId)).toEqual(["good.near"]);

    mainnetFails = true;
    now.mockReturnValue(1_000_000 + 60_001);
    const second = await service.listRegistryApps({});

    expect(second.data.map((item) => item.accountId)).toEqual(["good.near"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("serving cached entries"));
  });

  it("serves the last good runtime when a re-resolve fails", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    listLatestValuesMock.mockImplementation(async (options: { baseUrl: string }) =>
      options.baseUrl.includes("test")
        ? { entries: [], pageToken: null }
        : {
            entries: [
              configEntry(
                "child.near",
                "child.com",
                readyApp("child.near", "child.com", { extends: "bos://parent.near/parent.com" }),
              ),
            ],
            pageToken: null,
          },
    );
    fetchBosConfigFromFastKvMock
      .mockResolvedValueOnce(readyApp("parent.near", "parent.com"))
      .mockRejectedValue(new Error("parent read flaked"));

    const service = createRegistryMethods(registryConfig);
    const first = await service.listRegistryApps({});
    expect(first.data.map((item) => item.accountId)).toEqual(["child.near"]);

    now.mockReturnValue(2_000_000 + 60_001);
    const second = await service.listRegistryApps({});

    expect(second.data.map((item) => item.accountId)).toEqual(["child.near"]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("serving cached runtime"));
  });

  it("rebuilds a cached runtime after the app republishes a new config", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    let republished = false;
    listLatestValuesMock.mockImplementation(async (options: { baseUrl: string }) =>
      options.baseUrl.includes("test")
        ? { entries: [], pageToken: null }
        : {
            entries: [
              configEntry(
                "child.near",
                "child.com",
                readyApp("child.near", "child.com", {
                  extends: republished ? "bos://parent-b.near/b.com" : "bos://parent-a.near/a.com",
                }),
              ),
            ],
            pageToken: null,
          },
    );
    fetchBosConfigFromFastKvMock.mockImplementation(async (bosUrl: string) =>
      bosUrl === "bos://parent-a.near/a.com"
        ? readyApp("parent-a.near", "a.com")
        : readyApp("parent-b.near", "b.com"),
    );

    const service = createRegistryMethods(registryConfig);
    const first = await service.listRegistryApps({});
    expect(first.data[0]?.parent).toBe("bos://parent-a.near/a.com");

    republished = true;
    now.mockReturnValue(3_000_000 + 60_001);
    const second = await service.listRegistryApps({});
    expect(second.data[0]?.parent).toBe("bos://parent-b.near/b.com");
  });
});

describe("prepareRegistryConfigWrite", () => {
  const registryConfig = { namespace: "dev.everything.near" };

  it("returns a prepared FastKV call matching the bos publish key and args", () => {
    const service = createRegistryMethods(registryConfig);
    const config = {
      account: "pingpayio.near",
      domain: "pingpay.io",
      app: {
        host: { production: "https://host.example.com" },
        ui: { production: "https://cdn.example.com/ui" },
        api: { production: "https://api.example.com" },
      },
    };

    const result = service.prepareRegistryConfigWrite({
      accountId: "pingpayio.near",
      gatewayId: "pingpay.io",
      config,
    });

    expect(result.contractId).toBe("dev.everything.near");
    expect(result.methodName).toBe("__fastdata_kv");
    expect(result.key).toBe("apps/pingpayio.near/pingpay.io/bos.config.json");
    expect(result.args[result.key]).toBe(JSON.stringify(config));
    expect(result.gas).toBe("300 Tgas");
    expect(result.attachedDeposit).toBe("0 yocto");
  });

  it("targets the global registry namespace that bos:// resolution reads", async () => {
    const { registryNamespaceForNetwork } = await import("everything-dev/registry");
    const { DEFAULT_REGISTRY_NAMESPACE } = await import("../services/fastkv");

    expect(DEFAULT_REGISTRY_NAMESPACE).toBe(registryNamespaceForNetwork("mainnet"));

    const service = createRegistryMethods({ namespace: DEFAULT_REGISTRY_NAMESPACE });

    const result = service.prepareRegistryConfigWrite({
      accountId: "testing123.sputnik-dao.near",
      gatewayId: "citynode.app",
      config: { account: "testing123.sputnik-dao.near" },
    });

    expect(result.contractId).toBe(registryNamespaceForNetwork("mainnet"));
  });
});
