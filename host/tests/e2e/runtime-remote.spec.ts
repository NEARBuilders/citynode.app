import { expect, test } from "@playwright/test";
import {
  getRuntimeRemoteScenarios,
  type RuntimeRemoteHost,
  startRuntimeRemoteHost,
} from "../helpers/runtime-remote";

const scenarios = await getRuntimeRemoteScenarios();

for (const scenario of scenarios) {
  const suite = scenario.available ? test.describe : test.describe.skip;

  suite(`Remote runtime browser smoke: ${scenario.title}`, () => {
    test.describe.configure({ mode: "serial" });

    let runtime: RuntimeRemoteHost;
    let pageErrors: string[];

    test.beforeAll(async () => {
      runtime = await startRuntimeRemoteHost(scenario);
    });

    test.beforeEach(async ({ page }) => {
      pageErrors = [];
      page.on("pageerror", (error) => {
        pageErrors.push(error.message);
      });
    });

    test.afterAll(async () => {
      await runtime?.stop();
    });

    test("keeps assets and api reachable from the browser", async ({ page }) => {
      await page.goto(`${runtime.baseUrl}/`, { waitUntil: "domcontentloaded" });

      const result = await page.evaluate(
        async ({ apiPath }) => {
          const [skill, llms, ping] = await Promise.all([
            fetch("/skill.md"),
            fetch("/llms.txt"),
            fetch(apiPath),
          ]);

          return {
            skillStatus: skill.status,
            skillLength: (await skill.text()).trim().length,
            llmsStatus: llms.status,
            llmsLength: (await llms.text()).trim().length,
            pingStatus: ping.status,
            pingContentType: ping.headers.get("content-type") ?? "",
            pingText: await ping.text(),
          };
        },
        { apiPath: scenario.proxy ? "/api/ping" : "/api/_health" },
      );

      expect(result.skillStatus).toBe(200);
      expect(result.skillLength).toBeGreaterThan(0);
      expect(result.llmsStatus).toBe(200);
      expect(result.llmsLength).toBeGreaterThan(0);
      expect(result.pingStatus).toBe(200);

      let pingBody: unknown;
      try {
        pingBody = JSON.parse(result.pingText);
      } catch {
        throw new Error(
          `Expected ${scenario.proxy ? "/api/ping" : "/api/_health"} to return JSON but received ${result.pingContentType || "unknown content-type"}: ${result.pingText.slice(0, 300)}`,
        );
      }

      expect(pingBody).toMatchObject({ status: scenario.proxy ? "ok" : "ready" });
      expect(pageErrors).toEqual([]);
    });

    test("paints the remote ui through the local host", async ({ page }) => {
      await page.goto(`${runtime.baseUrl}/`, { waitUntil: "domcontentloaded" });

      await page.evaluate(async () => {
        await (window as Window & { __EVERYTHING_DEV_HYDRATE_PROMISE__?: Promise<void> })
          .__EVERYTHING_DEV_HYDRATE_PROMISE__;
      });

      const state = await page.evaluate(() => {
        const runtimeConfig = (
          window as Window & {
            __RUNTIME_CONFIG__?: { apiBase?: string; rpcBase?: string; repository?: string };
          }
        ).__RUNTIME_CONFIG__;

        const root = document.querySelector("#root");
        const remoteEntry = document.querySelector('script[src*="remoteEntry.js"]');
        const manifest = document.querySelector('link[href*="manifest.json"]');

        return {
          hasRuntimeConfig: Boolean(runtimeConfig),
          apiBase: runtimeConfig?.apiBase,
          rpcBase: runtimeConfig?.rpcBase,
          repository: runtimeConfig?.repository,
          hasRoot: Boolean(root),
          childCount: root?.childElementCount ?? 0,
          hasRemoteEntry: Boolean(remoteEntry),
          hasManifest: Boolean(manifest),
        };
      });

      expect(state).toMatchObject({
        hasRuntimeConfig: true,
        apiBase: "/api",
        rpcBase: "/api/rpc",
        repository: expect.any(String),
        hasRoot: true,
        hasRemoteEntry: true,
        hasManifest: true,
      });

      expect(state.childCount).toBeGreaterThan(0);
      expect(pageErrors).toEqual([]);
    });
  });
}
