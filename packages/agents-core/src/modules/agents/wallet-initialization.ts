import type { OwnerWallet } from "@near-intents-agent-api/contracts";
import {
  deriveEvmWallet,
  derivePasskeyWallet,
  EVM_WALLET_CODE_ID,
  PASSKEY_WALLET_CODE_ID,
} from "@near-intents-agent-api/owner-auth";
import { JsonRpcProvider } from "near-api-js";
import { getRuntime } from "../../config/runtime.js";
import { withAdvisoryLock } from "../../lib/db.js";
import { withSponsorKey } from "../../lib/sponsor-pool.js";
import { requireWalletSponsor } from "../../lib/wallet-sponsor.js";
import { ApiError } from "../../shared/errors.js";

/** Pinned mainnet owner-wallet code; see docs/architecture.md#owners-and-wallets. */
const EXPECTED_OWNER_WALLET_CODE_HASH: Record<string, string> = {
  [PASSKEY_WALLET_CODE_ID]: "qD9cxbe38rJn7BwUBtqaC2vVAiYD7TS4vnrafccHsRp",
  [EVM_WALLET_CODE_ID]: "FkAmDpjc2HaoFmU9xwgG6x5oJUXnpxAREtTMZi5UcgRy",
};

/** Global contract code is at most a few MiB; base64 plus the JSON envelope stays well below. */
const codeCheckMaxResponseBytes = 8 * 1_048_576;
const codeCheckTimeoutMs = 10_000;

/** Reads at most `codeCheckMaxResponseBytes` and cancels the stream beyond it. */
async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > codeCheckMaxResponseBytes) return undefined;
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A code-identity answer from a cleartext remote or redirected endpoint is not evidence. */
function trustedRpcUrl(url: string): boolean {
  const parsed = new URL(url);
  return (
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname))
  );
}

/** One bounded RPC read; a block hash is reused for every authorization observation. */
async function rpcRead(url: string, method: string, params: unknown): Promise<unknown> {
  if (!trustedRpcUrl(url)) return;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "owner-wallet-code-check", method, params }),
    redirect: "error",
    credentials: "omit",
    signal: AbortSignal.timeout(codeCheckTimeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return;
  }
  return readBoundedJson(response);
}

/** Hash and proof must use the same finalized block, even across RPC failover. */
async function publishedCodeHash(
  url: string,
  accountId: string,
): Promise<{ hash: string; blockId: string } | undefined> {
  const block = (await rpcRead(url, "block", { finality: "final" })) as
    | { result?: { header?: { hash?: unknown } } }
    | undefined;
  const blockId = block?.result?.header?.hash;
  if (typeof blockId !== "string" || !blockId) return;
  const code = (await rpcRead(url, "query", {
    request_type: "view_global_contract_code_by_account_id",
    block_id: blockId,
    account_id: accountId,
  })) as { result?: { hash?: unknown; block_hash?: unknown } } | undefined;
  const result = code?.result;
  if (typeof result?.hash !== "string") return;
  if (result.block_hash !== blockId) return;
  return { hash: result.hash, blockId };
}

export async function assertOwnerWalletCode(
  owner: Extract<OwnerWallet, { type: "passkey" | "evm" }>,
): Promise<string> {
  const accountId = owner.type === "passkey" ? PASSKEY_WALLET_CODE_ID : EVM_WALLET_CODE_ID;
  const expectedHash = EXPECTED_OWNER_WALLET_CODE_HASH[accountId];
  if (!expectedHash) throw new ApiError("wallet_code_untrusted", 409);

  for (const url of getRuntime().nearRpcUrls) {
    let observation: Awaited<ReturnType<typeof publishedCodeHash>>;
    try {
      observation = await publishedCodeHash(url, accountId);
    } catch {
      // Timeout, redirect, oversized or malformed response: try the next endpoint.
    }
    if (!observation) continue;
    if (observation.hash !== expectedHash) throw new ApiError("wallet_code_untrusted", 409);
    return observation.blockId;
  }
  throw new ApiError("wallet_rpc_unavailable", 503);
}

function isUnknownAccount(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; cause?: { name?: string } };
  return (
    candidate.name === "AccountDoesNotExistError" || candidate.cause?.name === "UNKNOWN_ACCOUNT"
  );
}

/** Check code identity, rather than trusting a syntactically valid 0s address. */
async function accountState(accountId: string) {
  for (const url of getRuntime().nearRpcUrls) {
    try {
      return await new JsonRpcProvider({ url }).viewAccount({
        accountId,
        blockQuery: { finality: "final" },
      });
    } catch (error) {
      if (isUnknownAccount(error)) return null;
    }
  }
  throw new ApiError("wallet_rpc_unavailable", 503);
}

/**
 * Makes the owner's deterministic `0s` wallet exist with the pinned wallet code. Callers invoke
 * this only after verifying the owner's signature over the exact request the wallet will execute,
 * so the sponsor never funds an account for an unproven key.
 */
export async function ensureOwnerWalletInitialized(
  owner: Extract<OwnerWallet, { type: "passkey" | "evm" }>,
  accountId: string,
) {
  const wallet =
    owner.type === "passkey"
      ? derivePasskeyWallet(owner.publicKey)
      : deriveEvmWallet(owner.publicKey);
  const codeId = owner.type === "passkey" ? PASSKEY_WALLET_CODE_ID : EVM_WALLET_CODE_ID;
  if (wallet.accountId !== accountId) throw new ApiError("wallet_account_mismatch", 409);
  await assertOwnerWalletCode(owner);
  const existing = await accountState(wallet.accountId);
  if (existing) {
    if (existing.global_contract_account_id !== codeId)
      throw new ApiError("wallet_code_mismatch", 409);
    return;
  }
  const sponsor = requireWalletSponsor();
  await withSponsorKey(sponsor.accountId, () =>
    withAdvisoryLock(`wallet-init:${wallet.accountId}`, async () => {
      const current = await accountState(wallet.accountId);
      if (!current) await sponsor.initialize(wallet.accountId, wallet.stateInitBorsh);
    }),
  );
  const created = await accountState(wallet.accountId);
  if (created?.global_contract_account_id !== codeId)
    throw new ApiError("wallet_initialization_unconfirmed", 409);
}
