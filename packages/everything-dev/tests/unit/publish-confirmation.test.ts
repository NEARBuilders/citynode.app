import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { waitForPublishedConfig } from "../../src/plugin";
import type { BosConfig } from "../../src/types";

describe("waitForPublishedConfig", () => {
  const originalTimeout = process.env.BOS_PUBLISH_CONFIRMATION_TIMEOUT_MS;
  const originalInterval = process.env.BOS_PUBLISH_CONFIRMATION_INTERVAL_MS;

  beforeEach(() => {
    delete process.env.BOS_PUBLISH_CONFIRMATION_TIMEOUT_MS;
    delete process.env.BOS_PUBLISH_CONFIRMATION_INTERVAL_MS;
  });

  afterEach(() => {
    fetchBosConfigFromFastKvMock.mockReset();
    if (originalTimeout === undefined) delete process.env.BOS_PUBLISH_CONFIRMATION_TIMEOUT_MS;
    else process.env.BOS_PUBLISH_CONFIRMATION_TIMEOUT_MS = originalTimeout;

    if (originalInterval === undefined) delete process.env.BOS_PUBLISH_CONFIRMATION_INTERVAL_MS;
    else process.env.BOS_PUBLISH_CONFIRMATION_INTERVAL_MS = originalInterval;
  });

  const publishConfig: BosConfig = {
    account: "dev.everything.near",
    domain: "dev.everything.dev",
    app: {
      host: { development: "local:host", production: "https://host.example" },
      ui: { development: "local:ui", production: "https://ui.example" },
      api: { development: "local:api", production: "https://api.example" },
    },
  };

  it("polls until FastKV reflects the published config", async () => {
    fetchBosConfigFromFastKvMock
      .mockResolvedValueOnce({ ...publishConfig, domain: "stale.example" })
      .mockResolvedValueOnce(publishConfig);

    await waitForPublishedConfig({
      account: "dev.everything.near",
      gateway: "dev.everything.dev",
      publishConfig,
      timeoutMs: 50,
      intervalMs: 0,
    });

    expect(fetchBosConfigFromFastKvMock).toHaveBeenCalledTimes(2);
    expect(fetchBosConfigFromFastKvMock).toHaveBeenNthCalledWith(
      1,
      "bos://dev.everything.near/dev.everything.dev",
    );
    expect(fetchBosConfigFromFastKvMock).toHaveBeenNthCalledWith(
      2,
      "bos://dev.everything.near/dev.everything.dev",
    );
  });

  it("times out when FastKV never reflects the published config", async () => {
    fetchBosConfigFromFastKvMock.mockResolvedValue({ ...publishConfig, domain: "stale.example" });

    await expect(
      waitForPublishedConfig({
        account: "dev.everything.near",
        gateway: "dev.everything.dev",
        publishConfig,
        timeoutMs: 10,
        intervalMs: 0,
      }),
    ).rejects.toThrow(/Timed out waiting for publish confirmation/);
  });
});
