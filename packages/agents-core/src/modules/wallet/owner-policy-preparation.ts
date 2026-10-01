import { randomBytes } from "node:crypto";
import type { Policy, WalletRequestMessage } from "@near-intents-agent-api/contracts";
import {
  canonical,
  evmWalletRequestMessageSchema,
  nearPolicyRequestSchema,
  policySchema,
  walletRequestMessageSchema,
} from "@near-intents-agent-api/contracts";
import { policyStorageDeposit } from "@near-intents-agent-api/relayer";
import { getRuntime } from "../../config/runtime.js";
import { withAdvisoryLock } from "../../lib/db.js";
import { getOutlayer } from "../../lib/outlayer.js";
import { defaultedSlot } from "../../lib/slot.js";
import type { Actor } from "../../shared/actor.js";
import { hashSecret, newId } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { nearProvider } from "../../shared/near.js";
import { isArchived } from "../agents/lifecycle-repository.js";
import { requireBoundAgent } from "../agents/service.js";
import { assertDispatchFence } from "../operations/dispatch-fence.js";
import { runOperation } from "../operations/service.js";
import { settleSupersededRevision } from "./owner-policy-reconciliation.js";
import { assertPolicyWritable } from "./policy-write-rules.js";
import { releaseExpiredPreparation } from "./prepared-policy.js";
import { insertWalletPolicy, latestPolicy, latestPolicyVersion } from "./repository.js";
import { custodyCredential } from "./service.js";

/**
 * Policy preparation: turn an owner-signed revision into an exact provider transaction.
 *
 * No controller key signs anything here. The owner's signature is verified against the bound
 * identity, the provider encrypts and signs the policy under its own custody key, and the result
 * is persisted as `pending_wallet_signature` for the owner to authorize on chain.
 */

/** The bound owner identity every policy ceremony is verified against. */
type BoundWallet = Awaited<ReturnType<typeof requireBoundAgent>>["wallet"];

const slot = defaultedSlot<typeof policyStorageDeposit>(policyStorageDeposit);

/** Integration tests substitute a deterministic quote; production uses the NEAR RPC estimator. */
export function configurePolicyStorageEstimator(next?: typeof policyStorageDeposit) {
  slot.set(next);
}

