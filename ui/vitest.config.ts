import { defineConfig } from "vitest/config";

const nodeWebStorageFlag = "--no-experimental-webstorage";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    globalSetup: ["./vitest.global-setup.ts"],
    exclude: ["node_modules/**", "dist/**"],
    execArgv: process.allowedNodeEnvironmentFlags.has(nodeWebStorageFlag)
      ? [nodeWebStorageFlag]
      : [],
  },
});
