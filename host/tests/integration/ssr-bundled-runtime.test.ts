import { describe, expect, it } from "vitest";
import { type BundledHostRuntime, startBundledHost } from "../helpers/bundled-host";

function createRuntimeConfig(urls: { baseUrl: string; uiAssetsUrl: string }) {
  return {
    env: "production",
    account: "dev.everything.near",
    domain: "everything.dev",
    networkId: "mainnet",
    title: "everything.dev",
    description: "Bundled SSR regression runtime",
    repository: "https://github.com/nearbuilders/everything-dev",
    host: {
      name: "host",
      url: urls.baseUrl,
      entry: `${urls.baseUrl}/mf-manifest.json`,
      source: "remote",
    },
    ui: {
      name: "ui",
      url: urls.uiAssetsUrl,
      entry: `${urls.uiAssetsUrl}/mf-manifest.json`,
      source: "remote",
      ssrUrl: `${urls.uiAssetsUrl}/ssr`,
    },
    api: {
      name: "api",
      url: urls.baseUrl,
      entry: `${urls.baseUrl}/mf-manifest.json`,
      source: "remote",
    },
    auth: {
      name: "auth",
      url: urls.baseUrl,
      entry: `${urls.baseUrl}/mf-manifest.json`,
      source: "remote",
      variables: {
        passkey: { rpID: "everything.dev", rpName: "everything.dev" },
        siwn: {
          recipients: {
            mainnet: "dev.everything.near",
            testnet: "dev.allthethings.testnet",
          },
        },
      },
    },
  } as const;
}

describe("bundled host SSR runtime", () => {
  let runtime: BundledHostRuntime | null = null;

  it("renders real SSR markup from the bundled UI remote through the host", async () => {
    runtime = await startBundledHost((urls) => createRuntimeConfig(urls));

    const response = await fetch(`${runtime.baseUrl}/`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("everything.dev");
    expect(html).not.toContain("SSR unavailable, showing client app.");
    expect(html).not.toContain("<p>Loading...</p>");

    expect(html).toContain("window.__RUNTIME_CONFIG__");
    expect(html).toContain("remoteEntry.js");
    expect(html).toContain("static/css/style.css");

    await runtime.stop();
  }, 120000);
});