function policyRequests(input: {
  ownerType: "near" | "passkey" | "evm";
  ownerAccountId: string;
  contractId: string;
  actions: WalletRequestMessage["request"]["external"][number]["actions"];
}) {
  const { ownerType, ownerAccountId, contractId, actions } = input;
  const header = {
    chain_id: getRuntime().network,
    signer_id: ownerAccountId,
    nonce: randomBytes(4).readUInt32LE(0),
    created_at: new Date(Date.now() - 30_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    // Ten minutes, the same window a NEAR delegate preparation stays relayable.
    timeout_secs: 600,
  };
  if (ownerType === "passkey")
    return {
      walletRequest: walletRequestMessageSchema.parse({
        ...header,
        request: { external: [{ receiver_id: contractId, actions }] },
      }),
    };
  const calls = actions.map((action) => {
    if (action.action !== "function_call") throw new Error("policy_action_invalid");
    return action.payload;
  });
  if (ownerType === "evm")
    return {
      walletRequest: evmWalletRequestMessageSchema.parse({
        ...header,
        request: {
          ops: [],
          out: {
            after: [],
            // biome-ignore lint/suspicious/noThenProperty: Required wallet-contract request field.
            then: [
              {
                receiver_id: contractId,
                actions: calls.map((call) => ({
                  action: "function_call",
                  function_name: call.function_name,
                  args: call.args ?? "",
                  deposit: call.deposit ?? "0",
                  min_gas: call.gas ?? "0",
                })),
              },
            ],
          },
        },
      }),
    };
  return {
    nearPolicyRequest: nearPolicyRequestSchema.parse({
      receiver_id: contractId,
      actions: calls.map((call) => ({
        methodName: call.function_name,
        argsBase64: call.args ?? "",
        gas: call.gas ?? "0",
        depositYocto: call.deposit ?? "0",
      })),
    }),
  };
}

async function preparedProviderPolicy(input: {
  ownerAccountId: string;
  wallet: Awaited<ReturnType<typeof requireBoundAgent>>["wallet"];
  policy: Policy;
  frozenBefore: boolean;
  beforeSign: () => Promise<void>;
}) {
  const { ownerAccountId, wallet, policy, frozenBefore, beforeSign } = input;
  const outlayer = getOutlayer();
  const credential = custodyCredential(wallet);
  const providerPolicy = policy;
  const encrypted = await outlayer.encryptPolicy(
    credential,
    providerPolicy,
    wallet.providerWalletId,
  );
  await beforeSign();
  const signed = await outlayer.signPolicy(credential, {
    caller: ownerAccountId,
    encryptedData: encrypted.encrypted_base64,
  });
  // Keys in PostgreSQL jsonb order (shorter first). Owners sign these args as a JSON object that
  // wallets re-serialize with `JSON.stringify`; this order survives jsonb storage and JSON
  // transport unchanged, so the bytes the wallet signs are the bytes prepared here.
  const args = {
    wallet_pubkey: `ed25519:${signed.public_key_hex}`,
    encrypted_data: encrypted.encrypted_base64,
    wallet_signature: signed.signature_hex,
  };
  const argsBase64 = Buffer.from(JSON.stringify(args)).toString("base64");
  let deposit: string;
  try {
    deposit = await slot.get()(
      nearProvider(),
      outlayer.contractId,
      ownerAccountId,
      argsBase64,
      getRuntime().walletPolicyStorageLimitYocto ?? "0",
      true,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "policy_owner_mismatch")
      throw new ApiError("policy_owner_mismatch", 409);
    throw error;
  }
  const gas = frozenBefore !== policy.frozen ? "50000000000000" : "100000000000000";
  const actions: WalletRequestMessage["request"]["external"][number]["actions"] = [
    {
      action: "function_call",
      payload: { function_name: "store_wallet_policy", args: argsBase64, deposit, gas },
    },
  ];
  if (frozenBefore !== policy.frozen)
    actions.push({
      action: "function_call",
      payload: {
        function_name: policy.frozen ? "freeze_wallet" : "unfreeze_wallet",
        args: Buffer.from(JSON.stringify({ wallet_pubkey: args.wallet_pubkey })).toString("base64"),
        deposit: "0",
        gas,
      },
    });
  return { encrypted, signed, deposit, actions };
}

/**
 * The custody wallet's freeze state as the provider holds it now. A bound wallet always has a
 * stored policy, so anything but a readback for this exact wallet refuses the preparation.
 *
 * The newest local revision is only a proposal record: a failed or expired unfreeze leaves the
 * earlier freeze in force, and `store_wallet_policy` preserves a freeze. The contract rejects a
 * redundant freeze or unfreeze, so the exact transition is derived from this state, never assumed.
 */
async function providerFreezeState(wallet: BoundWallet) {
  const outlayer = getOutlayer();
  const credential = custodyCredential(wallet);
  const provider = await outlayer
    .invalidatePolicyCache(credential, { walletId: wallet.providerWalletId })
    .then(() => outlayer.policy(credential))
    .catch(() => null);
  if (provider?.wallet_id !== wallet.providerWalletId || typeof provider.frozen !== "boolean")
    throw new ApiError("provider_policy_unavailable", 503);
  return provider.frozen;
}

/**
 * Encrypts and custody-signs one policy revision, stores it as `signed` and returns the exact
 * on-chain request its owner must sign. Shared by owner policy updates and agent onboarding.
 */
export async function stagePolicyRevision(input: {
  tenantId: string;
  agentId: string;
  operationId: string;
  ownerType: "near" | "passkey" | "evm";
  ownerAccountId: string;
  wallet: Awaited<ReturnType<typeof requireBoundAgent>>["wallet"];
  policy: Policy;
  policyHash: string;
  revision: number;
  frozenBefore: boolean;
}) {
  const { tenantId, agentId, operationId, ownerType, ownerAccountId, wallet, policy } = input;
  const outlayer = getOutlayer();
  const { encrypted, signed, deposit, actions } = await preparedProviderPolicy({
    ownerAccountId,
    wallet,
    policy,
    frozenBefore: input.frozenBefore,
    beforeSign: () => assertDispatchFence(tenantId, agentId, operationId),
  });
  const { walletRequest, nearPolicyRequest } = policyRequests({
    ownerType,
    ownerAccountId,
    contractId: outlayer.contractId,
    actions,
  });
  const policyId = newId();
  await assertDispatchFence(tenantId, agentId, operationId);
  await insertWalletPolicy({
    id: policyId,
    tenantId,
    agentId,
    walletId: wallet.providerWalletId,
    version: input.revision + 1,
    policyHash: input.policyHash,
    encryptedData: encrypted.encrypted_base64,
    signatureHex: signed.signature_hex,
    publicKeyHex: signed.public_key_hex,
    rules: policy,
    status: "draft",
  });
  return {
    operation_id: operationId,
    status: "pending_wallet_signature" as const,
    policy_id: policyId,
    wallet_id: wallet.providerWalletId,
    policy_hash: input.policyHash,
    expected_revision: input.revision,
    transaction_hash: null,
    submitted: false,
    provider_policy_readback: false,
    feePayer: "backend" as const,
    controller_id: ownerAccountId,
    receiver_id: outlayer.contractId,
    gas: "100000000000000",
    storage_deposit_yocto: deposit,
    ...(walletRequest ? { wallet_request: walletRequest } : {}),
    ...(nearPolicyRequest ? { near_policy_request: nearPolicyRequest } : {}),
    authorization: "wallet_signature" as const,
    enforced_by: "outlayer_contract" as const,
  };
}

/**
 * Stages one policy revision and returns the exact on-chain request the bound owner signs.
 *
 * No owner consent is collected up front: the owner's single signature over that request is the
 * consent. It names this agent's custody wallet and the encrypted, custody-signed policy, so it
 * cannot install anything else. `expectedRevision` rejects a concurrent edit before any provider
 * call; the dispatch fence and the stored preparation bind the rest.
 */
export async function preparePolicyRevision(
  actor: Actor,
  agentId: string,
  input: { policy: Policy; expectedRevision: number; idempotencyKey: string },
) {
  // A predecessor whose outcome is already decided is settled first, so the owner never has to
  // refresh it by hand and its epoch change cannot make this admission stale.
  await settleSupersededRevision(actor, agentId);
  const { agent, wallet } = await requireBoundAgent(actor, agentId);
  const ownerType = agent.ownerIdentity?.type;
  if (ownerType !== "passkey" && ownerType !== "evm" && ownerType !== "near")
    throw new ApiError("wallet_policy_signer_unsupported", 409);
  const ownerAccountId = agent.ownerAccountId;
  if (!ownerAccountId) throw new ApiError("agent_not_bound", 409);
  const policy = policySchema.parse(input.policy);
  assertPolicyWritable(policy);
  if (policy.frozen && (await isArchived(actor.tenantId, agentId)))
    throw new ApiError("agent_archived", 409);
  const policyHash = hashSecret(canonical(policy));
  // Refuse a stale revision before admitting an operation; the locked check below still decides.
  if (((await latestPolicyVersion(wallet.providerWalletId)) ?? 0) !== input.expectedRevision)
    throw new ApiError("policy_revision_conflict", 409);

  return runOperation({
    actor,
    agentId,
    kind: "policy",
    action: "policy",
    idempotencyKey: input.idempotencyKey,
    request: { policy_hash: policyHash, expected_revision: input.expectedRevision },
    authorizationEpochs: {
      ownerEpoch: agent.ownerEpoch,
      policyEpoch: agent.policyEpoch,
      lifecycleEpoch: agent.lifecycleEpoch,
    },
    run: async (operationId) =>
      withAdvisoryLock(`policy:${wallet.providerWalletId}`, async () => {
        await assertDispatchFence(actor.tenantId, agentId, operationId);
        const previous = await latestPolicy(actor.tenantId, agentId);
        if (previous?.status === "signed")
          await releaseExpiredPreparation(actor, agentId, previous.id);
        const revision = (await latestPolicyVersion(wallet.providerWalletId)) ?? 0;
        if (revision !== input.expectedRevision)
          throw new ApiError("policy_revision_conflict", 409);
        await assertDispatchFence(actor.tenantId, agentId, operationId);
        const frozenBefore = await providerFreezeState(wallet);
        return stagePolicyRevision({
          tenantId: actor.tenantId,
          agentId,
          operationId,
          ownerType,
          ownerAccountId,
          wallet,
          policy,
          policyHash,
          revision,
          frozenBefore,
        });
      }),
  });
}
