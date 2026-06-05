import { EventEmitter } from "node:events";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

type DeferredProc = Promise<{ exitCode: number; stdout?: string; stderr?: string }> & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

const { execaMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
}));

vi.mock("execa", () => ({
  execa: execaMock,
}));

import { executeTransaction } from "../../src/near-cli";

function createDeferredProc() {
  let resolve!: (value: { exitCode: number; stdout?: string; stderr?: string }) => void;
  const proc = new Promise<{ exitCode: number; stdout?: string; stderr?: string }>(
    (promiseResolve) => {
      resolve = promiseResolve;
    },
  ) as DeferredProc;

  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  return { proc, resolve };
}

describe("executeTransaction", () => {
  afterEach(() => {
    execaMock.mockReset();
    vi.restoreAllMocks();
  });

  it("streams near output while waiting for completion", async () => {
    const { proc, resolve } = createDeferredProc();
    execaMock.mockReturnValueOnce(proc);

    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true as never);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true as never);

    const promise = Effect.runPromise(
      executeTransaction({
        account: "dev.everything.near",
        contract: "dev.everything.near",
        method: "__fastdata_kv",
        argsBase64: "e30=",
        network: "mainnet",
        privateKey: "ed25519:test",
      }),
    );

    await Promise.resolve();

    proc.stdout.emit("data", Buffer.from("Publishing to https://kv...\n"));
    proc.stderr.emit("data", Buffer.from("Transaction ID: ABC123\n"));

    expect(stdoutSpy).toHaveBeenCalledWith(Buffer.from("Publishing to https://kv...\n"));
    expect(stderrSpy).toHaveBeenCalledWith(Buffer.from("Transaction ID: ABC123\n"));

    resolve({ exitCode: 0, stdout: "", stderr: "" });

    await expect(promise).resolves.toEqual({ success: true, txHash: "ABC123" });
    expect(execaMock).toHaveBeenCalledWith(
      "near",
      expect.arrayContaining(["sign-with-plaintext-private-key", "ed25519:test", "send"]),
      expect.objectContaining({
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        reject: false,
        timeout: 300000,
      }),
    );
  });

  it("fails before spawning near when no tty is available", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });

    try {
      await expect(
        Effect.runPromise(
          executeTransaction({
            account: "dev.everything.near",
            contract: "dev.everything.near",
            method: "__fastdata_kv",
            argsBase64: "e30=",
            network: "mainnet",
          }),
        ),
      ).rejects.toThrow(/no TTY available for keychain signing/i);
      expect(execaMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process.stdin, "isTTY", {
        configurable: true,
        value: originalIsTTY,
      });
    }
  });

  it("fails when near output never includes a transaction hash", async () => {
    const { proc, resolve } = createDeferredProc();
    execaMock.mockReturnValueOnce(proc);

    const promise = Effect.runPromise(
      executeTransaction({
        account: "dev.everything.near",
        contract: "dev.everything.near",
        method: "__fastdata_kv",
        argsBase64: "e30=",
        network: "mainnet",
        privateKey: "ed25519:test",
      }),
    );

    await Promise.resolve();

    proc.stdout.emit("data", Buffer.from("Publishing to https://kv...\n"));
    resolve({ exitCode: 0, stdout: "", stderr: "" });

    await expect(promise).rejects.toThrow(/Transaction hash missing from NEAR CLI output/);
  });
});
