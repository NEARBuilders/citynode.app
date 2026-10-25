import { FunctionCallError, Near, NetworkError, type WalletConnection } from "near-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyMemberSigningError,
  createMemberSessionWallet,
  createMemberSigningController,
  MEMBER_SIGNING_MESSAGES,
  MEMBER_WALLET_ID,
  MemberSigningError,
  type MemberWalletExecutor,
} from "./member-wallet";
import { type DaoPlan, proposeAsSession } from "./sputnik-proposals";

vi.mock("@/app", () => ({ getCspNonce: () => undefined }));

const MEMBER = "a1b2c3.passkey.near";
const DAO = "throwaway.sputnik-dao.near";

const PLAN: DaoPlan = {
  kind: "call",
  receiverId: "registry.near",
  methodName: "__fastdata_kv",
  args: { k: "v" },
  gas: "30 Tgas",
};

type SendParams = Parameters<WalletConnection["signAndSendTransaction"]>[0];

function stubExecutor(
  options: {
    connected?: string | null;
    connectsAs?: string | null;
    send?: () => Promise<unknown>;
  } = {},
) {
  const sent: SendParams[] = [];
  let connected = options.connected ?? null;
  const wallet: WalletConnection = {
    async getAccounts() {
      return connected ? [{ accountId: connected }] : [];
    },
    async signAndSendTransaction(params) {
      sent.push(params);
      if (options.send) return (await options.send()) as never;
      return {
        final_execution_status: "EXECUTED",
        status: { SuccessValue: "" },
        transaction: { hash: "stub-hash", signer_id: MEMBER },
      } as never;
    },
  };
  const executor = {
    connect: vi.fn(async () => {
      connected = options.connectsAs === undefined ? MEMBER : options.connectsAs;
      return connected;
    }),
    getConnectedAccountId: vi.fn(async () => connected),
    getWallet: vi.fn(() => wallet),
    disconnect: vi.fn(async () => {
      connected = null;
    }),
  } satisfies MemberWalletExecutor;
  return { executor, sent };
}

