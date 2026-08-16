import { randomBytes } from "node:crypto";
import { Effect } from "effect";
import {
  buildRegistryConfigUrl,
  fetchBosConfigFromFastKv,
  getFastKvBaseUrlForNetwork,
  getRegistryNamespaceForNetwork,
  type NetworkId,
  parseBosUrl,
} from "../fastkv";
import { fetchJsonOrNull } from "../http-client";
import { executeTransaction, type NearSigningMode } from "../near-cli";

const LOCK_SUFFIX = "lock/deploy.json";
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const RELEASE_SENTINEL_VALUE = "{}";

export interface DeployLockValue {
  owner: string;
  pid: number | string;
  startedAt: number;
  expiresAt: number;
  network: NetworkId;
  nonce: string;
  txHash?: string;
}

export interface DeployLockConflict {
  active: boolean;
  expiresAt: number;
  value: DeployLockValue | null;
  reason: "active" | "verify-mismatch";
}

export type AcquireDeployLockResult =
  | { acquired: true; nonce: string; txHash?: string }
  | { acquired: false; conflict: DeployLockConflict };

export interface LockContext {
  account: string;
  gateway: string;
  network: NetworkId;
}

export interface AcquireOptions extends LockContext {
  privateKey?: string;
  signingMode?: NearSigningMode;
  ttlMs?: number;
  owner?: string;
}

function buildDeployLockKey(account: string, gateway: string): string {
  return `apps/${account}/${gateway}/${LOCK_SUFFIX}`;
}

function buildDeployLockUrl(account: string, gateway: string, network: NetworkId): string {
  const baseUrl = getFastKvBaseUrlForNetwork(network);
  const namespace = getRegistryNamespaceForNetwork(network);
  const key = buildDeployLockKey(account, gateway);
  return `${baseUrl}/v0/latest/${encodeURIComponent(namespace)}/${encodeURIComponent(account)}/${encodeURIComponent(key)}`;
}

function parseDeployLockValue(raw: unknown): DeployLockValue | null {
  if (raw == null) return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (raw === RELEASE_SENTINEL_VALUE) return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.nonce !== "string" || typeof obj.expiresAt !== "number") return null;
  return {
    owner: typeof obj.owner === "string" ? obj.owner : "unknown",
    pid: typeof obj.pid === "number" || typeof obj.pid === "string" ? obj.pid : -1,
    startedAt: typeof obj.startedAt === "number" ? obj.startedAt : 0,
    expiresAt: obj.expiresAt,
    network:
      typeof obj.network === "string" && (obj.network === "mainnet" || obj.network === "testnet")
        ? obj.network
        : "mainnet",
    nonce: obj.nonce,
    txHash: typeof obj.txHash === "string" ? obj.txHash : undefined,
  };
}

export async function fetchDeployLock(
  ctx: LockContext,
): Promise<{ active: boolean; value: DeployLockValue | null }> {
  const url = buildDeployLockUrl(ctx.account, ctx.gateway, ctx.network);
  const payload = await fetchJsonOrNull<{ entries?: Array<{ value: unknown } | null> }>(url, {
    retries: 0,
  });
  const raw = payload?.entries?.find(Boolean)?.value;
  const value = parseDeployLockValue(raw);
  if (!value) return { active: false, value: null };
  return { active: value.expiresAt > Date.now(), value };
}

function buildLockArgsBase64(key: string, value: string): string {
  const payload = JSON.stringify({ [key]: value });
  return Buffer.from(payload).toString("base64");
}

async function writeDeployLockValue(
  ctx: LockContext,
  value: string,
  signingMode: NearSigningMode,
  options: { privateKey?: string; verbose?: boolean },
): Promise<string | undefined> {
  const tx = await Effect.runPromise(
    executeTransaction(
      {
        account: ctx.account,
        contract: getRegistryNamespaceForNetwork(ctx.network),
        method: "__fastdata_kv",
        argsBase64: buildLockArgsBase64(buildDeployLockKey(ctx.account, ctx.gateway), value),
        network: ctx.network,
        privateKey: signingMode._tag === "privateKey" ? signingMode.privateKey : undefined,
        gas: "100Tgas",
        deposit: "0NEAR",
        verbose: options.verbose ?? false,
      },
      signingMode,
    ),
  );
  return tx.txHash;
}

export async function acquireDeployLock(options: AcquireOptions): Promise<AcquireDeployLockResult> {
  const signingMode = options.signingMode ?? {
    _tag: "privateKey" as const,
    privateKey: options.privateKey ?? "",
  };
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const owner = options.owner ?? "bos-publish";
  const nonce = randomBytes(8).toString("hex");
  const now = Date.now();
  const desired: DeployLockValue = {
    owner,
    pid: process.pid,
    startedAt: now,
    expiresAt: now + ttlMs,
    network: options.network,
    nonce,
  };

  const initial = await fetchDeployLock(options);
  if (initial.active && initial.value) {
    return {
      acquired: false,
      conflict: {
        active: true,
        expiresAt: initial.value.expiresAt,
        value: initial.value,
        reason: "active" as const,
      },
    };
  }

  const txHash = await writeDeployLockValue(options, JSON.stringify(desired), signingMode, {
    privateKey: options.privateKey,
  });

  const verify = await fetchDeployLock(options);
  if (!verify.active || verify.value?.nonce !== nonce) {
    return {
      acquired: false,
      conflict: {
        active: verify.active,
        expiresAt: verify.value?.expiresAt ?? 0,
        value: verify.value,
        reason: "verify-mismatch" as const,
      },
    };
  }

  return { acquired: true, nonce, txHash };
}

export async function releaseDeployLock(
  ctx: LockContext,
  options: { privateKey?: string; signingMode?: NearSigningMode; force?: boolean },
): Promise<{ released: boolean; txHash?: string }> {
  const signingMode = options.signingMode ?? {
    _tag: "privateKey" as const,
    privateKey: options.privateKey ?? "",
  };

  const current = await fetchDeployLock(ctx);

  if (!options.force && !current.active) {
    return { released: false };
  }

  const txHash = await writeDeployLockValue(ctx, RELEASE_SENTINEL_VALUE, signingMode, {
    privateKey: options.privateKey,
  });
  return { released: true, txHash };
}

export interface InspectDeployLockResult {
  account: string;
  gateway: string;
  network: NetworkId;
  configRegistryUrl: string;
  lockRegistryUrl: string;
  active: boolean;
  value: DeployLockValue | null;
}

export async function inspectDeployLock(ctx: LockContext): Promise<InspectDeployLockResult> {
  const state = await fetchDeployLock(ctx);
  return {
    account: ctx.account,
    gateway: ctx.gateway,
    network: ctx.network,
    configRegistryUrl: buildRegistryConfigUrl(ctx.account, ctx.gateway),
    lockRegistryUrl: buildDeployLockUrl(ctx.account, ctx.gateway, ctx.network),
    active: state.active,
    value: state.value,
  };
}

export { buildDeployLockKey, buildDeployLockUrl, parseDeployLockValue };
