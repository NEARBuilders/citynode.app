import type {
  OnboardingSignature,
  OwnerWallet,
  SignedNearPolicy,
  SignedWalletRequest,
} from "@near-intents-agent-api/contracts";
import {
  canonical,
  evmWalletRequestMessageSchema,
  walletRequestHash,
  walletRequestMessageSchema,
} from "@near-intents-agent-api/contracts";
import {
  verifyEvmWalletRequest,
  verifyPasskeyChallengeProof,
} from "@near-intents-agent-api/owner-auth";
import { type NonceWitness, RelayError } from "@near-intents-agent-api/relayer";
import { getRuntime } from "../../config/runtime.js";
import { requireOwnerPolicySponsor } from "../../lib/owner-policy-sponsor.js";
import { sponsorIdentity, withSponsorKey } from "../../lib/sponsor-pool.js";
import { requireWalletSponsor } from "../../lib/wallet-sponsor.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { invalidatePolicyOwnerCache } from "../../shared/near.js";
import { requireBoundAgent } from "../agents/service.js";
import { assertDispatchFence, commitDispatch } from "../operations/dispatch-fence.js";
import { findOperation, persistOperationResult } from "../operations/repository.js";
import { commitSponsorship, reserveSponsorship } from "../operations/sponsor-budget.js";
import { parseNearPolicyDelegate } from "./near-policy-delegate.js";
import { reconcileOwnerPolicy } from "./owner-policy-reconciliation.js";
import { claimPreparedWalletPolicy } from "./policy-claim-service.js";
import { commitPolicyFunding } from "./policy-funding.js";
import { type PreparedPolicy, preparedSchema } from "./prepared-policy.js";
import { type StorageFunding, storedFunding } from "./storage-funding.js";

/**
 * Policy submission: relay only the request that was prepared for this exact revision and signed
 * by the bound wallet.
 *
 * The preparation is the contract. A submission that does not match the stored preparation byte
 * for byte is refused before any sponsor key is used, and a single atomic claim means one
 * dispatcher owns the broadcast even across processes.
 */

/** The identity a prepared request must be signed by: the bound owner, or the onboarding owner. */
export type PolicySigner = {
  ownerIdentity: OwnerWallet | null;
  ownerAccountId: string | null;
  ownerPublicKey: string | null;
};

/** A signed prepared request, as submitted by the owner's wallet. */
export type SubmittedPolicy = SignedWalletRequest | SignedNearPolicy | OnboardingSignature;

/**
 * Verifies the owner's signature over the exact prepared request, locally and before any sponsor
 * key is used. Returns the decoded NEAR delegate for NEAR owners.
 */
export function verifySubmittedPolicy(
  agent: PolicySigner,
  prepared: PreparedPolicy,
  signed: SubmittedPolicy,
) {
  if (
    agent.ownerIdentity?.type === "near" &&
    "signedDelegate" in signed &&
    prepared.near_policy_request
  ) {
    if (!agent.ownerAccountId || !agent.ownerPublicKey) throw new ApiError("agent_not_bound", 409);
    return parseNearPolicyDelegate({
      signedDelegate: signed.signedDelegate,
      ownerAccountId: agent.ownerAccountId,
      ownerPublicKey: agent.ownerPublicKey,
      prepared: prepared.near_policy_request,
    });
  }
  if ("msg" in signed && prepared.wallet_request) {
    verifySignedWalletPolicy(agent, prepared.wallet_request, signed);
    return undefined;
  }
  throw new ApiError("wallet_request_type_mismatch", 409);
}

function verifySignedWalletPolicy(
  agent: PolicySigner,
  prepared: NonNullable<PreparedPolicy["wallet_request"]>,
  signed: Pick<SignedWalletRequest, "msg" | "proof">,
) {
  if (canonical(signed.msg) !== canonical(prepared))
    throw new ApiError("wallet_request_mismatch", 409);
  const created = Date.parse(signed.msg.created_at);
  if (
    !Number.isFinite(created) ||
    created > Date.now() ||
    Date.now() - created >= signed.msg.timeout_secs * 1000
  )
    throw new ApiError("wallet_request_expired", 409);
  try {
    if (agent.ownerIdentity?.type === "passkey" && "external" in signed.msg.request)
      verifyPasskeyChallengeProof({
        owner: agent.ownerIdentity,
        proofText: signed.proof,
        challenge: walletRequestHash(walletRequestMessageSchema.parse(signed.msg)),
      });
    else if (agent.ownerIdentity?.type === "evm" && "ops" in signed.msg.request)
      verifyEvmWalletRequest({
        publicKey: agent.ownerIdentity.publicKey,
        message: evmWalletRequestMessageSchema.parse(signed.msg),
        proof: signed.proof,
      });
    else throw new Error("wallet_request_type_mismatch");
  } catch {
    throw new ApiError("wallet_request_signature_invalid", 401);
  }
}

