// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppI18nProvider } from "@/i18n/runtime";
import { ConnectDao } from "./connect-dao";

const harness = vi.hoisted(() => ({
  connection: { status: "connected", daoAccountId: "indonesia.sputnik-dao.near" },
  nearAccountId: "work.efiz.near" as string | null,
  fetchDaoPolicy: vi.fn(),
  fetchDaoMembership: vi.fn(),
}));

vi.mock("@/lib/dao-connect", () => ({
  connectDaoAccount: vi.fn(),
  disconnectDaoAccount: vi.fn(),
  fetchDaoPolicy: harness.fetchDaoPolicy,
  fetchDaoMembership: harness.fetchDaoMembership,
  useDaoAutoRestore: vi.fn(),
  useDaoConnection: () => harness.connection,
}));

vi.mock("@/lib/use-near-account", () => ({
  useNearAccount: () => harness.nearAccountId,
}));

function renderConnectDao(purpose: "apply" | "proposal-review", expectedDaoAccountId?: string) {
  const onVerified = vi.fn();
  render(
    <AppI18nProvider initialLocale="en" preferredLocale="en">
      <ConnectDao
        purpose={purpose}
        expectedDaoAccountId={expectedDaoAccountId}
        onVerified={onVerified}
      />
    </AppI18nProvider>,
  );
  return onVerified;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.connection = { status: "connected", daoAccountId: "indonesia.sputnik-dao.near" };
  harness.nearAccountId = "work.efiz.near";
});

afterEach(cleanup);

describe("DAO verification by purpose", () => {
  it("verifies the proposed DAO for admin review without checking the admin's membership", async () => {
    harness.fetchDaoPolicy.mockResolvedValue({ roles: [{ kind: { Group: ["efiz.near"] } }] });
    const onVerified = renderConnectDao("proposal-review", "indonesia.sputnik-dao.near");

    expect(await screen.findByText("Sputnik DAO verified")).toBeTruthy();
    expect(onVerified).toHaveBeenCalledWith({ daoAccountId: "indonesia.sputnik-dao.near" });
    expect(harness.fetchDaoMembership).not.toHaveBeenCalled();
    expect(screen.queryByText(/work\.efiz\.near isn't a member/)).toBeNull();
  });

  it("does not verify a different connected DAO", async () => {
    harness.connection = { status: "connected", daoAccountId: "other.sputnik-dao.near" };
    const onVerified = renderConnectDao("proposal-review", "indonesia.sputnik-dao.near");

    expect(
      await screen.findByText("Connect indonesia.sputnik-dao.near to review this application."),
    ).toBeTruthy();
    expect(onVerified).not.toHaveBeenCalled();
    expect(harness.fetchDaoPolicy).not.toHaveBeenCalled();
  });

  it("rejects a connected account that is not a Sputnik DAO", async () => {
    harness.fetchDaoPolicy.mockResolvedValue(null);
    const onVerified = renderConnectDao("proposal-review", "indonesia.sputnik-dao.near");

    expect(await screen.findByText("This account isn't a Sputnik DAO")).toBeTruthy();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("still requires membership when an applicant connects the DAO", async () => {
    harness.fetchDaoMembership.mockResolvedValue({
      isSputnikContract: true,
      isMember: false,
      policy: { roles: [{ kind: { Group: ["efiz.near"] } }] },
    });
    const onVerified = renderConnectDao("apply");

    await waitFor(() => {
      expect(screen.getByText("work.efiz.near isn't a member of this DAO")).toBeTruthy();
    });
    expect(onVerified).not.toHaveBeenCalled();
    expect(harness.fetchDaoPolicy).not.toHaveBeenCalled();
  });
});
