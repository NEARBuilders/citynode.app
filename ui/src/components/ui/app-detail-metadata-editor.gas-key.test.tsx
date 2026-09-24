// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDetailMetadataEditor } from "./app-detail-metadata-editor";
import type { RegistryStatus } from "./app-detail-types";

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

const app = {
  accountId: "example.near",
  gatewayId: "example.test",
  metadata: null,
  metadataContractId: "registry.near",
} as unknown as ComponentProps<typeof AppDetailMetadataEditor>["app"];

const status = { relayEnabled: true } as unknown as RegistryStatus;

const preparedWrite = {
  data: {
    contractId: "registry.near",
    methodName: "__fastdata_kv",
    args: { data: "metadata" },
    gas: "10000000000000",
    attachedDeposit: "0",
  },
};

const clients: QueryClient[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  atoms.gasKeyState.set(null);
  atoms.nearState.set(null);
  wallet.getGasKeyState.mockReturnValue(null);
  wallet.refreshGasKeyInfo.mockResolvedValue(null);
  wallet.ensureGasKeyFunded.mockResolvedValue(false);
  wallet.prepare.mockResolvedValue(preparedWrite);
  wallet.sign.mockResolvedValue("signed-payload");
  wallet.relay.mockResolvedValue({ data: { txHash: "confirmed-hash" }, error: null });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  clients.push(client);
  client.setQueryData(["session"], { user: { id: "user-1" } });
  render(
    <QueryClientProvider client={client}>
      <AppDetailMetadataEditor
        accountId={app.accountId}
        gatewayId={app.gatewayId}
        app={app}
        statusQuery={{ data: status }}
      />
    </QueryClientProvider>,
  );
}

describe("app detail metadata editor with a session gas key", () => {
  it("publishes via the gas key when one is bootstrapped and funded", async () => {
    atoms.gasKeyState.set({
      accountId: "owner.near",
      publicKey: "ed25519:gaskey",
      networkId: "mainnet",
      balance: "50000000000000000000000",
      numNonces: 4,
    });
    wallet.sendWithGasKey.mockResolvedValue({ txHash: "gas-key-tx" });
    renderEditor();
    await screen.findByTestId("metadata-gas-key-balance");

    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    await waitFor(() =>
      expect(wallet.sendWithGasKey).toHaveBeenCalledWith({
        receiverId: "registry.near",
        methodName: "__fastdata_kv",
        args: { data: "metadata" },
        gas: "10000000000000",
      }),
    );
    expect(wallet.sign).not.toHaveBeenCalled();
    expect(wallet.relay).not.toHaveBeenCalled();
    await waitFor(() => expect(wallet.refreshGasKeyInfo).toHaveBeenCalled());
    await waitFor(() =>
      expect(wallet.success).toHaveBeenCalledWith("Metadata submitted", {
        description: "tx: gas-key-tx (session gas key)",
      }),
    );
  });

  it("falls back to delegate + relay when no funded key exists", async () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Publish now" }));

    await waitFor(() =>
      expect(wallet.success).toHaveBeenCalledWith("Metadata submitted", {
        description: "tx: confirmed-hash",
      }),
    );
    expect(wallet.sign).toHaveBeenCalled();
    expect(wallet.relay).toHaveBeenCalledWith({ payload: "signed-payload" });
    expect(wallet.sendWithGasKey).not.toHaveBeenCalled();
  });

  it("hides the balance line when no key is bootstrapped and does not fund", async () => {
    renderEditor();
    await screen.findByRole("button", { name: "Publish now" });

    expect(screen.queryByTestId("metadata-gas-key-balance")).toBeNull();
    expect(wallet.ensureGasKeyFunded).not.toHaveBeenCalled();
  });
});
