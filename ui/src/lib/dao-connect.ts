/**
 * DAO wallet connection — a second NEAR Connect instance scoped to the
 * Trezu wallet only, fully separated from the SIWN session wallet.
 * Exposes a singleton connector + a `useDaoConnection` hook + a `signAsDao`
 * helper that wraps a near-kit transaction builder as the connected DAO account.
 *
 * Designed as a reusable primitive; only the tenant wizard and tenant detail
 * consume it today.
 */

import { LocalStorage, NearConnector } from "@hot-labs/near-connect";
import { Amount, type FinalExecutionOutcome, fromNearConnect, Gas, Near } from "near-kit";
import { useEffect } from "react";
import { create } from "zustand";

import {
  buildTenantPublishConfig,
  isExplicitDaoMember,
  type NearPolicy,
  type NearPolicyRole,
  type NearPolicyRoleEveryone,
  type NearPolicyRoleGroup,
  parsePolicyGroupMembers,
  type TenantPublishConfig,
  type TenantPublishConfigInput,
} from "./dao-policy";

export type {
  NearPolicy,
  NearPolicyRole,
  NearPolicyRoleEveryone,
  NearPolicyRoleGroup,
  TenantPublishConfig,
  TenantPublishConfigInput,
};
export { buildTenantPublishConfig, isExplicitDaoMember, parsePolicyGroupMembers };

const TREZU_WALLET_MANIFEST = {
  id: "trezu-wallet",
  name: "Trezu Wallet",
  icon: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20500%20500%22%3E%3Cdefs%3D%3ClinearGradient%20id%3D%22a%22%20x1%3D%2244.13%22%20y1%3D%220%22%20x2%3D%2244.13%22%20y2%3D%2297.718%22%20gradientUnits%3D%22userSpaceOnUse%22%20gradientTransform%3D%22translate(144.076%20132.727)scale(2.40025)%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23c0d5ff%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Cpath%20style%3D%22fill%3A%231b66ff%22%20d%3D%22M-1.669-1.48h503.337v502.959H-1.669z%22%2F%3E%3Cpath%20d%3D%22M250.001%20367.274V253.783h105.923zm0-113.491H144.076l105.925-121.057h105.923z%22%20fill%3D%22url(%23a)%22%2F%3E%3C%2Fsvg%3E",
  description: "Trezu multichain multisig",
  website: "https://trezu.org",
  version: "1.0.0",
  executor: "https://trezu.app/_next/static/near-connect/trezu-wallet.js",
  type: "sandbox" as const,
  platform: ["https://trezu.app"],
  features: {
    signMessage: false,
    signTransaction: false,
    signAndSendTransaction: true,
    signAndSendTransactions: true,
    signInWithoutAddKey: true,
    signInAndSignMessage: false,
    signInWithFunctionCallKey: false,
    signDelegateActions: false,
    mainnet: true,
    testnet: false,
  },
  permissions: {
    storage: true,
    allowsOpen: ["https://trezu.app"],
  },
};

const DAO_STORAGE_PREFIX = "dao-connect:";

function prefixedStorage(): LocalStorage {
  const inner = new LocalStorage();
  return {
    async get(key: string): Promise<string | null> {
      return inner.get(`${DAO_STORAGE_PREFIX}${key}`);
    },
    async set(key: string, value: string): Promise<void> {
      await inner.set(`${DAO_STORAGE_PREFIX}${key}`, value);
    },
    async remove(key: string): Promise<void> {
      await inner.remove(`${DAO_STORAGE_PREFIX}${key}`);
    },
  };
}

let _connector: NearConnector | null = null;

function getConnector(): NearConnector {
  if (_connector) return _connector;
  _connector = new NearConnector({
    network: "mainnet",
    manifest: { version: "1.0.0", wallets: [TREZU_WALLET_MANIFEST] },
    storage: prefixedStorage(),
    autoConnect: false,
  });
  return _connector;
}

export interface ParsedDaoMembership {
  isSputnikContract: boolean;
  isMember: boolean;
  policy: NearPolicy | null;
}

export interface DaoConnectionState {
  status: "idle" | "connecting" | "connected" | "error";
  daoAccountId: string | null;
  error: string | null;
  set(partial: Partial<DaoConnectionState>): void;
  reset(): void;
}

const initialState: Omit<DaoConnectionState, "set" | "reset"> = {
  status: "idle",
  daoAccountId: null,
  error: null,
};

export const useDaoConnectionStore = create<DaoConnectionState>((set) => ({
  ...initialState,
  set(partial) {
    set(partial);
  },
  reset() {
    set({ ...initialState });
  },
}));

export interface ConnectDaoOptions {
  walletId?: string;
}

export async function connectDaoAccount(options: ConnectDaoOptions = {}): Promise<string> {
  const store = useDaoConnectionStore.getState();
  store.set({ status: "connecting", error: null });
  try {
    const connector = getConnector();
    const wallet = await connector.connect({
      ...(options.walletId ? { walletId: options.walletId } : {}),
    });
    const accounts = await wallet.getAccounts();
    const first = accounts[0]?.accountId;
    if (!first) {
      throw new Error("Trezu wallet returned no accounts");
    }
    store.set({ status: "connected", daoAccountId: first, error: null });
    return first;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    store.set({ status: "error", error: message, daoAccountId: null });
    throw err;
  }
}

