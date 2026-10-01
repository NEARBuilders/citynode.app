import type {
  AgentDeletePreview,
  ApprovalDetail,
  AgentView as DomainAgentView,
  BalanceEntry as DomainBalanceEntry,
  BudgetView as DomainBudgetView,
  AgentGrantView as DomainGrantView,
  LimitsView as DomainLimitsView,
  PolicyHistory as DomainPolicyHistory,
  PolicyView as DomainPolicyView,
  ScheduledExecution as DomainScheduledExecution,
  TimelockView as DomainTimelockView,
  SigningArtifactDelivery,
  Wallet,
} from "@near-intents-agent-api/contracts";
import type {
  AgentView,
  ApprovalView,
  BalanceEntry,
  BudgetView,
  DeletionPreview,
  GrantView,
  LimitsView,
  PolicyHistoryView,
  PolicyView,
  ScheduledPage,
  SignatureDelivery,
  TimelockView,
  WalletView,
} from "@near-intents-agent-api/contracts/api";
import { camelRecord } from "./camel.js";

/** Domain read models → public camelCase views. */

export function walletView(wallet: Wallet): WalletView {
  return {
    walletId: wallet.wallet_id,
    nearAccountId: wallet.near_account_id,
    evmAddress: wallet.evm_address,
  };
}

export function agentView(agent: DomainAgentView): AgentView {
  return {
    id: agent.id,
    name: agent.name,
    externalUserId: agent.externalUserId,
    status: agent.status.toUpperCase() as AgentView["status"],
    archived: agent.archived ?? agent.status === "archived",
    deleted: agent.deleted,
    owner: agent.ownerWallet,
    ownerAccount: agent.ownerNear,
    wallet: agent.wallet ? walletView(agent.wallet) : null,
    createdAt: agent.createdAt,
  };
}

export function balanceEntry(entry: DomainBalanceEntry): BalanceEntry {
  return entry;
}

export function policyView(view: DomainPolicyView): PolicyView {
  return {
    walletId: view.wallet_id,
    revision: view.revision,
    policyHash: view.policy_hash,
    status: view.status.toUpperCase() as PolicyView["status"],
    appliedAt: view.applied_at,
    transactionHash: view.transaction_hash,
    providerPolicySynced: view.provider_policy_synced,
    policy: view.policy,
  };
}

export function policyHistoryView(history: DomainPolicyHistory): PolicyHistoryView {
  return {
    data: history.policies.map((entry) => ({
      walletId: entry.wallet_id,
      revision: entry.revision,
      policyHash: entry.policy_hash,
      status: entry.status.toUpperCase() as PolicyView["status"],
      appliedAt: entry.applied_at,
      transactionHash: entry.transaction_hash,
      policy: entry.policy,
    })),
    nextCursor: history.next_before_revision,
  };
}

export function limitsView(view: DomainLimitsView): LimitsView {
  return {
    walletId: view.wallet_id,
    frozen: view.frozen,
    capabilities: view.capabilities,
    limits: view.limits,
    rateLimit: view.rate_limit,
    addresses: view.addresses,
    allowedTokens: view.allowed_tokens,
    transactionTypes: view.transaction_types,
    approval: view.approval,
    policySynced: view.policy_synced,
  };
}

export function grantView(grant: DomainGrantView): GrantView {
  return {
    grantId: grant.grant_id,
    agentId: grant.agent_id,
    walletId: grant.wallet_id,
    label: grant.label,
    actions: grant.actions,
    recipients: grant.recipients,
    signingAudiences: grant.signing_audiences,
    issuedAt: grant.issued_at,
    expiresAt: grant.expires_at,
    revokedAt: grant.revoked_at,
    revokedReason: grant.revoked_reason,
    ownerEpoch: grant.owner_epoch,
    ownerMessage: grant.owner_message,
  };
}

export function timelockView(view: DomainTimelockView): TimelockView {
  return {
    delaySeconds: view.delay_seconds,
    revision: view.revision,
    scheduledCount: view.scheduled_count,
    enforcedBy: view.enforced_by,
  };
}

export function scheduledPage(page: {
  scheduled: DomainScheduledExecution[];
  next_cursor: string | null;
}): ScheduledPage {
  return {
    data: page.scheduled.map((entry) => ({
      correlationId: entry.operation_id,
      executeAfter: entry.execute_after,
      state: entry.state,
      action: entry.action,
    })),
    nextCursor: page.next_cursor,
  };
}

export function budgetView(view: DomainBudgetView): BudgetView {
  const window = (usage: DomainBudgetView["daily"]): BudgetView["daily"] => ({
    limitUsd: usage.limit_usd,
    spentUsd: usage.spent_usd,
    remainingUsd: usage.remaining_usd,
    resetsAt: usage.resets_at,
  });
  return {
    daily: window(view.daily),
    weekly: window(view.weekly),
    monthly: window(view.monthly),
    revision: view.revision,
    enforcedBy: view.enforced_by,
  };
}

export function approvalView(approval: ApprovalDetail): ApprovalView {
  return {
    approvalId: approval.id,
    walletId: approval.wallet_id,
    walletPubkey: approval.wallet_pubkey,
    requestHash: approval.request_hash,
    status: approval.status.toUpperCase() as ApprovalView["status"],
    requestType: approval.request_type,
    requestData: camelRecord(approval.request_data),
    requiredApprovals: approval.required_approvals,
    expiresAt: approval.expires_at,
  };
}

export function deletionPreview(preview: AgentDeletePreview): DeletionPreview {
  return {
    nearAccountId: preview.near_account_id,
    beneficiary: preview.beneficiary,
    nativeBalance: preview.native_balance,
    public: preview.public.map(balanceEntry),
    confidential: preview.confidential.map(balanceEntry),
    assetsLost: preview.assets_lost,
    retirement: preview.retirement,
    policyAllowsDelete: preview.policy_allows_delete,
  };
}

export function signatureDelivery(delivery: SigningArtifactDelivery): SignatureDelivery {
  const artifact = delivery.artifact;
  return {
    correlationId: delivery.operation_id,
    artifact:
      "near_account_id" in artifact
        ? {
            chain: "near",
            nearAccountId: artifact.near_account_id,
            publicKey: artifact.public_key,
            recipient: artifact.recipient,
            nonce: artifact.nonce,
            signature: artifact.signature,
          }
        : {
            chain: "evm",
            evmAddress: artifact.evm_address,
            signature: artifact.signature,
          },
    expiresAt: delivery.expires_at,
  };
}
