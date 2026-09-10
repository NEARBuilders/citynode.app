// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RelayHistoryResponseT } from "better-near-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RelayerHistory } from "./-relayer-history";
import { RelayerStatusBody } from "./-relayer-status-body";
import { RelayerTopUp } from "./-relayer-top-up";

afterEach(cleanup);

describe("relayer UI seams", () => {
  it("asks for a wallet before funding and forwards a valid funding action", () => {
    const onConnect = vi.fn();
    const onFund = vi.fn();
    const { rerender } = render(
      <RelayerTopUp
        nearAccountId={null}
        amount="5"
        sending={false}
        parsedAmount={5}
        onAmountChange={vi.fn()}
        onPreset={vi.fn()}
        onConnect={onConnect}
        onFund={onFund}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "connect wallet" }));
    expect(onConnect).toHaveBeenCalledOnce();

    rerender(
      <RelayerTopUp
        nearAccountId="wallet.near"
        amount="5"
        sending={false}
        parsedAmount={5}
        onAmountChange={vi.fn()}
        onPreset={vi.fn()}
        onConnect={onConnect}
        onFund={onFund}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "fund relayer" }));
    expect(onFund).toHaveBeenCalledOnce();
  });

  it("keeps funding disabled for a rejected or invalid amount", () => {
    const onFund = vi.fn();
    render(
      <RelayerTopUp
        nearAccountId="wallet.near"
        amount="bad"
        sending={false}
        parsedAmount={null}
        onAmountChange={vi.fn()}
        onPreset={vi.fn()}
        onConnect={vi.fn()}
        onFund={onFund}
      />,
    );

    const fundButton = screen.getByRole("button", { name: "fund relayer" });
    expect(fundButton).toHaveProperty("disabled", true);
    expect(onFund).not.toHaveBeenCalled();
  });

  it("renders relay history statuses and reports missing relays", () => {
    const history: RelayHistoryResponseT = {
      transactions: [
        {
          id: "tx-1",
          userId: "user-1",
          txHash: "abcdef1234567890",
          senderId: "sender.near",
          receiverId: "receiver.near",
          network: "mainnet",
          status: "failed",
          createdAt: "2026-09-10T00:00:00.000Z",
        },
      ],
    };

    render(<RelayerHistory history={history} isLoading={false} />);
    expect(screen.getByText("abcdef123456…")).toBeTruthy();
    expect(screen.getByText("failed")).toBeTruthy();

    render(<RelayerStatusBody info={null} isLoading={false} />);
    expect(screen.getByText(/No relayer configured/)).toBeTruthy();
  });
});
