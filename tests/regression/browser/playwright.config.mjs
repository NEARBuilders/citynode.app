import { defineConfig } from "@playwright/test";
import { computeRegressionEnv } from "../lib/regression-env.mjs";

const mode = process.env.REGRESSION_MODE ?? "dev";
const command =
  mode === "prod"
    ? "bun run regression:start:prod"
    : mode === "backcompat"
      ? "bun run regression:start:backcompat"
      : "bun run regression:start:dev";

const regressionEnv = computeRegressionEnv();

const derivedEnv = {
  ...regressionEnv.dbUrls,
  CORS_ORIGIN: regressionEnv.baseUrl,
  BETTER_AUTH_SECRET: regressionEnv.authSecret,
  RATE_LIMIT_WINDOW_MS: "1000",
  RATE_LIMIT_MAX: "100",
  BODY_LIMIT_MAX: "65536",
  CI: "true",
};

const webServerEnv = Object.fromEntries(
  Object.entries(derivedEnv).filter(([key]) => process.env[key] === undefined),
);

export default defineConfig({
  testDir: "./specs",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  globalSetup: "./helpers/global-setup.ts",
  use: {
    browserName: "chromium",
    headless: true,
    baseURL: regressionEnv.baseUrl,
  },
  webServer: {
    command,
    url: `${regressionEnv.baseUrl}/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: webServerEnv,
  },
  projects: [{ name: "dev" }, { name: "prod" }, { name: "backcompat" }],
});