/** Mutable funding state for one dispatch; `current` is what the operation has journaled. */
type FundingState = { current?: StorageFunding };

/** A journaled transfer never observed final: it may or may not have paid. */
const fundingUnresolved = (funding: FundingState) => funding.current?.status === "submitted";

type Funder = (
  receiverId: string,
  amount: bigint,
  journal: (transactionHash: string, witness?: NonceWitness) => Promise<void>,
) => Promise<string>;

async function relayPreparedPolicy(input: {
  actor: Actor;
  agentId: string;
  operationId: string;
  ownerAccountId: string;
  prepared: PreparedPolicy;
  dispatch: PreparedPolicy;
  nearSigned?: ReturnType<typeof parseNearPolicyDelegate>;
  signed: SubmittedPolicy;
  funding: FundingState;
}) {
  const { actor, agentId, operationId, ownerAccountId, prepared, dispatch, nearSigned, signed } =
    input;
  const amount = BigInt(prepared.storage_deposit_yocto);
  if (amount > BigInt(getRuntime().walletPolicyStorageLimitYocto ?? "0"))
    throw new ApiError("policy_deposit_limit", 409);
  // Only a transfer observed final waives funding; a failed one is due again.
  const fundingDue = input.funding.current?.status === "succeeded" ? 0n : amount;
  const withFunding = () =>
    input.funding.current ? { ...dispatch, storage_funding: input.funding.current } : dispatch;
  const fund = async (transfer: Funder, sponsorAccountId: string) => {
    if (fundingDue === 0n) return;
    await transfer(ownerAccountId, fundingDue, async (transactionHash, witness) => {
      const journaled: StorageFunding = {
        status: "submitted",
        transaction_hash: transactionHash,
        sponsor_account_id: sponsorAccountId,
        sponsor_public_key: witness?.publicKey,
        sponsor_nonce: witness?.nonce.toString(),
        receiver_id: ownerAccountId,
        amount_yocto: fundingDue.toString(),
      };
      // The transfer's own commitment point, with the exact signed hash: current authority is
      // re-checked and the journal committed before it can leave. If this refuses, it never does.
      await commitPolicyFunding({
        tenantId: actor.tenantId,
        agentId,
        operationId,
        policyId: prepared.policy_id,
        funding: journaled,
        result: dispatch,
      });
      input.funding.current = journaled;
    });
    input.funding.current = { ...(input.funding.current as StorageFunding), status: "succeeded" };
  };
  let signingIdentity: ReturnType<typeof sponsorIdentity>;
  const onBroadcast = async (transactionHash: string, witness?: NonceWitness) => {
    signingIdentity = sponsorIdentity();
    await commitSponsorship(operationId);
    await persistOperationResult(actor.tenantId, agentId, operationId, "policy", "uncertain", {
      ...withFunding(),
      status: "submitted",
      transaction_hash: transactionHash,
      // The signing key and nonce let reconciliation prove a hash that never appears was dropped.
      sponsor_public_key: witness?.publicKey,
      sponsor_nonce: witness?.nonce.toString(),
      ...sponsorIdentity(),
    });
    // This callback runs after transaction signing and immediately before provider broadcast.
    await commitDispatch(actor.tenantId, agentId, operationId);
    sponsorIdentity(); // Fail closed if the lock session died during persistence.
  };
  if (nearSigned) {
    const sponsor = requireOwnerPolicySponsor();
    return withSponsorKey(sponsor.accountId, async () => {
      // As the delegate's relayer the sponsor pays its storage deposit directly, so a NEAR owner
      // is never funded separately.
      await sponsor.assertBalance(nearSigned.delegate);
      return sponsor.submit(nearSigned.delegate, nearSigned.signatureHex, onBroadcast, () =>
        assertDispatchFence(actor.tenantId, agentId, operationId),
      );
    }).then((outcome) => ({ ...outcome, ...signingIdentity }));
  }
  const sponsor = requireWalletSponsor();
  if (!("msg" in signed)) throw new ApiError("wallet_request_type_mismatch", 409);
  return withSponsorKey(sponsor.accountId, async () => {
    await assertDispatchFence(actor.tenantId, agentId, operationId);
    // A `0s` wallet attaches the storage deposit from its own balance, so the sponsor funds it
    // first. Funding and relay are paid together; refuse both before either can take effect.
    await sponsor.relaySigned.assertBalance({ depositYocto: fundingDue, gas: 0n });
    await fund(sponsor.fundPolicyStorage, sponsor.accountId);
    await assertDispatchFence(actor.tenantId, agentId, operationId);
    return sponsor.relaySigned(signed.msg, signed.proof, onBroadcast);
  }).then((outcome) => ({ ...outcome, ...signingIdentity }));
}

