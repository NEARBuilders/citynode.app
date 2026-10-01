import { type ExecutionRequest, executionResultSchema } from "@near-intents-agent-api/contracts";
import { OutlayerError } from "@near-intents-agent-api/outlayer";
import { getOutlayer } from "../../lib/outlayer.js";
import type { AssetPrice } from "../../lib/prices.js";
import { getPrices } from "../../lib/token-catalog.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { errorFields, logger } from "../../shared/logger.js";
import { requireReadyPolicy } from "../wallet/policy-readiness.js";
import type { CustodyWalletRecord } from "../wallet/repository.js";
import { custodyCredential } from "../wallet/service.js";
import { assertDispatchFence, commitDispatch, type DispatchReceipt } from "./dispatch-fence.js";
import { isProviderPreBroadcastRefusal } from "./outcome.js";
import { dispatchProviderExecution } from "./provider-dispatch.js";
import { depositAddressIssued } from "./provider-observation.js";
import { providerResult, readString } from "./provider-result.js";
import { chargeSpend, PriceRequired, refundSpend, spendOf } from "./spend-budget.js";

export async function dispatchExecution(
  actor: Actor,
  agentId: string,
  wallet: CustodyWalletRecord,
  input: ExecutionRequest,
  operationId: string,
) {
  // Admission recorded the epochs this operation was authorized under; re-check them at the
  // commitment point. A policy tightening, owner change or lifecycle change since admission
  // invalidates the pending authorization before any provider write happens.
  await assertDispatchFence(actor.tenantId, agentId, operationId);
  await requireReadyPolicy(actor.tenantId, agentId);
  // The commitment point: revocation that commits first refuses this write; one that commits
  // later reports the operation as committed. The owner's USD budget is decided and charged in the
  // same transaction, so a timelocked execution counts when it dispatches, not when it was queued.
  const receipt = await commitExecutionDispatch(actor, agentId, operationId, input);
  const response = await dispatchCountingSpend(actor, agentId, wallet, input, operationId, receipt);
  const projected = depositAddressIssued(input.action, providerResult(response));
  return executionResultSchema.parse({
    action: input.action,
    ...(confidentialRoute(input) ? { confidential: true } : {}),
    ...(input.action === "withdraw" ? { chain: input.request.chain } : {}),
    near_account_id: wallet.nearAccountId,
    provider_request_id: readString(response, "request_id"),
    ...projected,
    evidence: projected,
  });
}

/** Prices are fetched again at most this often when a quote expires while locks are awaited. */
const maxQuoteAttempts = 3;

/**
 * Commits dispatch and charges the budget atomically. A refusal, or a failure of any kind, leaves
 * neither a commitment nor a charge. Prices are read over the network, never inside the
 * transaction: an account never configured for USD tracking needs none. When tracking applies
 * and no price is at hand, the attempt rolls back, is priced outside any lock and decided again
 * from the top against the caps then in force.
 */
export async function commitExecutionDispatch(
  actor: Actor,
  agentId: string,
  operationId: string,
  input: ExecutionRequest,
): Promise<DispatchReceipt> {
  const spend = spendOf(input);
  let price: AssetPrice | undefined;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await commitDispatch(actor.tenantId, agentId, operationId, (tx, { agent, token }) =>
        chargeSpend(tx, agent, operationId, token, input, price),
      );
    } catch (error) {
      if (!(error instanceof PriceRequired) || !spend) throw error;
      if (attempt === maxQuoteAttempts) throw new ApiError("spend_price_unavailable", 503);
      price = await getPrices().price(spend.asset);
      if (!price) throw new ApiError("spend_price_unavailable", 503);
    }
  }
}

/**
 * The charge is refunded only when OutLayer refused the write before admitting it, and only by the
 * attempt that holds the commitment's receipt. Anything else may have moved value and stays
 * counted. An attempt that lost the commitment never reaches here, so it cannot refund the winner.
 */
async function dispatchCountingSpend(
  actor: Actor,
  agentId: string,
  wallet: CustodyWalletRecord,
  input: ExecutionRequest,
  operationId: string,
  receipt: DispatchReceipt,
) {
  try {
    return await dispatchProviderExecution(
      getOutlayer(),
      input,
      custodyCredential(wallet),
      operationId,
    );
  } catch (error) {
    if (spendOf(input) && error instanceof OutlayerError && isProviderPreBroadcastRefusal(error)) {
      // A failed refund leaves the charge counted, which only over-counts; the provider's refusal
      // is still the outcome to report.
      await refundSpend(actor.tenantId, agentId, operationId, receipt.token).catch((refundError) =>
        logger.error("spend_refund_failed", {
          operation_id: operationId,
          ...errorFields(refundError),
        }),
      );
    }
    throw error;
  }
}

/** Requests that `dispatchProviderExecution` sends to a `/confidential/*` provider route. */
function confidentialRoute(input: ExecutionRequest): boolean {
  return "confidential" in input.request && input.request.confidential === true;
}
