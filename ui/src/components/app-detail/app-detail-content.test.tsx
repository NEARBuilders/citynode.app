// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDetailContent } from "./app-detail-content";

const wallet = vi.hoisted(() => ({
  prepare: vi.fn(),
  sign: vi.fn(),
  relay: vi.fn(),
  sendWithGasKey: vi.fn(),
  refreshGasKeyInfo: vi.fn(),
  ensureGasKeyFunded: vi.fn(),
  getGasKeyState: vi.fn(() => null),
  success: vi.fn(),
  error: vi.fn(),
}));

const atoms = vi.hoisted(() => {
  function makeAtom(initial: unknown) {
    let value = initial;
    return {
      get: () => value,
      set: (next: unknown) => {
        value = next;
      },
      subscribe: () => () => {},
    };
  }
  return {
    nearState: makeAtom(null),
    walletConnected: makeAtom(false),
    activeNetwork: makeAtom("mainnet"),
    gasKeyState: makeAtom(null),
  };
});

vi.mock("@/app", () => ({
  useApiClient: () => ({ apps: { prepareRegistryMetadataWrite: wallet.prepare } }),
  useAuthClient: () => ({
    near: {
      buildSignedDelegateAction: wallet.sign,
      relayTransaction: wallet.relay,
      sendWithGasKey: wallet.sendWithGasKey,
      refreshGasKeyInfo: wallet.refreshGasKeyInfo,
      ensureGasKeyFunded: wallet.ensureGasKeyFunded,
      getGasKeyState: wallet.getGasKeyState,
    },
    $store: { atoms },
  }),
  sessionQueryOptions: () => ({
    queryKey: ["session"],
    queryFn: async () => ({ user: { id: "user-1" } }),
  }),
}));
vi.mock("@/lib/use-near-account", () => ({ useNearAccount: () => "owner.near" }));
vi.mock("sonner", () => ({ toast: { success: wallet.success, error: wallet.error } }));

const app: ComponentProps<typeof AppDetailContent>["app"] = {
  accountId: "example.near",
  gatewayId: "example.test",
  canonicalKey: "config",
  canonicalConfigUrl: "",
  startCommand: "",
  domain: "example.test",
  openUrl: "https://example.test",
  hostUrl: null,
  uiUrl: null,
  uiSsrUrl: null,
  apiUrl: null,
  extends: "bos://dev.everything.near/everything.dev",
  parent: null,
  root: null,
  depth: 0,
  status: "ready",
  metadata: null,
  metadataKey: "metadata",
  metadataContractId: "registry.near",
  metadataFastKvUrl: "",
  extendsChain: [],
  resolvedConfig: {},
};
const status = {
  discoveredApps: 1,
  metadataContractId: "registry.near",
  metadataFastKvUrl: "",
  relayEnabled: true,
  relayAccountId: "relayer.near",
  timestamp: "2026-09-10",
};
const cacheKeys = [
  ["app", app.accountId, app.gatewayId],
  ["apps-account", app.accountId],
  ["apps"],
];
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  atoms.gasKeyState.set(null);
  atoms.nearState.set(null);
  wallet.prepare.mockResolvedValue({
    data: { contractId: "registry.near", methodName: "set", args: { data: "metadata" } },
  });
  wallet.sign.mockResolvedValue("signed-payload");
  wallet.relay.mockResolvedValue({ data: { txHash: "confirmed-hash" }, error: null });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

async function showApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(["session"], { user: { id: "user-1" } });
  for (const key of cacheKeys) client.setQueryData(key, { title: "Old title" });
  client.setQueryData(["fastkv-config", "unrelated"], { untouched: true });
  render(
    <QueryClientProvider client={client}>
      <AppDetailContent
        accountId={app.accountId}
        gatewayId={app.gatewayId}
        app={app}
        statusQuery={{ data: status }}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Publish now" });
  return client;
}

describe("registry app metadata", () => {
  it("prepares, signs, and relays metadata in order before refreshing app caches", async () => {
    const client = await showApp();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: " New title " } });
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    await waitFor(() =>
      expect(wallet.success).toHaveBeenCalledWith("Metadata submitted", {
        description: "tx: confirmed-hash",
      }),
    );
    expect(wallet.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: app.accountId,
        gatewayId: app.gatewayId,
        claimedBy: "owner.near",
        title: "New title",
      }),
    );
    expect(wallet.sign).toHaveBeenCalledWith("registry.near", expect.any(Function));
    expect(wallet.relay).toHaveBeenCalledWith({ payload: "signed-payload" });
    expect(wallet.prepare.mock.invocationCallOrder[0]).toBeLessThan(
      wallet.sign.mock.invocationCallOrder[0],
    );
    expect(wallet.sign.mock.invocationCallOrder[0]).toBeLessThan(
      wallet.relay.mock.invocationCallOrder[0],
    );
    for (const key of cacheKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(["fastkv-config", "unrelated"])?.isInvalidated).toBe(false);
  });

  it("keeps signing separate from submitting and only refreshes after relay", async () => {
    const client = await showApp();
    fireEvent.click(screen.getByRole("button", { name: "Sign delegate" }));
    expect(await screen.findByText("signed-payload")).toBeTruthy();
    expect(wallet.relay).not.toHaveBeenCalled();
    for (const key of cacheKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Relay payload" }));
    await waitFor(() =>
      expect(wallet.success).toHaveBeenCalledWith("Relayed", { description: "tx: confirmed-hash" }),
    );
    for (const key of cacheKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("does not sign or relay after preparation fails", async () => {
    const client = await showApp();
    wallet.prepare.mockRejectedValueOnce(new Error("Preparation unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(wallet.error).toHaveBeenCalledWith("Preparation unavailable"));
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(wallet.relay).not.toHaveBeenCalled();
    for (const key of cacheKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it("reports rejected relay submission without refreshing unchanged caches", async () => {
    const client = await showApp();
    wallet.relay.mockResolvedValueOnce({ error: { message: "Relay rejected" } });
    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(wallet.error).toHaveBeenCalledWith("Relay rejected"));
    for (const key of cacheKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  });
});