function mockBond(bond: string) {
  return vi
    .spyOn(Near.prototype, "view")
    .mockImplementation(async (_contractId, method) =>
      method === "get_policy" ? ({ proposal_bond: bond } as never) : (null as never),
    );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("member session wallet", () => {
  it("uses the Passkey Wallet from better-near-auth's manifest", () => {
    expect(MEMBER_WALLET_ID).toBe("passkey");
  });

  it("signs add_proposal as the session-linked account with the bond attached", async () => {
    mockBond("100000000000000000000000");
    const { executor, sent } = stubExecutor();
    const wallet = createMemberSessionWallet({ sessionAccountId: MEMBER, executor });

    await proposeAsSession(wallet, DAO, PLAN, "Fund the meetup");

    expect(executor.connect).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.receiverId).toBe(DAO);
    expect(sent[0]?.signerId).toBe(MEMBER);
    const [action] = sent[0]?.actions ?? [];
    expect(JSON.stringify(action, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).toContain(
      "add_proposal",
    );
    expect(JSON.stringify(action, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).toContain(
      "100000000000000000000000",
    );
  });

  it("reuses an existing connection without another connect ceremony", async () => {
    mockBond("0");
    const { executor, sent } = stubExecutor({ connected: MEMBER });
    const wallet = createMemberSessionWallet({ sessionAccountId: MEMBER, executor });

    await proposeAsSession(wallet, DAO, PLAN, "d");

    expect(executor.connect).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
  });

  it("refuses a passkey wallet that isn't the session-linked account", async () => {
    mockBond("0");
    const { executor, sent } = stubExecutor({ connectsAs: "other.passkey.near" });
    const wallet = createMemberSessionWallet({ sessionAccountId: MEMBER, executor });

    const error = await proposeAsSession(wallet, DAO, PLAN, "d").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MemberSigningError);
    expect((error as MemberSigningError).failure).toBe("mismatch");
    expect((error as MemberSigningError).values).toEqual({
      expected: MEMBER,
      actual: "other.passkey.near",
    });
    expect(executor.disconnect).toHaveBeenCalled();
    expect(wallet.getAccountId()).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("refuses to sign while signed out without opening the wallet", async () => {
    const { executor } = stubExecutor();
    const wallet = createMemberSessionWallet({ sessionAccountId: null, executor });

    await expect(wallet.ensureConnected()).rejects.toMatchObject({ failure: "signedOut" });
    expect(executor.connect).not.toHaveBeenCalled();
  });

  it("treats a wallet that returns no account as an unavailable credential", async () => {
    const { executor } = stubExecutor({ connectsAs: null });
    const wallet = createMemberSessionWallet({ sessionAccountId: MEMBER, executor });

    await expect(wallet.ensureConnected()).rejects.toMatchObject({ failure: "credential" });
  });
});

describe("classifyMemberSigningError", () => {
  const named = (name: string, message = "") => Object.assign(new Error(message), { name });

  it.each([
    ["a WebAuthn NotAllowedError", named("NotAllowedError", "The operation either timed out")],
    ["an AbortError", named("AbortError")],
    ["a user rejection", new Error("User rejected the request")],
    ["the passkey executor closing", new Error("Wallet closed")],
    ["an ACTION_REJECTED code", Object.assign(new Error("x"), { code: "ACTION_REJECTED" })],
  ])("maps %s to cancelled", (_label, error) => {
    expect(classifyMemberSigningError(error)).toBe("cancelled");
  });

  it.each([
    ["an InvalidStateError", named("InvalidStateError")],
    ["a missing WebAuthn API", named("NotSupportedError")],
    ["a missing credential", new Error("No credential found for this account")],
    [
      "the passkey executor's sign-up failure",
      new Error(
        "Something went wrong creating your passkey. Please try again, and make sure your device's screen lock (Face ID, fingerprint, or PIN) is set up.",
      ),
    ],
    [
      "the passkey executor's sign-in failure",
      new Error(
        "Something went wrong signing in with your passkey. Please try again on the device where you created it.",
      ),
    ],
  ])("maps %s to an unavailable credential", (_label, error) => {
    expect(classifyMemberSigningError(error)).toBe("credential");
  });

  it.each([
    ["a near-kit NetworkError", new NetworkError("RPC down", 503, true)],
    ["a failed fetch", new TypeError("Failed to fetch")],
    ["a sender failure", new Error("Sponsor relay returned status 502")],
  ])("maps %s to a network or sender failure", (_label, error) => {
    expect(classifyMemberSigningError(error)).toBe("network");
  });

  it.each([
    ["a FunctionCallError", new FunctionCallError(DAO, "add_proposal", "ERR_MIN_BOND")],
    ["a contract panic", new Error("Smart contract panicked: ERR_PERMISSION_DENIED")],
  ])("maps %s to a contract rejection", (_label, error) => {
    expect(classifyMemberSigningError(error)).toBe("rejected");
  });

  it("keeps unrecognised errors generic", () => {
    expect(classifyMemberSigningError(new Error("something odd"))).toBe("unknown");
    expect(classifyMemberSigningError(undefined)).toBe("unknown");
  });

  it("has a message for every failure", () => {
    for (const failure of [
      "cancelled",
      "credential",
      "network",
      "rejected",
      "mismatch",
      "signedOut",
      "unknown",
    ] as const) {
      expect(MEMBER_SIGNING_MESSAGES[failure]).toMatch(/^memberWallet\.error\./);
    }
  });
});

describe("member signing controller", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("moves through connecting and signing to submitted", async () => {
    const { executor } = stubExecutor();
    const controller = createMemberSigningController<string>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const seen: string[] = [];
    controller.subscribe(() => seen.push(controller.getState().status));

    await controller.submit(async () => "hash");

    expect(seen).toEqual(["connecting", "signing", "submitted"]);
    expect(controller.getState().result).toBe("hash");
  });

  it("does not submit twice while a request is in flight", async () => {
    const { executor } = stubExecutor({ connected: MEMBER });
    const controller = createMemberSigningController<string>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const pending = deferred<string>();
    const task = vi.fn(() => pending.promise);

    const first = controller.submit(task);
    const second = controller.submit(task);
    pending.resolve("hash");

    expect(await first).toBe("hash");
    expect(await second).toBe("hash");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("does not resubmit after success", async () => {
    const { executor } = stubExecutor({ connected: MEMBER });
    const controller = createMemberSigningController<string>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const task = vi.fn(async () => "hash");

    await controller.submit(task);
    await controller.submit(task);

    expect(task).toHaveBeenCalledTimes(1);
  });

  it("records the failure and allows a retry after an error", async () => {
    const { executor } = stubExecutor({ connected: MEMBER });
    const controller = createMemberSigningController<string>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("User rejected the request"))
      .mockResolvedValueOnce("hash");

    await expect(controller.submit(task)).rejects.toThrow();
    expect(controller.getState()).toMatchObject({ status: "error", failure: "cancelled" });

    await expect(controller.submit(task)).resolves.toBe("hash");
    expect(task).toHaveBeenCalledTimes(2);
    expect(controller.getState().status).toBe("submitted");
  });

  it("drops a request that finishes after reset", async () => {
    const { executor } = stubExecutor({ connected: MEMBER });
    const controller = createMemberSigningController<string>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const pending = deferred<string>();
    const first = controller.submit(() => pending.promise);
    await vi.waitFor(() => expect(controller.getState().status).toBe("signing"));

    controller.reset();
    pending.resolve("late");
    await first;

    expect(controller.getState()).toMatchObject({ status: "idle", result: null });
  });
});
