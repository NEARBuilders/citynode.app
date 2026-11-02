import {
  FunctionCallError,
  Near,
  NetworkError,
  TransactionTimeoutError,
  type WalletConnection,
} from "near-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyMemberSigningError,
  createMemberSessionWallet,
  createMemberSigningController,
  MemberSigningError,
  type MemberWalletExecutor,
} from "./member-wallet";
import {
  type DaoPlan,
  proposeAsSession,
  readSpendableYocto,
  submitProposalWithBond,
  voteOnProposal,
} from "./sputnik-proposals";

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

  it("replaces a stale connection to another account instead of reporting a mismatch", async () => {
    const { executor } = stubExecutor({ connected: "previous.passkey.near" });
    const wallet = createMemberSessionWallet({ sessionAccountId: MEMBER, executor });

    await expect(wallet.ensureConnected()).resolves.toBe(true);

    expect(executor.disconnect).toHaveBeenCalledTimes(1);
    expect(executor.connect).toHaveBeenCalledTimes(1);
    expect(wallet.getAccountId()).toBe(MEMBER);
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
      "a passkey missing from the registry",
      new Error("This passkey is not registered in the passkeys registry"),
    ],
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
    ["a Safari fetch failure", new TypeError("Load failed")],
  ])("maps %s to a network or sender failure", (_label, error) => {
    expect(classifyMemberSigningError(error)).toBe("network");
  });

  it.each([
    ["a FunctionCallError", new FunctionCallError(DAO, "add_proposal", "ERR_MIN_BOND")],
    ["a contract panic", new Error("Smart contract panicked: ERR_PERMISSION_DENIED")],
  ])("maps %s to a contract rejection", (_label, error) => {
    expect(classifyMemberSigningError(error)).toBe("rejected");
  });

  it.each([
    ["a near-kit TransactionTimeoutError", new TransactionTimeoutError("tx-hash")],
    ["an RPC timeout", new Error("Transaction timed out waiting for EXECUTED")],
  ])("maps %s to unconfirmed, not a retryable network failure", (_label, error) => {
    expect(classifyMemberSigningError(error)).toBe("unconfirmed");
  });

  it("keeps unrecognised errors generic", () => {
    expect(classifyMemberSigningError(new Error("something odd"))).toBe("unknown");
    expect(classifyMemberSigningError(undefined)).toBe("unknown");
  });

  it("does not report programming errors as network failures", () => {
    expect(
      classifyMemberSigningError(
        new TypeError("Cannot read properties of undefined (reading 'x')"),
      ),
    ).toBe("unknown");
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

  it("does not resubmit after a success that returned nothing", async () => {
    const { executor } = stubExecutor({ connected: MEMBER });
    const controller = createMemberSigningController<void>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const task = vi.fn(async () => {});

    await controller.submit(task);
    await controller.submit(task);

    expect(task).toHaveBeenCalledTimes(1);
  });

  it("keeps blocking new submits after reset until the earlier request settles", async () => {
    const { executor } = stubExecutor({ connected: MEMBER });
    const controller = createMemberSigningController<string>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const pending = deferred<string>();
    const task = vi.fn(() => pending.promise);
    const first = controller.submit(task);
    await vi.waitFor(() => expect(controller.getState().status).toBe("signing"));

    controller.reset();
    const second = controller.submit(task);
    pending.resolve("hash");

    expect(await first).toBe("hash");
    expect(await second).toBe("hash");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("refuses to resubmit after an unconfirmed send until reset", async () => {
    const { executor } = stubExecutor({ connected: MEMBER });
    const controller = createMemberSigningController<string>(
      createMemberSessionWallet({ sessionAccountId: MEMBER, executor }),
    );
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TransactionTimeoutError("tx-hash"))
      .mockResolvedValueOnce("hash");

    await expect(controller.submit(task)).rejects.toBeInstanceOf(TransactionTimeoutError);
    expect(controller.getState()).toMatchObject({ status: "error", failure: "unconfirmed" });

    await expect(controller.submit(task)).rejects.toMatchObject({ failure: "unconfirmed" });
    expect(task).toHaveBeenCalledTimes(1);

    controller.reset();
    await expect(controller.submit(task)).resolves.toBe("hash");
    expect(task).toHaveBeenCalledTimes(2);
  });
});

const serialize = (value: unknown) =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

describe("member proposals and votes", () => {
  it("files a poll with exactly the bond the member was shown, never re-reading it", async () => {
    const view = mockBond("999");
    const { executor, sent } = stubExecutor();
    const wallet = createMemberSessionWallet({ sessionAccountId: MEMBER, executor });

    await submitProposalWithBond(
      wallet,
      DAO,
      { kind: "vote" },
      "* Title: Picnic?",
      5n * 10n ** 23n,
    );

    expect(view).not.toHaveBeenCalled();
    expect(sent[0]?.signerId).toBe(MEMBER);
    expect(sent[0]?.receiverId).toBe(DAO);
    const action = serialize(sent[0]?.actions[0]);
    expect(action).toContain("add_proposal");
    expect(action).toContain("500000000000000000000000");
  });

  it("votes with the proposal's kind as read", async () => {
    const { executor, sent } = stubExecutor();
    const wallet = createMemberSessionWallet({ sessionAccountId: MEMBER, executor });

    await voteOnProposal(wallet, DAO, { id: 9, kind: "Vote" as never }, "VoteReject");

    expect(sent[0]?.receiverId).toBe(DAO);
    const action = serialize(sent[0]?.actions[0]);
    expect(action).toContain("act_proposal");
    const args = (sent[0]?.actions[0] as { functionCall?: { args?: Uint8Array } }).functionCall
      ?.args;
    expect(JSON.parse(new TextDecoder().decode(args))).toEqual({
      id: 9,
      action: "VoteReject",
      proposal: "Vote",
    });
  });
});

describe("readSpendableYocto", () => {
  function mockAccount(view: unknown) {
    return vi.spyOn(Near.prototype, "rpc", "get").mockReturnValue({
      getAccount: async () => {
        if (view instanceof Error) throw view;
        return view;
      },
    } as never);
  }

  it("subtracts what storage holds back", async () => {
    mockAccount({ amount: (10n ** 24n).toString(), locked: "0", storage_usage: 1000 });
    expect(await readSpendableYocto(MEMBER)).toBe(10n ** 24n - 1000n * 10n ** 19n);
  });

  it("reads an account that doesn't exist yet as empty", async () => {
    const { AccountDoesNotExistError } = await import("near-kit");
    mockAccount(new AccountDoesNotExistError(MEMBER));
    expect(await readSpendableYocto(MEMBER)).toBe(0n);
  });

  it("throws on other RPC failures", async () => {
    mockAccount(new NetworkError("down"));
    await expect(readSpendableYocto(MEMBER)).rejects.toThrow();
  });
});
