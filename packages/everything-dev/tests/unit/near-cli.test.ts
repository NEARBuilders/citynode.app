import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

const { execaMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
}));

vi.mock("execa", () => ({
  execa: execaMock,
}));

import { ensureNearCli } from "../../src/near-cli";

describe("near-cli", () => {
  afterEach(() => {
    execaMock.mockReset();
    vi.restoreAllMocks();
  });

  it("prints manual install guidance when NEAR CLI is missing", async () => {
    execaMock.mockRejectedValueOnce(new Error("near not found"));

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined as never);

    await expect(Effect.runPromise(ensureNearCli)).rejects.toThrow("NEAR CLI not found");

    expect(execaMock).toHaveBeenCalledWith("near", ["--version"], { stdio: "pipe" });
    expect(logSpy.mock.calls.flat().join("\n")).toContain(
      "To install manually: curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/download/v0.23.5/near-cli-rs-installer.sh | sh",
    );
  });
});
