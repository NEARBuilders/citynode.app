import { LocalStorage, NearConnector } from "@hot-labs/near-connect";
import { Amount, type FinalExecutionOutcome, fromNearConnect, Gas, Near } from "near-kit";
import { useEffect } from "react";
import { create } from "zustand";
import { getCspNonce } from "@/app";
import type { AppTranslator } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { translateEnglishAppMessage } from "@/i18n/runtime";

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
import { prefixedStorage } from "./prefixed-storage";

export type {
  NearPolicy,
  NearPolicyRole,
  NearPolicyRoleEveryone,
  NearPolicyRoleGroup,
  TenantPublishConfig,
  TenantPublishConfigInput,
};
export { buildTenantPublishConfig, isExplicitDaoMember, parsePolicyGroupMembers };

const TREZU_WALLET_ID = "trezu-wallet";

const DAO_STORAGE_PREFIX = "dao-connect:";
const DAO_AUTH_ACCOUNT_KEY = "dao-connect:auth-account";

async function readSessionAuthAccount(): Promise<string | null> {
  return new LocalStorage().get(DAO_AUTH_ACCOUNT_KEY);
}

async function writeSessionAuthAccount(accountId: string | null): Promise<void> {
  const storage = new LocalStorage();
  if (accountId) await storage.set(DAO_AUTH_ACCOUNT_KEY, accountId);
  else await storage.remove(DAO_AUTH_ACCOUNT_KEY);
}

let _connector: NearConnector | null = null;

function getConnector(): NearConnector {
  if (_connector) return _connector;
  _connector = new NearConnector({
    network: "mainnet",
    storage: prefixedStorage(DAO_STORAGE_PREFIX),
    autoConnect: false,
    cspNonce: getCspNonce(),
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
  authAccountId?: string;
}

export async function connectDaoAccount(options: ConnectDaoOptions = {}): Promise<string> {
  const store = useDaoConnectionStore.getState();
  store.set({ status: "connecting", error: null });
  try {
    const connector = getConnector();
    const wallet = await connector.connect({
      walletId: options.walletId ?? TREZU_WALLET_ID,
    });
    const accounts = await wallet.getAccounts();
    const first = accounts[0]?.accountId;
    if (!first) {
      throw new Error("Trezu wallet returned no accounts");
    }
    await writeSessionAuthAccount(options.authAccountId ?? null);
    store.set({ status: "connected", daoAccountId: first, error: null });
    return first;
  } catch (err) {
    store.set({ status: "error", error: describeDaoError(err, "your DAO"), daoAccountId: null });
    throw err;
  }
}

export async function disconnectDaoAccount(): Promise<void> {
  const connector = getConnector();
  try {
    await connector.disconnect();
  } catch {}
  await writeSessionAuthAccount(null);
  useDaoConnectionStore.getState().reset();
}

export async function verifyDaoAccount(want: string): Promise<boolean> {
  try {
    const connector = getConnector();
    const result = await connector.getConnectedWallet();
    const accounts = result?.accounts ?? [];
    if (accounts.some((account) => account.accountId === want)) {
      useDaoConnectionStore.getState().set({
        status: "connected",
        daoAccountId: want,
        error: null,
      });
      return true;
    }
  } catch {}
  if (useDaoConnectionStore.getState().daoAccountId) {
    useDaoConnectionStore.getState().reset();
  }
  return false;
}

export function describeDaoError(
  error: unknown,
  want: string,
  t: AppTranslator = translateEnglishAppMessage,
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("No accounts found") || message.includes("No wallet selected")) {
    return t("wallet.daoExpired", { account: want });
  }
  if (message.includes("returned no accounts")) {
    return t("wallet.daoMissing", { account: want });
  }
  if (message.includes("Wallet not found") || message.includes("Failed to load manifest")) {
    return t("wallet.daoUnavailable");
  }
  return appErrorMessage(error, t);
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
  const rpcUrl = "https://rpc.mainnet.fastnear.com";
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: "dao-connect",
    method: "query",
    params: {
      request_type: "call_function",
      account_id: daoAccountId,
      method_name: "get_policy",
      args_base64: btoa("{}"),
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

export function useDaoAutoRestore(authAccountId: string | null): void {
  const set = (partial: Partial<DaoConnectionState>) =>
    useDaoConnectionStore.getState().set(partial);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const connector = getConnector();
        const result = await connector.getConnectedWallet();
        const accountId = result?.accounts?.[0]?.accountId;
        if (cancelled || !accountId) return;
        const boundAccount = await readSessionAuthAccount();
        if (authAccountId === null || boundAccount === null || boundAccount !== authAccountId) {
          await disconnectDaoAccount();
          return;
        }
        set({ status: "connected", daoAccountId: accountId, error: null });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [authAccountId, set]);
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

function toNearKitWallet(connector: NearConnector) {
  return fromNearConnect(connector as unknown as Parameters<typeof fromNearConnect>[0]);
}

export async function signAsDaoTransaction(
  daoAccountId: string,
  spec: SignAsDaoSpec,
  options: SignAsDaoOptions = {},
): Promise<FinalExecutionOutcome> {
  const connector = getConnector();
  const near = new Near({
    network: "mainnet",
    wallet: toNearKitWallet(connector),
  });
  const builder = near
    .transaction(daoAccountId)
    .functionCall(spec.receiverId, spec.methodName, spec.args, {
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