/**
 * Verifies, claims and relays one prepared request. `afterVerify` runs once the signature is
 * proven locally and before anything is claimed, so a failure there leaves the request signable.
 * On return the transaction is final and the operation records `submitted` with its hash.
 */
export async function dispatchPreparedPolicy(input: {
  actor: Actor;
  agentId: string;
  operationId: string;
  signer: PolicySigner;
  prepared: PreparedPolicy;
  /** Stored operation result; fields outside the preparation schema are persisted unchanged. */
  stored: unknown;
  signed: SubmittedPolicy;
  afterVerify?: () => Promise<void>;
  afterClaim?: () => Promise<void>;
}) {
  const { actor, agentId, operationId, signer, prepared, signed } = input;
  if (!signer.ownerAccountId) throw new ApiError("agent_not_bound", 409);
  const nearSigned = verifySubmittedPolicy(signer, prepared, signed);
  await input.afterVerify?.();
  await reserveSponsorship(actor.tenantId, agentId, operationId);
  await assertDispatchFence(actor.tenantId, agentId, operationId);
  const dispatch = { ...(input.stored as object), ...prepared, status: "dispatching" as const };
  const funding: FundingState = { current: storedFunding(input.stored) };
  // A transfer never observed final may or may not have paid; reconciliation settles it first.
  if (fundingUnresolved(funding)) throw new ApiError("storage_funding_unresolved", 409);
  if (!(await claimPreparedWalletPolicy(actor.tenantId, agentId, operationId, dispatch)))
    throw new ApiError("policy_not_pending", 409);
  try {
    await input.afterClaim?.();
    const outcome = await relayPreparedPolicy({
      actor,
      agentId,
      operationId,
      ownerAccountId: signer.ownerAccountId,
      prepared,
      dispatch,
      nearSigned,
      signed,
      funding,
    });
    await commitSponsorship(operationId);
    await persistOperationResult(actor.tenantId, agentId, operationId, "policy", "uncertain", {
      ...dispatch,
      ...(funding.current ? { storage_funding: funding.current } : {}),
      status: "submitted",
      transaction_hash: outcome.transactionHash,
      sponsor_account_id: outcome.sponsor_account_id,
      sponsor_public_key: outcome.sponsor_public_key,
    });
    invalidatePolicyOwnerCache();
  } catch (error) {
    if (refusedBeforeBroadcast(error) && !fundingUnresolved(funding)) {
      // Keep the exact preparation signable, with any funding that completed; a transfer still
      // unobserved keeps the operation uncertain below instead.
      await persistOperationResult(actor.tenantId, agentId, operationId, "policy", "pending", {
        ...(input.stored as object),
        ...(funding.current ? { storage_funding: funding.current } : {}),
      });
      throw error;
    }
    // A funding transfer or wallet call may have broadcast. Keep reservation and operation.
    await commitSponsorship(operationId);
    // A broadcast whose finality was not observed in time is not a failed request: the persisted
    // hash stays `uncertain` and the caller's refresh reconciles it.
    if (isFinalityTimeout(error)) return;
    throw error;
  }
}

/** Stale delegates, a busy pool and an underfunded sponsor are refused before the relay leaves. */
function refusedBeforeBroadcast(error: unknown) {
  return (
    (error instanceof RelayError &&
      (error.code === "policy_delegate_expired" ||
        error.code === "sponsor_balance_insufficient")) ||
    (error instanceof ApiError && error.code === "sponsor_busy")
  );
}

function isFinalityTimeout(error: unknown) {
  return (
    error instanceof Error && (error as { code?: unknown }).code === "transaction_finality_timeout"
  );
}

/** Relay only request prepared for this policy revision and signed by its bound wallet. */
export async function submitOwnerPolicy(
  actor: Actor,
  agentId: string,
  operationId: string,
  signed: SignedWalletRequest | SignedNearPolicy,
) {
  const { agent } = await requireBoundAgent(actor, agentId);
  const operation = await findOperation(actor.tenantId, agentId, operationId);
  const prepared = preparedSchema.safeParse(operation?.result);
  if (
    operation?.kind !== "policy" ||
    operation.status !== "pending" ||
    !prepared.success ||
    prepared.data.status !== "pending_wallet_signature"
  )
    throw new ApiError("policy_not_pending", 409);
  await dispatchPreparedPolicy({
    actor,
    agentId,
    operationId,
    signer: agent,
    prepared: prepared.data,
    stored: operation.result,
    signed,
  });
  return reconcileOwnerPolicy(actor, agentId, operationId);
}
