import { describe, expect, it } from "vitest";
import { detectStatus } from "../../src/orchestrator";
import type { ServiceDescriptor } from "../../src/service-descriptor";

const pluginDescriptor = {
  command: "bun",
  args: ["run", "dev"],
  readyPatterns: [/ready in/i, /compiled.*successfully/i, /Plugin dev server ready/i],
  errorPatterns: [/\bERROR in\b/, /failed to compile/i, /Module not found/i, /Cannot find module/i],
  defaultPort: 3010,
  readinessPath: "/",
} satisfies ServiceDescriptor;

describe("detectStatus with plugin error patterns", () => {
  it("does not mark errors when a warning mentions an identifier containing 'Error'", () => {
    expect(
      detectStatus(
        "⚠ ESModulesLinkingWarning: export 'isRetryableMigrationError' was not found in 'everything-dev/db'",
        pluginDescriptor,
      ),
    ).toBeNull();
  });

  it("does not mark errors for successful compiles with warnings", () => {
    expect(detectStatus("Rspack compiled with 1 warning", pluginDescriptor)).toBeNull();
  });

  it("marks errors for rspack compile failures", () => {
    expect(detectStatus("ERROR in ./src/db/migrate.ts", pluginDescriptor)).toMatchObject({
      status: "error",
    });
    expect(detectStatus("ERROR: failed to compile app", pluginDescriptor)).toMatchObject({
      status: "error",
    });
    expect(
      detectStatus("Module not found: Can't resolve './missing'", pluginDescriptor),
    ).toMatchObject({ status: "error" });
  });

  it("marks ready for plugin dev server output", () => {
    expect(detectStatus("ready in 431 ms", pluginDescriptor)).toMatchObject({
      status: "ready",
    });
    expect(detectStatus("Rspack compiled successfully", pluginDescriptor)).toMatchObject({
      status: "ready",
    });
  });
});
