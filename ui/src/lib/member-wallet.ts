import { NearConnector } from "@hot-labs/near-connect";
import { passkeyWalletManifest } from "better-near-auth/client";
import {
  FunctionCallError,
  fromNearConnect,
  Near,
  NetworkError,
  TransactionTimeoutError,
  type WalletConnection,
} from "near-kit";

import { getCspNonce } from "@/app";
import type { AppMessageId } from "@/i18n/catalogs";
import { isWalletCancelled } from "@/i18n/error-message";

import { prefixedStorage } from "./prefixed-storage";

import type { SessionWallet } from "./sputnik-proposals";

export const MEMBER_WALLET_ID = passkeyWalletManifest.id;

const MEMBER_STORAGE_PREFIX = "member-connect:";

export interface MemberWalletExecutor {
  connect(): Promise<string | null>;
  getConnectedAccountId(): Promise<string | null>;
  getWallet(): WalletConnection;
  disconnect(): Promise<void>;
}

export function createPasskeyExecutor(): MemberWalletExecutor {
  let connector: NearConnector | null = null;
  const getConnector = () => {
    connector ??= new NearConnector({
      network: "mainnet",
      manifest: { wallets: [passkeyWalletManifest], version: passkeyWalletManifest.version },
      storage: prefixedStorage(MEMBER_STORAGE_PREFIX),
      autoConnect: false,
      cspNonce: getCspNonce(),
    });
    return connector;
  };
  return {
    async connect() {
      const wallet = await getConnector().connect({ walletId: MEMBER_WALLET_ID });
      const accounts = await wallet.getAccounts();
      return accounts[0]?.accountId ?? null;
    },
    async getConnectedAccountId() {
      const result = await getConnector()
        .getConnectedWallet()
        .catch(() => null);
      return result?.accounts?.[0]?.accountId ?? null;
    },
    getWallet() {
      return fromNearConnect(getConnector() as unknown as Parameters<typeof fromNearConnect>[0]);
    },
    async disconnect() {
      await getConnector()
        .disconnect()
        .catch(() => {});
    },
  };
}

let _executor: MemberWalletExecutor | null = null;

export function getMemberWalletExecutor(): MemberWalletExecutor {
  _executor ??= createPasskeyExecutor();
  return _executor;
}

export type MemberSigningFailure =
  | "cancelled"
  | "credential"
  | "network"
  | "unconfirmed"
  | "rejected"
  | "mismatch"
  | "signedOut"
  | "unknown";

export class MemberSigningError extends Error {
  readonly failure: MemberSigningFailure;
  readonly values?: Record<string, string>;

  constructor(failure: MemberSigningFailure, values?: Record<string, string>) {
    super(`Member signing failed: ${failure}`);
    this.name = "MemberSigningError";
    this.failure = failure;
    this.values = values;
  }
}

export interface MemberSessionWalletOptions {
  sessionAccountId: string | null;
  executor?: MemberWalletExecutor;
}

export interface MemberSessionWallet extends SessionWallet {
  disconnect(): Promise<void>;
}

export function createMemberSessionWallet({
  sessionAccountId,
  executor = getMemberWalletExecutor(),
}: MemberSessionWalletOptions): MemberSessionWallet {
  let verified: string | null = null;
  return {
    async ensureConnected() {
      if (!sessionAccountId) throw new MemberSigningError("signedOut");
      const cached = await executor.getConnectedAccountId();
      if (cached && cached !== sessionAccountId) await executor.disconnect();
      const accountId = cached === sessionAccountId ? cached : await executor.connect();
      if (!accountId) throw new MemberSigningError("credential");
      if (accountId !== sessionAccountId) {
        verified = null;
        await executor.disconnect();
        throw new MemberSigningError("mismatch", {
          expected: sessionAccountId,
          actual: accountId,
        });
      }
      verified = accountId;
      return true;
    },
    getAccountId() {
      return verified;
    },
    getNearClient() {
      return new Near({ network: "mainnet", wallet: executor.getWallet() });
    },
    async disconnect() {
      verified = null;
      await executor.disconnect();
    },
  };
}

const CREDENTIAL_PATTERN =
  /credential|passkey (?:not found|unavailable)|no passkey|(?:signing in with|creating) your passkey|screen lock|passkey is not registered/i;
