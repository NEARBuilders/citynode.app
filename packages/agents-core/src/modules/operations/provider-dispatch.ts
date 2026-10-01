import type { ExecutionRequest } from "@near-intents-agent-api/contracts";
import type { OutlayerWalletClient } from "@near-intents-agent-api/outlayer";

type Credential = string;

/** Translate canonical execution actions into the provider's wallet operations. */
export function dispatchProviderExecution(
  client: OutlayerWalletClient,
  input: ExecutionRequest,
  credential: Credential,
  operationId: string,
): Promise<unknown> {
  switch (input.action) {
    case "cross_chain_deposit":
      return input.request.confidential
        ? client.confidentialDepositCrossChain(credential, {
            amount: input.request.amount,
            chain: input.request.chain,
            refundAddress: input.request.refund_address,
            sourceAsset: input.request.source_asset,
          })
        : client.intentsDepositCrossChain(credential, {
            amount: input.request.amount,
            chain: input.request.chain,
            destinationAsset: input.request.destination_asset,
            refundAddress: input.request.refund_address,
            sourceAsset: input.request.source_asset,
            token: input.request.token,
          });
    case "intents_transfer":
    case "confidential_transfer":
    case "confidential_deposit": {
      const paths = {
        intents_transfer: "intents/transfer",
        confidential_transfer: "confidential/transfer",
        confidential_deposit: "confidential/deposit",
      } as const;
      const { idempotencyKey: _key, ...body } = input.request;
      return client.walletExecution(paths[input.action], credential, body, operationId);
    }
    case "swap": {
      const body = {
        amountIn: input.request.amount_in,
        minAmountOut: input.request.min_amount_out,
        tokenIn: input.request.token_in,
        tokenOut: input.request.token_out,
      };
      return input.request.confidential
        ? client.confidentialSwap(credential, body, operationId)
        : client.intentsSwap(credential, body, operationId);
    }
    case "withdraw": {
      const body = {
        amount: input.request.amount,
        async: input.request.async,
        chain: input.request.chain,
        memo: input.request.memo,
        token: input.request.token,
        to: input.request.to,
      };
      return input.request.confidential
        ? client.confidentialWithdraw(credential, body, operationId)
        : client.intentsWithdraw(credential, body, operationId);
    }
    case "shield":
      return client.confidentialShield(
        credential,
        { amount: input.request.amount, token: input.request.token },
        operationId,
      );
    case "unshield":
      return client.confidentialUnshield(
        credential,
        { amount: input.request.amount, token: input.request.token },
        operationId,
      );
  }
}

/**
 * Whether the OutLayer route `dispatchProviderExecution` uses for this request accepts the
 * operation id as its idempotency key, so a resubmission is reported as a duplicate of the
 * original request instead of executing again. Cross-chain deposit routes accept no key, so their
 * wrappers send none and neither the transport nor recovery ever resubmits them.
 */
export function providerDeduplicatesResubmission(input: ExecutionRequest): boolean {
  switch (input.action) {
    case "cross_chain_deposit":
      return false;
    default:
      return true;
  }
}
