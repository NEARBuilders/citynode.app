import { describe, expect, it } from "vitest";
import { commandCatalog } from "../../src/cli/catalog";
import { parseCommandInput } from "../../src/cli/parse";

describe("parseCommandInput", () => {
  const initDescriptor = commandCatalog.find((command) => command.key === "init");

  it("accepts boolean fields whose names already start with no-", () => {
    expect(initDescriptor).toBeDefined();

    const input = parseCommandInput(initDescriptor!, [
      "starter.everything.dev",
      "--extends",
      "dev.everything.near/everything.dev",
      "--account",
      "starter.near",
      "--directory",
      "/tmp/starter",
      "--overrides",
      "ui",
      "--no-interactive",
      "--no-install",
    ]) as {
      noInteractive: boolean;
      noInstall: boolean;
      overrides: string[];
    };

    expect(input.noInteractive).toBe(true);
    expect(input.noInstall).toBe(true);
    expect(input.overrides).toEqual(["ui"]);
  });

  it("still supports negated booleans for positive field names", () => {
    const startDescriptor = commandCatalog.find((command) => command.key === "start");

    expect(startDescriptor).toBeDefined();

    const input = parseCommandInput(startDescriptor!, ["--no-interactive"]) as {
      interactive: boolean;
    };

    expect(input.interactive).toBe(false);
  });
});
