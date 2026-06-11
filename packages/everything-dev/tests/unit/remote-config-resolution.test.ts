import { afterEach, describe, expect, it, vi } from "vitest";

const { fetchBosConfigFromFastKvMock } = vi.hoisted(() => ({
  fetchBosConfigFromFastKvMock: vi.fn(),
}));

vi.mock("../../src/fastkv", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/fastkv")>();
  return {
    ...actual,
    fetchBosConfigFromFastKv: fetchBosConfigFromFastKvMock,
  };
});

import { resolveRemoteConfigChain } from "../../src/plugin";
import type { BosConfigInput } from "../../src/types";

const PARENT_WITH_HOST: BosConfigInput = {
  account: "parent.near",
  domain: "parent.dev",
  app: {
    host: { development: "local:host", production: "https://host.parent.dev" },
    ui: { development: "local:ui", production: "https://ui.parent.dev" },
    api: { development: "local:api", production: "https://api.parent.dev" },
  },
};

describe("resolveRemoteConfigChain", () => {
  afterEach(() => {
    fetchBosConfigFromFastKvMock.mockReset();
  });

  it("returns the config as-is when it has no extends", async () => {
    fetchBosConfigFromFastKvMock.mockResolvedValue(PARENT_WITH_HOST);

    const result = await resolveRemoteConfigChain("parent.near", "parent.dev", new Set());

    expect(result).toEqual(PARENT_WITH_HOST);
    expect(fetchBosConfigFromFastKvMock).toHaveBeenCalledTimes(1);
    expect(fetchBosConfigFromFastKvMock).toHaveBeenCalledWith("bos://parent.near/parent.dev");
  });

  it("inherits app.host from the parent via extends", async () => {
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
      domain: "child.dev",
      app: {
        ui: { production: "https://ui.child.dev" },
        api: { production: "https://api.child.dev" },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return PARENT_WITH_HOST;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    expect(result.account).toBe("child.near");
    expect(result.domain).toBe("child.dev");
    expect((result.app as Record<string, unknown>).host).toEqual(PARENT_WITH_HOST.app!.host);
    expect(fetchBosConfigFromFastKvMock).toHaveBeenCalledTimes(2);
  });

  it("child explicitly overrides app.host", async () => {
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
      app: {
        host: { development: "local:host", production: "https://host.child.dev" },
        ui: { production: "https://ui.child.dev" },
        api: { production: "https://api.child.dev" },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev")
        return {
          ...PARENT_WITH_HOST,
          app: {
            ...PARENT_WITH_HOST.app!,
            host: { development: "local:host", production: "https://host.parent.dev" },
          },
        };
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    expect((result.app as Record<string, unknown>).host).toEqual({
      development: "local:host",
      production: "https://host.child.dev",
    });
  });

  it("resolves multi-level extends chain (grandchild -> child -> parent)", async () => {
    const parentConfig: BosConfigInput = PARENT_WITH_HOST;
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
      domain: "child.dev",
      app: {
        ui: { production: "https://ui.child.dev" },
        api: { production: "https://api.child.dev" },
      },
    };
    const grandchildConfig: BosConfigInput = {
      extends: "bos://child.near/child.dev",
      account: "grandchild.near",
      domain: "grandchild.dev",
      app: {
        ui: { production: "https://ui.grandchild.dev" },
        api: { production: "https://api.grandchild.dev" },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://grandchild.near/grandchild.dev") return grandchildConfig;
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return parentConfig;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("grandchild.near", "grandchild.dev", new Set());

    expect(result.account).toBe("grandchild.near");
    expect((result.app as Record<string, unknown>).host).toEqual(parentConfig.app!.host);
    expect(fetchBosConfigFromFastKvMock).toHaveBeenCalledTimes(3);
  });

  it("throws on circular extends (self-reference)", async () => {
    const circularConfig: BosConfigInput = {
      extends: "bos://circ.near/circ.dev",
      account: "circ.near",
    };

    fetchBosConfigFromFastKvMock.mockResolvedValue(circularConfig);

    await expect(resolveRemoteConfigChain("circ.near", "circ.dev", new Set())).rejects.toThrow(
      /Circular extends/,
    );
  });

  it("throws on circular extends (A -> B -> A)", async () => {
    const configA: BosConfigInput = {
      extends: "bos://b.near/b.dev",
      account: "a.near",
    };
    const configB: BosConfigInput = {
      extends: "bos://a.near/a.dev",
      account: "b.near",
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://a.near/a.dev") return configA;
      if (url === "bos://b.near/b.dev") return configB;
      throw new Error(`No config found for ${url}`);
    });

    await expect(resolveRemoteConfigChain("a.near", "a.dev", new Set())).rejects.toThrow(
      /Circular extends/,
    );
  });

  it("resolves env-specific extends object using production", async () => {
    const childConfig: BosConfigInput = {
      extends: { production: "bos://parent.near/parent.dev" },
      account: "child.near",
      app: {
        ui: { production: "https://ui.child.dev" },
        api: { production: "https://api.child.dev" },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return PARENT_WITH_HOST;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    expect((result.app as Record<string, unknown>).host).toEqual(PARENT_WITH_HOST.app!.host);
  });

  it("returns resolved config without app when child and parent have no app", async () => {
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
    };
    const parentConfig: BosConfigInput = {
      account: "parent.near",
      repository: "https://github.com/parent",
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return parentConfig;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    expect(result.account).toBe("child.near");
    expect(result.repository).toBe("https://github.com/parent");
    expect(result.app).toBeUndefined();
  });

  it("child without plugins key inherits parent plugins", async () => {
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
    };
    const parentConfig: BosConfigInput = {
      account: "parent.near",
      plugins: {
        analytics: { production: "https://analytics.parent.dev" },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return parentConfig;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    expect(result.plugins).toEqual(parentConfig.plugins);
  });

  it("child with null-sentinel plugin removes parent plugin and does not inherit others", async () => {
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
      plugins: {
        analytics: null,
      },
    };
    const parentConfig: BosConfigInput = {
      account: "parent.near",
      plugins: {
        analytics: { production: "https://analytics.parent.dev" },
        apps: { production: "https://apps.parent.dev" },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return parentConfig;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    expect(result.plugins).toEqual({});
  });

  it("unions secrets arrays across parent and child app entries", async () => {
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
      app: {
        api: {
          production: "https://api.child.dev",
          secrets: ["CHILD_SECRET"],
        },
      },
    };
    const parentConfig: BosConfigInput = {
      account: "parent.near",
      app: {
        host: { development: "local:host", production: "https://host.parent.dev" },
        ui: { development: "local:ui", production: "https://ui.parent.dev" },
        api: {
          development: "local:api",
          production: "https://api.parent.dev",
          secrets: ["PARENT_SECRET", "SHARED_SECRET"],
        },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return parentConfig;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    const apiSecrets = ((result.app as Record<string, unknown>).api as Record<string, unknown>)
      .secrets as string[];
    expect(apiSecrets).toContain("CHILD_SECRET");
    expect(apiSecrets).toContain("PARENT_SECRET");
    expect(apiSecrets).toContain("SHARED_SECRET");
    expect(apiSecrets).toHaveLength(3);
  });

  it("child with empty plugins inherits nothing from parent plugins", async () => {
    const childConfig: BosConfigInput = {
      extends: "bos://parent.near/parent.dev",
      account: "child.near",
      plugins: {},
    };
    const parentConfig: BosConfigInput = {
      account: "parent.near",
      plugins: {
        analytics: { production: "https://analytics.parent.dev" },
      },
    };

    fetchBosConfigFromFastKvMock.mockImplementation((url: string) => {
      if (url === "bos://child.near/child.dev") return childConfig;
      if (url === "bos://parent.near/parent.dev") return parentConfig;
      throw new Error(`No config found for ${url}`);
    });

    const result = await resolveRemoteConfigChain("child.near", "child.dev", new Set());

    expect(result.plugins).toEqual({});
  });
});
