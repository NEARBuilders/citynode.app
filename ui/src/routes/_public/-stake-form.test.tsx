// @vitest-environment jsdom
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StakeForm } from "./-stake-form";

type Props = ComponentProps<typeof StakeForm>;

const validator = {
  id: "pool",
  nodeId: "chicago",
  accountId: "chicago.poolv1.near",
  network: "testnet",
  protocol: "near",
  role: "official",
  isDefault: true,
  metadata: {},
  createdAt: "2026-09-10",
  updatedAt: "2026-09-10",
} as unknown as NonNullable<Props["validator"]>;

function show(props: Partial<Props> = {}) {
  const handlers = { onAmountChange: vi.fn(), onConnect: vi.fn(), onStake: vi.fn() };
  render(
    <StakeForm
      amount="10"
      connectingWallet={false}
      isPending={false}
      nearAccountId="alice.near"
      parsedYocto={10n ** 25n}
      signInRedirect={null}
      validator={validator}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

afterEach(cleanup);

describe("StakeForm", () => {
  it("connects a wallet inline when no NEAR account is linked", () => {
    const { onConnect } = show({ nearAccountId: null });
    expect(screen.queryByTestId("stake.submit")).toBeNull();
    fireEvent.click(screen.getByTestId("stake.connect-wallet"));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it("asks anonymous visitors to sign in before staking", async () => {
    const root = createRootRoute({
      component: () => (
        <StakeForm
          amount="10"
          connectingWallet={false}
          isPending={false}
          nearAccountId={null}
          parsedYocto={10n ** 25n}
          signInRedirect="/stake?node=india"
          validator={validator}
          onAmountChange={vi.fn()}
          onConnect={vi.fn()}
          onStake={vi.fn()}
        />
      ),
    });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/stake?node=india"] }),
    });
    await router.load();
    render(<RouterProvider router={router} />);
    const signIn = await screen.findByRole("link", { name: "Sign in to stake" });
    const destination = new URL(signIn.getAttribute("href") ?? "", "http://localhost");
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("redirect")).toBe("/stake?node=india");
    expect(screen.getByTestId("stake.amount")).toBeTruthy();
    expect(screen.queryByTestId("stake.connect-wallet")).toBeNull();
    expect(screen.queryByTestId("stake.submit")).toBeNull();
  });

  it("stakes the parsed amount to the selected pool on its network", () => {
    const { onStake } = show();
    fireEvent.click(screen.getByRole("button", { name: "Stake 10 NEAR" }));
    expect(onStake).toHaveBeenCalledWith({
      amount: 10n ** 25n,
      network: "testnet",
      poolAccountId: "chicago.poolv1.near",
      protocol: "near",
    });
  });

  it("fills the amount from a quick pick", () => {
    const { onAmountChange } = show();
    fireEvent.click(screen.getByRole("button", { name: "100" }));
    expect(onAmountChange).toHaveBeenCalledWith("100");
  });

  it("blocks staking to pools that cannot receive NEAR or without an amount", () => {
    show({ validator: { ...validator, protocol: "ethereum" } });
    expect(screen.getByTestId("stake.submit")).toHaveProperty("disabled", true);
    cleanup();
    show({ parsedYocto: null });
    expect(screen.getByTestId("stake.submit")).toHaveProperty("disabled", true);
  });
});