const REJECTED_PATTERN = /smart contract panicked|executionerror|functioncallerror|actionerror/i;
const NETWORK_PATTERN =
  /failed to fetch|load failed|network|relay|sender|sponsor|status (?:429|5\d\d)/i;
const UNCONFIRMED_PATTERN = /timeout|timed out/i;

function errorName(error: unknown): string | undefined {
  return error && typeof error === "object" ? (Reflect.get(error, "name") as string) : undefined;
}

export function classifyMemberSigningError(error: unknown): MemberSigningFailure {
  if (error instanceof MemberSigningError) return error.failure;
  const name = errorName(error);
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (isWalletCancelled(error) || name === "NotAllowedError" || name === "AbortError")
    return "cancelled";
  if (
    name === "InvalidStateError" ||
    name === "NotSupportedError" ||
    name === "SecurityError" ||
    CREDENTIAL_PATTERN.test(message)
  )
    return "credential";
  if (error instanceof FunctionCallError || REJECTED_PATTERN.test(message)) return "rejected";
  if (error instanceof TransactionTimeoutError || UNCONFIRMED_PATTERN.test(message))
    return "unconfirmed";
  if (error instanceof NetworkError || NETWORK_PATTERN.test(message)) return "network";
  return "unknown";
}

const NOT_RETRYABLE: ReadonlySet<MemberSigningFailure> = new Set([
  "rejected",
  "signedOut",
  "unconfirmed",
]);

export function canRetryMemberSigning(failure: MemberSigningFailure): boolean {
  return !NOT_RETRYABLE.has(failure);
}

export const MEMBER_SIGNING_MESSAGES: Record<MemberSigningFailure, AppMessageId> = {
  cancelled: "memberWallet.error.cancelled",
  credential: "memberWallet.error.credential",
  network: "memberWallet.error.network",
  unconfirmed: "memberWallet.error.unconfirmed",
  rejected: "memberWallet.error.rejected",
  mismatch: "memberWallet.error.mismatch",
  signedOut: "memberWallet.error.signedOut",
  unknown: "memberWallet.error.unknown",
};

export type MemberSigningStatus = "idle" | "connecting" | "signing" | "submitted" | "error";

export interface MemberSigningState<T = unknown> {
  status: MemberSigningStatus;
  failure: MemberSigningFailure | null;
  failureValues?: Record<string, string>;
  result: T | null;
}

export interface MemberSigningController<T> {
  getState(): MemberSigningState<T>;
  subscribe(listener: () => void): () => void;
  submit(task: (wallet: SessionWallet) => Promise<T>): Promise<T>;
  reset(): void;
}

const idleState: MemberSigningState<never> = { status: "idle", failure: null, result: null };

export function createMemberSigningController<T>(
  wallet: SessionWallet,
): MemberSigningController<T> {
  let state: MemberSigningState<T> = idleState;
  let inFlight: Promise<T> | null = null;
  let requestSeq = 0;
  let resetEpoch = 0;
  const listeners = new Set<() => void>();
  const update = (next: MemberSigningState<T>) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    submit(task) {
      if (inFlight) return inFlight;
      if (state.status === "submitted") return Promise.resolve(state.result as T);
      if (state.failure === "unconfirmed")
        return Promise.reject(new MemberSigningError("unconfirmed"));
      const epoch = resetEpoch;
      const request = ++requestSeq;
      const isCurrent = () => epoch === resetEpoch;
      const pending = (async () => {
        try {
          update({ status: "connecting", failure: null, result: null });
          await wallet.ensureConnected();
          if (!isCurrent()) throw new MemberSigningError("signedOut");
          update({ status: "signing", failure: null, result: null });
          const result = await task(wallet);
          if (isCurrent()) update({ status: "submitted", failure: null, result });
          return result;
        } catch (error) {
          if (isCurrent()) {
            update({
              status: "error",
              failure: classifyMemberSigningError(error),
              failureValues: error instanceof MemberSigningError ? error.values : undefined,
              result: null,
            });
          }
          throw error;
        } finally {
          if (request === requestSeq) inFlight = null;
        }
      })();
      inFlight = pending;
      return pending;
    },
    reset() {
      resetEpoch += 1;
      update(idleState);
    },
  };
}
