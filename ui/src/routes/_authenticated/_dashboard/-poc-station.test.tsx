// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StationPanel } from "./-poc-station";
import type { StationState } from "./-poc-stations";

afterEach(cleanup);

function station(overrides: Partial<StationState> = {}, signer: "session" | "team" = "team") {
  return {
    def: {
      id: "stake",
      index: 5,
      phase: "bootstrap",
      title: "Stake the pool",
      signer,
      purpose: "The team stakes its own pool.",
      steps: [],
    },
    status: "ready",
    steps: [{ id: "stake", label: "Stake 1 NEAR", status: "pending", pendingProposal: null }],
    blockedReason: null,
    skipReason: null,
    blockedBy: null,
    signerAccountId: "team.sputnik-dao.near",
    signerConnected: true,
    canRun: true,
    runBlockReason: null,
    ...overrides,
  } as StationState;
}

function panel(
  value: StationState,
  lens: "you" | "team" = "team",
  next: StationState | null = null,
) {
  const handlers = {
    onRun: vi.fn(),
    onConnect: vi.fn(),
    onApprove: vi.fn(),
    onLens: vi.fn(),
    onNext: vi.fn(),
  };
  render(
    <StationPanel
      station={value}
      lens={lens}
      busy={false}
      policy={undefined}
      next={next}
      {...handlers}
    />,
  );
  return handlers;
}

describe("StationPanel primary action", () => {
  it("runs a ready station for the matching lens", () => {
    const handlers = panel(station());
    fireEvent.click(screen.getByTestId("poc-run-stake"));
    expect(handlers.onRun).toHaveBeenCalledOnce();
  });

  it("explains why a station cannot run", () => {
    panel(station({ canRun: false, runBlockReason: "awaiting votes" }));
    expect(screen.getByTestId("poc-run-stake").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("poc-reason-stake").textContent).toBe("awaiting votes");
  });

  it("asks to connect the signer before running", () => {
    const handlers = panel(station({ signerConnected: false }));
    expect(screen.queryByTestId("poc-run-stake")).toBeNull();
    fireEvent.click(screen.getByTestId("poc-connect-signer"));
    expect(handlers.onConnect).toHaveBeenCalledOnce();
  });

  it("offers to switch lens when another role signs", () => {
    const handlers = panel(station(), "you");
    expect(screen.queryByTestId("poc-run-stake")).toBeNull();
    fireEvent.click(screen.getByTestId("poc-switch-lens"));
    expect(handlers.onLens).toHaveBeenCalledWith("team");
  });

  it("moves on to the next station once done", () => {
    const next = station({ def: { ...station().def, id: "vote", title: "Vote" } });
    const handlers = panel(station({ status: "done" }), "team", next);
    fireEvent.click(screen.getByTestId("poc-next-station"));
    expect(handlers.onNext).toHaveBeenCalledWith(next);
  });
});
