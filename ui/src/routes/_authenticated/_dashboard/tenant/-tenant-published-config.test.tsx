import { render } from "@/i18n/test-render";
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { Near } from "near-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantPublishedConfig } from "./-tenant-published-config";
import type { TenantRecord } from "./-tenant-types";

const harness = vi.hoisted(() => ({
  nearAccount: null as string | null,
  authNear: { ensureConnected: vi.fn(), getAccountId: vi.fn(), getNearClient: vi.fn() },
  connection: { status: "idle", daoAccountId: null as string | null },
  hash: "",
  getRegistryApp: vi.fn(),
  updateTenant: vi.fn(),
  activeNetwork: "mainnet",
  proposeTenantConfigAsMember: vi.fn(),
  publishTenantConfigForMode: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock("@/app", async () => {
  const actual = await vi.importActual<typeof import("@/app")>("@/app");
  return {
    ...actual,
    useApiClient: () => ({
      registry: { getRegistryApp: harness.getRegistryApp },
      updateTenant: harness.updateTenant,
    }),
    useAuthClient: () => ({
      near: harness.authNear,
      useActiveNetwork: () => harness.activeNetwork,
    }),
  };
});

vi.mock("@/lib/use-near-account", () => ({ useNearAccount: () => harness.nearAccount }));

vi.mock("@/lib/dao-connect", async () => ({
  ...(await vi.importActual<object>("@/lib/dao-connect")),
  useDaoConnection: () => harness.connection,
}));

vi.mock("@/lib/tenant-deploy", () => ({
  proposeTenantConfigAsMember: (...args: unknown[]) => harness.proposeTenantConfigAsMember(...args),
  publishTenantConfigForMode: (...args: unknown[]) => harness.publishTenantConfigForMode(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => harness.toastError(...args),
    success: (...args: unknown[]) => harness.toastSuccess(...args),
    info: (...args: unknown[]) => harness.toastInfo(...args),
  },
}));

vi.mock("@tanstack/react-router", async () => ({
  ...(await vi.importActual<object>("@tanstack/react-router")),
  useLocation: ({ select }: { select: (location: { hash: string }) => string }) =>
    select({ hash: harness.hash }),
}));

const DAO = "chicago.sputnik-dao.near";

function policy(members: string[], permissions = ["*:AddProposal", "*:VoteApprove"]) {
  return {
    roles: [{ name: "council", kind: { Group: members }, permissions, vote_policy: {} }],
    default_vote_policy: { threshold: [1, 2] },
  };
}

const pendingProposal = {
  id: 7,
  proposer: "alice.near",
  description: "Set homepage",
  kind: {
    FunctionCall: {
      receiver_id: "dev.everything.near",
      actions: [{ method_name: "__fastdata_kv", args: "e30=", deposit: "0", gas: "1" }],
    },
  },
  status: "InProgress",
  vote_counts: { council: ["1", "0", "0"] },
  votes: {},
  submission_time: "0",
};

function mockChain(options: { policy: unknown; proposals?: unknown[] }) {
  vi.spyOn(Near.prototype, "view").mockImplementation((async (
    _contract: string,
    method: string,
  ) => {
    if (method === "get_policy") return options.policy;
    if (method === "get_last_proposal_id") return options.proposals?.length ? 7 : 0;
    if (method === "get_proposals") return options.proposals ?? [];
    return null;
  }) as never);
}

function tenantRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant-1",
    name: "Chicago Node",
    accountId: DAO,
    ownerKind: "dao",
    orgId: "org-1",
    status: "active",
    allowUiOverrides: true,
    allowSsr: false,
    ...overrides,
  } as unknown as TenantRecord;
}

function renderSection(
  options: {
    tenant?: Record<string, unknown>;
    activation?: { isPending: boolean; onActivate: () => void } | null;
  } = {},
) {
  harness.getRegistryApp.mockResolvedValue({
    data: { resolvedConfig: { title: "Chicago Node", description: "Chicago builders" } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <TenantPublishedConfig
        tenant={tenantRecord(options.tenant)}
        hostname="chicago.citynode.app"
        gatewayId="citynode.app"
        baseAccount="v1.citynode.near"
        activation={options.activation ?? null}
      />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

async function editTitle(value: string) {
  const title = (await screen.findByTestId("tenant-published-config-title")) as HTMLInputElement;
  await waitFor(() => expect(title.value).toBe("Chicago Node"));
  fireEvent.change(title, { target: { value } });
}

function proposeButton() {
  return screen.getByTestId("tenant-published-config-propose") as HTMLButtonElement;
}

async function expectBlocked(reason: string) {
  await waitFor(() =>
    expect(screen.getByTestId("tenant-published-config-block-reason").textContent).toBe(reason),
  );
  expect(proposeButton().disabled).toBe(true);
}

beforeEach(() => {
  harness.nearAccount = "alice.near";
  harness.activeNetwork = "mainnet";
  harness.connection = { status: "idle", daoAccountId: null };
  harness.hash = "";
  harness.updateTenant.mockResolvedValue({});
  harness.proposeTenantConfigAsMember.mockResolvedValue({});
  harness.publishTenantConfigForMode.mockResolvedValue({});
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("TenantPublishedConfig", () => {
  it("proposes from the member's own wallet when no DAO is connected", async () => {
    mockChain({ policy: policy(["alice.near"]) });
    renderSection();

    await editTitle("Chicago Builders");
    await waitFor(() => expect(proposeButton().disabled).toBe(false));
    fireEvent.click(proposeButton());

    await waitFor(() => expect(harness.proposeTenantConfigAsMember).toHaveBeenCalledTimes(1));
    expect(harness.proposeTenantConfigAsMember).toHaveBeenCalledWith(
      expect.anything(),
      harness.authNear,
      {
        daoAccountId: DAO,
        gatewayId: "citynode.app",
        baseAccount: "v1.citynode.near",
        hostname: "chicago.citynode.app",
        title: "Chicago Builders",
        description: "Chicago builders",
      },
    );
    expect(harness.publishTenantConfigForMode).not.toHaveBeenCalled();
    expect(harness.updateTenant).not.toHaveBeenCalled();
  });

  it("proposes through the connected Trezu DAO and renames the community", async () => {
    harness.nearAccount = null;
    harness.connection = { status: "connected", daoAccountId: DAO };
    mockChain({ policy: policy(["alice.near"]) });
    renderSection();

    await editTitle("Chicago Builders");
    await waitFor(() => expect(proposeButton().disabled).toBe(false));
    fireEvent.click(proposeButton());

    await waitFor(() => expect(harness.publishTenantConfigForMode).toHaveBeenCalledTimes(1));
    expect(harness.publishTenantConfigForMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ accountId: DAO, title: "Chicago Builders", mode: "dao" }),
    );
    expect(harness.updateTenant).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      name: "Chicago Builders",
    });
    expect(harness.proposeTenantConfigAsMember).not.toHaveBeenCalled();
  });

  it("publishes directly when the platform owns the community", async () => {
    harness.nearAccount = "chicago.near";
    mockChain({ policy: null });
    renderSection({ tenant: { ownerKind: "platform", accountId: "chicago.near" } });

    await editTitle("Chicago Builders");
    expect(proposeButton().textContent).toContain("Publish changes");
    await waitFor(() => expect(proposeButton().disabled).toBe(false));
    fireEvent.click(proposeButton());

    await waitFor(() => expect(harness.publishTenantConfigForMode).toHaveBeenCalledTimes(1));
    expect(harness.publishTenantConfigForMode).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        accountId: "chicago.near",
        gatewayId: "citynode.app",
        baseAccount: "v1.citynode.near",
        hostname: "chicago.citynode.app",
        title: "Chicago Builders",
        description: "Chicago builders",
        mode: "platform",
      },
    );
    expect(harness.updateTenant).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      name: "Chicago Builders",
    });
  });

  it("refills the form when the published config arrives after a failed first read", async () => {
    mockChain({ policy: policy(["alice.near"]) });
    harness.getRegistryApp.mockRejectedValueOnce(new Error("api warming up"));
    const { client } = renderSection();

    const description = (await screen.findByTestId(
      "tenant-published-config-description",
    )) as HTMLInputElement;
    await waitFor(() => expect(harness.getRegistryApp).toHaveBeenCalled());
    expect(description.value).not.toBe("Chicago builders");

    await client.invalidateQueries({ queryKey: ["node-config", "registry-app"] });

    await waitFor(() => expect(description.value).toBe("Chicago builders"));
  });

  it("keeps the owner's edits when the published config refreshes", async () => {
    mockChain({ policy: policy(["alice.near"]) });
    const { client } = renderSection();

    await editTitle("Chicago Builders");
    const calls = harness.getRegistryApp.mock.calls.length;
    await client.invalidateQueries({ queryKey: ["node-config", "registry-app"] });
    await waitFor(() => expect(harness.getRegistryApp.mock.calls.length).toBeGreaterThan(calls));

    expect((screen.getByTestId("tenant-published-config-title") as HTMLInputElement).value).toBe(
      "Chicago Builders",
    );
  });

  it("offers to make the community's organization active before publishing", async () => {
    const onActivate = vi.fn();
    mockChain({ policy: policy(["alice.near"]) });
    renderSection({ activation: { isPending: false, onActivate } });

    await expectBlocked("Make this community's organization active to publish changes.");
    expect((screen.getByTestId("tenant-published-config-title") as HTMLInputElement).disabled).toBe(
      false,
    );
    const activate = screen.getByTestId("tenant-published-config-activate") as HTMLButtonElement;
    expect(activate.textContent).toContain("Make active");
    fireEvent.click(activate);
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("shows no activation button once the organization is active", async () => {
    mockChain({ policy: policy(["alice.near"]) });
    renderSection();

    await screen.findByTestId("tenant-published-config-title");
    expect(screen.queryByTestId("tenant-published-config-activate")).toBeNull();
  });

  it.each([
    {
      name: "a suspended community",
      options: { tenant: { status: "suspended" } },
      account: "alice.near",
      network: "mainnet",
      members: ["alice.near"],
      reason: "This community is Suspended.",
    },
    {
      name: "no wallet and no DAO connection",
      options: {},
      account: null,
      network: "mainnet",
      members: ["alice.near"],
      reason: "Connect chicago.sputnik-dao.near via Trezu to propose.",
    },
    {
      name: "a wallet on testnet",
      options: {},
      account: "alice.near",
      network: "testnet",
      members: ["alice.near"],
      reason: "Switch your NEAR wallet to mainnet to propose.",
    },
    {
      name: "a wallet without AddProposal",
      options: {},
      account: "bob.near",
      network: "mainnet",
      members: ["alice.near"],
      reason: "bob.near has no AddProposal permission on chicago.sputnik-dao.near.",
    },
  ])("blocks proposing for $name", async ({ options, account, network, members, reason }) => {
    harness.nearAccount = account;
    harness.activeNetwork = network;
    mockChain({ policy: policy(members) });
    renderSection(options);

    await expectBlocked(reason);
  });

  it("asks platform-owned communities to connect the community wallet", async () => {
    harness.nearAccount = "alice.near";
    mockChain({ policy: null });
    renderSection({ tenant: { ownerKind: "platform", accountId: "chicago.near" } });

    await expectBlocked("Connect your NEAR wallet to publish.");
  });

  it("shows the pending proposal with its vote progress and a Trezu link", async () => {
    mockChain({ policy: policy(["alice.near", "bob.near"]), proposals: [pendingProposal] });
    renderSection();

    await waitFor(() =>
      expect(screen.getByTestId("tenant-published-config-pending").textContent).toBe(
        "Awaiting votes · #7",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("tenant-published-config-threshold").textContent).toBe(
        "1/2 approvals",
      ),
    );
    expect(screen.getByTestId("tenant-published-config-trezu-link").getAttribute("href")).toBe(
      "https://trezu.app/chicago.sputnik-dao.near",
    );
  });

  it("scrolls into view when a link targets the published config", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    harness.hash = "published-config";
    mockChain({ policy: policy(["alice.near"]) });
    renderSection();

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(document.getElementById("published-config")).not.toBeNull();
  });
});
