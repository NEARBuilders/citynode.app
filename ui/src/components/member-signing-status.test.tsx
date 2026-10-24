// @vitest-environment jsdom

import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import type { WalletConnection } from "near-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import type { MemberSigningState, MemberWalletExecutor } from "@/lib/member-wallet";
import { useMemberSigning } from "@/lib/use-member-signing";
import { MemberSigningStatus } from "./member-signing-status";

vi.mock("@/app", () => ({ getCspNonce: () => undefined }));

afterEach(cleanup);

const MEMBER = "a1b2c3.passkey.near";

function stubExecutor(connectsAs: string = MEMBER) {
  let connected: string | null = null;
  return {
    connect: vi.fn(async () => {
      connected = connectsAs;
      return connected;
    }),
    getConnectedAccountId: vi.fn(async () => connected),
    getWallet: vi.fn(() => ({}) as WalletConnection),
    disconnect: vi.fn(async () => {
      connected = null;
    }),
  } satisfies MemberWalletExecutor;
}

function stateOf(partial: Partial<MemberSigningState>): MemberSigningState {
  return { status: "idle", failure: null, result: null, ...partial };
}

describe("MemberSigningStatus", () => {
  it("renders nothing while idle", () => {
    const { container } = render(<MemberSigningStatus state={stateOf({})} />);
    expect(container.textContent).toBe("");
  });

  it("shows connecting, signing and submitted", () => {
    const view = render(<MemberSigningStatus state={stateOf({ status: "connecting" })} />);
    expect(screen.getByText("Opening your passkey wallet…")).toBeTruthy();

    view.rerender(<MemberSigningStatus state={stateOf({ status: "signing" })} />);
    expect(screen.getByText("Confirm with your passkey to sign.")).toBeTruthy();

    view.rerender(<MemberSigningStatus state={stateOf({ status: "submitted" })} />);
    expect(screen.getByRole("status").textContent).toBe("Signed and submitted.");
  });

  it.each([
    ["cancelled", "You didn't sign. Nothing was submitted.", true],
    ["credential", "Your passkey isn't available on this device.", true],
    ["network", "Couldn't reach the network to submit.", true],
    ["rejected", "The DAO contract rejected this request.", false],
    ["signedOut", "Sign in again to sign with your passkey wallet.", false],
  ] as const)("explains a %s failure", (failure, text, retry) => {
    const onRetry = vi.fn();
    render(<MemberSigningStatus state={stateOf({ status: "error", failure })} onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain(text);
    expect(screen.queryByRole("button", { name: "Try again" }) !== null).toBe(retry);
  });

  it("names both accounts on a mismatch without a raw error", () => {
    render(
      <MemberSigningStatus
        state={stateOf({
          status: "error",
          failure: "mismatch",
          failureValues: { expected: MEMBER, actual: "other.passkey.near" },
        })}
      />,
    );
    const text = screen.getByRole("alert").textContent ?? "";
    expect(text).toContain("other.passkey.near");
    expect(text).toContain(MEMBER);
    expect(text).not.toContain("Member signing failed");
  });
});

function Harness({
  sessionAccountId,
  executor,
  task,
}: {
  sessionAccountId: string | null;
  executor: MemberWalletExecutor;
  task: () => Promise<string>;
}) {
  const signing = useMemberSigning<string>(sessionAccountId, executor);
  const submit = () => {
    void signing.submit(task).catch(() => {});
  };
  return (
    <div>
      <button type="button" onClick={submit}>
        Submit
      </button>
      <MemberSigningStatus state={signing.state} onRetry={submit} />
    </div>
  );
}

describe("useMemberSigning", () => {
  it("retries after a cancelled signature and then shows submitted", async () => {
    const executor = stubExecutor();
    const task = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("x"), { name: "NotAllowedError" }))
      .mockResolvedValueOnce("hash");
    render(<Harness sessionAccountId={MEMBER} executor={executor} task={task} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("You didn't sign. Nothing was submitted.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Signed and submitted.")).toBeTruthy();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("ignores a double click while signing", async () => {
    const executor = stubExecutor();
    let finish!: (value: string) => void;
    const task = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)));
    render(<Harness sessionAccountId={MEMBER} executor={executor} task={task} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByText(/Confirm with your passkey/);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await act(async () => finish("hash"));

    expect(await screen.findByText("Signed and submitted.")).toBeTruthy();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("shows a mismatch when the passkey wallet isn't the signed-in account", async () => {
    const executor = stubExecutor("other.passkey.near");
    const task = vi.fn(async () => "hash");
    render(<Harness sessionAccountId={MEMBER} executor={executor} task={task} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText(/but you're signed in as/)).toBeTruthy();
    expect(task).not.toHaveBeenCalled();
  });

  it("disconnects and resets when the user switches or signs out", async () => {
    const executor = stubExecutor();
    const task = vi.fn(async () => "hash");
    const view = render(<Harness sessionAccountId={MEMBER} executor={executor} task={task} />);

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Signed and submitted.")).toBeTruthy();

    view.rerender(<Harness sessionAccountId={null} executor={executor} task={task} />);

    expect(screen.queryByText("Signed and submitted.")).toBeNull();
    expect(executor.disconnect).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText("Sign in again to sign with your passkey wallet.")).toBeTruthy();
    expect(task).toHaveBeenCalledTimes(1);
  });
});
