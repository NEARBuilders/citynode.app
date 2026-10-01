import { createHash } from "node:crypto";
import {
  borshString,
  borshU32,
  borshU64,
  borshU128,
  concat,
} from "@near-intents-agent-api/contracts/borsh";
import { base58 } from "@scure/base";
import { KeyPair, type KeyPairString } from "near-api-js";
import { awaitFinalTransaction, type NonceWitness } from "./finality.js";
import { createNearRpcProvider } from "./near-rpc.js";
import {
  nextOperationalNonce,
  recordOperationalNonce,
  resetOperationalNonce,
} from "./operational-account.js";
import { assertSponsorBalance } from "./sponsor-balance.js";

/** Gas and new-account storage a state init takes from the sponsor; about 0.008 NEAR on mainnet. */
const stateInitReserveYocto = 10n ** 22n;

/** NEAR protocol Action::DeterministicStateInit, variant 11. */
function stateInitAction(stateInitBorsh: Uint8Array): Uint8Array {
  return concat(new Uint8Array([11]), stateInitBorsh, borshU128(0n));
}

/** A `send_tx` reply is a small JSON envelope; anything past this is oversized or malformed. */
const sendStateInitMaxResponseBytes = 1_048_576;

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** A broadcast acceptance or rejection from a cleartext remote or redirected endpoint is not trustworthy. */
function trustedRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" ||
      (parsed.protocol === "http:" && loopbackHosts.has(parsed.hostname))
    );
  } catch {
    return false;
  }
}

/** Reads at most `sendStateInitMaxResponseBytes` and cancels the stream beyond it. */
async function readBoundedSendTxResponse(
  response: Response,
): Promise<{ error?: unknown } | undefined> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > sendStateInitMaxResponseBytes) return undefined;
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Raw `send_tx` for an action near-api-js cannot encode. `wait_until: NONE` returns once a node
 * accepts the bytes; finality is observed separately by short status reads. Acceptance proves
 * nothing, so the identical bytes go to every trusted endpoint at once (see `near-rpc.ts`).
 *
 * Exported only for direct unit testing of the endpoint-bounding behavior below; not part of the
 * package's public surface (see `index.ts`).
 */
export async function sendStateInit(urls: string[], signed: Uint8Array): Promise<void> {
  const request = JSON.stringify({
    jsonrpc: "2.0",
    id: "wallet-init",
    method: "send_tx",
    params: { signed_tx_base64: Buffer.from(signed).toString("base64"), wait_until: "NONE" },
  });
  const answers = await Promise.all(
    urls
      .filter(trustedRpcUrl)
      .map(async (url): Promise<{ accepted: true } | { rejection?: unknown }> => {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: request,
            redirect: "error",
            credentials: "omit",
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok) {
            await response.body?.cancel();
            return {};
          }
          const body = await readBoundedSendTxResponse(response);
          // Oversized or malformed: not proof of either outcome.
          if (body === undefined) return {};
          return body.error ? { rejection: body.error } : { accepted: true };
        } catch {
          return {};
        }
      }),
  );
  if (answers.some((answer) => "accepted" in answer)) return;
  const rejection = answers.find(
    (answer): answer is { rejection: unknown } => "rejection" in answer && !!answer.rejection,
  );
  if (rejection) throw new Error("wallet_init_rejected", { cause: rejection.rejection });
  throw Object.assign(new Error("wallet_init_rpc_unavailable"), { type: "RetriesExceeded" });
}

export function createDeterministicWalletInitializer(input: {
  rpcUrls: string[];
  accountId: string;
  privateKey: KeyPairString;
  beforeBroadcast?: (hash: string, witness?: NonceWitness) => Promise<void>;
}) {
  const provider = createNearRpcProvider(input.rpcUrls);
  const keyPair = KeyPair.fromString(input.privateKey);
  const publicKey = keyPair.getPublicKey().toString();
  const rawPublicKey = base58.decode(publicKey.slice("ed25519:".length));
  if (rawPublicKey.length !== 32) throw new Error("wallet_sponsor_key_invalid");

  const initialize = async (walletAccountId: string, stateInitBorsh: Uint8Array) => {
    const access = await provider.viewAccessKey({
      accountId: input.accountId,
      publicKey,
      finalityQuery: { finality: "final" },
    });
    if (access.permission !== "FullAccess") throw new Error("wallet_sponsor_key_restricted");
    const witness = {
      publicKey,
      nonce: nextOperationalNonce(input.accountId, publicKey, access.nonce + 1n),
    };
    const blockHash = base58.decode(access.block_hash);
    const transaction = concat(
      borshString(input.accountId),
      new Uint8Array([0]),
      rawPublicKey,
      borshU64(witness.nonce),
      borshString(walletAccountId),
      blockHash,
      borshU32(1),
      stateInitAction(stateInitBorsh),
    );
    const hash = createHash("sha256").update(transaction).digest();
    const signature = keyPair.sign(hash).signature;
    const signed = concat(transaction, new Uint8Array([0]), signature);
    const transactionHash = base58.encode(hash);
    await assertSponsorBalance(provider, input.accountId, {
      depositYocto: stateInitReserveYocto,
      gas: 0n,
    });
    recordOperationalNonce(input.accountId, witness);
    await input.beforeBroadcast?.(transactionHash, witness);
    try {
      const result = await awaitFinalTransaction({
        provider,
        transactionHash,
        senderId: input.accountId,
        broadcast: () => sendStateInit(input.rpcUrls, signed),
      });
      if (
        !result.status ||
        typeof result.status !== "object" ||
        !("SuccessValue" in result.status || "SuccessReceiptId" in result.status)
      )
        throw new Error("wallet_init_unconfirmed");
    } finally {
      // Raw deterministic-state-init bypasses near-api-js's shared nonce manager.
      await resetOperationalNonce(input);
    }
    return transactionHash;
  };
  return async (walletAccountId: string, stateInitBorsh: Uint8Array) => {
    if (!/^0s[0-9a-f]{40}$/.test(walletAccountId)) throw new Error("wallet_account_invalid");
    return initialize(walletAccountId, stateInitBorsh);
  };
}