export async function disconnectDaoAccount(): Promise<void> {
  const connector = getConnector();
  try {
    await connector.disconnect();
  } catch {}
  useDaoConnectionStore.getState().reset();
}

export function getDaoConnector(): NearConnector {
  return getConnector();
}

export async function fetchDaoPolicy(daoAccountId: string): Promise<NearPolicy | null> {
  const connector = getConnector();
  const wallet = await connector.wallet();
  const walletId = (wallet as { manifest?: { id?: string } }).manifest?.id;
  const accounts = await wallet.getAccounts();
  const connected = walletId ? accounts.find((a) => a.accountId === daoAccountId) : accounts[0];
  if (!connected) {
    throw new Error("Connected wallet does not own the requested DAO account");
  }
  const rpcUrl = "https://rpc.mainnet.near.org";
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: "dao-connect",
    method: "query",
    params: {
      request_type: "call_function",
      account_id: daoAccountId,
      method_name: "get_policy",
      args_base64: Buffer.from("{}", "utf8").toString("base64"),
      finality: "final",
    },
  });
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!res.ok) return null;
  const raw = (await res.json()) as {
    result?: { result?: unknown[] };
    error?: unknown;
  };
  if (raw.error) return null;
  const rawBytes = Array.isArray(raw.result?.result) ? raw.result.result : [];
  const decoded = new TextDecoder().decode(Uint8Array.from(rawBytes as number[]));
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as NearPolicy;
  } catch {
    return null;
  }
}

export async function fetchDaoMembership(
  daoAccountId: string,
  primaryAccountId: string,
): Promise<ParsedDaoMembership> {
  const policy = await fetchDaoPolicy(daoAccountId);
  if (!policy) return { isSputnikContract: false, isMember: false, policy: null };
  return {
    isSputnikContract: true,
    isMember: isExplicitDaoMember(policy, primaryAccountId),
    policy,
  };
}

export function useDaoAutoRestore(): void {
  const set = useDaoConnectionStore((s) => s.set);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const connector = getConnector();
        const result = await connector.getConnectedWallet();
        const accountId = result?.accounts?.[0]?.accountId;
        if (cancelled) return;
        if (accountId) {
          set({ status: "connected", daoAccountId: accountId, error: null });
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [set]);
}

export interface SignAsDaoSpec {
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  attachedDeposit?: string;
}

export interface SignAsDaoOptions {
  waitUntil?: "NONE" | "INCLUDED" | "EXECUTED" | "FINAL";
}

export async function signAsDaoTransaction(
  daoAccountId: string,
  spec: SignAsDaoSpec,
  options: SignAsDaoOptions = {},
): Promise<FinalExecutionOutcome> {
  const connector = getConnector();
  const near = new Near({
    network: "mainnet",
    wallet: fromNearConnect(connector),
  });
  const builder = near
    .transaction(daoAccountId)
    .functionCall(spec.receiverId, spec.methodName, spec.args as unknown as Record<string, never>, {
      ...(options.waitUntil ? { waitUntil: options.waitUntil } : {}),
      gas: parseGasInput(spec.gas),
      attachedDeposit: parseDepositInput(spec.attachedDeposit),
    });
  return builder.send({ waitUntil: options.waitUntil ?? "EXECUTED" });
}

function parseGasInput(raw: string): `${number} Tgas` | `${number}` {
  if (raw.endsWith("Tgas") || raw.includes(" ")) return raw as `${number} Tgas`;
  const fixed = raw.replace(/[^\d]/g, "");
  if (fixed.length === 0) return Gas.DEFAULT;
  const tgas = fixed.padEnd(13 - 12, "0");
  return `${Number(tgas.slice(0, -12))} Tgas` as `${number} Tgas`;
}

function parseDepositInput(raw: string | undefined): `${bigint} yocto` {
  if (!raw || raw === "0" || raw === "0 yocto") return Amount.ZERO;
  if (raw.endsWith("yocto") || raw.endsWith("NEAR")) return raw as `${bigint} yocto`;
  return Amount.yocto(BigInt(raw));
}

export interface UseDaoConnectionResult {
  status: DaoConnectionState["status"];
  daoAccountId: string | null;
  error: string | null;
  connect(options?: ConnectDaoOptions): Promise<string>;
  disconnect(): Promise<void>;
}

export function useDaoConnection(): UseDaoConnectionResult {
  const status = useDaoConnectionStore((s) => s.status);
  const daoAccountId = useDaoConnectionStore((s) => s.daoAccountId);
  const error = useDaoConnectionStore((s) => s.error);
  return {
    status,
    daoAccountId,
    error,
    async connect(options) {
      return connectDaoAccount(options);
    },
    async disconnect() {
      return disconnectDaoAccount();
    },
  };
}
