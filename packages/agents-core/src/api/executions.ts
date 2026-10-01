import type { ExecutionRequest } from "@near-intents-agent-api/contracts";
import type {
  balanceMoveRequestSchema,
  depositRequestSchema,
  QuoteResponse,
  recoverRequestSchema,
  StatusResponse,
  swapRequestSchema,
  transferRequestSchema,
  withdrawRequestSchema,
} from "@near-intents-agent-api/contracts/api";
import type { z } from "zod";
import { operationStatus } from "../modules/intents/status.js";
import { execute, recoverExecution } from "../modules/operations/execution-service.js";
import { findOperation } from "../modules/operations/repository.js";
import { queryWallet } from "../modules/wallet/query-service.js";
import type { Actor } from "../shared/actor.js";
import { ApiError } from "../shared/errors.js";
import { camelRecord } from "./camel.js";

/**
 * Public execution bodies (1Click field names) mapped onto the internal typed execution request
 * that grant checks, timelocks and provider dispatch already enforce.
 */

type Swap = z.output<typeof swapRequestSchema>;
type Withdraw = z.output<typeof withdrawRequestSchema>;
type Transfer = z.output<typeof transferRequestSchema>;
type BalanceMove = z.output<typeof balanceMoveRequestSchema>;
type Deposit = z.output<typeof depositRequestSchema>;
type Recover = z.output<typeof recoverRequestSchema>;

export function swapExecution(body: Swap, idempotencyKey: string): ExecutionRequest {
  return {
    action: "swap",
    request: {
      token_in: body.originAsset,
      token_out: body.destinationAsset,
      amount_in: body.amount,
      ...(body.minAmountOut === undefined ? {} : { min_amount_out: body.minAmountOut }),
      ...(body.confidential ? { confidential: true } : {}),
      idempotencyKey,
    },
  };
}

export function withdrawExecution(body: Withdraw, idempotencyKey: string): ExecutionRequest {
  return {
    action: "withdraw",
    request: {
      token: body.asset,
      amount: body.amount,
      chain: body.chain,
      to: body.recipient,
      ...(body.memo === undefined ? {} : { memo: body.memo }),
      ...(body.confidential ? { confidential: true } : {}),
      ...(body.async ? { async: true } : {}),
      idempotencyKey,
    },
  };
}

export function transferExecution(body: Transfer, idempotencyKey: string): ExecutionRequest {
  return {
    action: body.confidential ? "confidential_transfer" : "intents_transfer",
    request: { token: body.asset, amount: body.amount, to: body.recipient, idempotencyKey },
  };
}

export function balanceMoveExecution(
  action: "shield" | "unshield" | "confidential_deposit",
  body: BalanceMove,
  idempotencyKey: string,
): ExecutionRequest {
  return { action, request: { token: body.asset, amount: body.amount, idempotencyKey } };
}

export function depositExecution(body: Deposit, idempotencyKey: string): ExecutionRequest {
  return {
    action: "cross_chain_deposit",
    request: {
      ...(body.originAsset === undefined ? {} : { source_asset: body.originAsset }),
      ...(body.destinationAsset === undefined ? {} : { destination_asset: body.destinationAsset }),
      amount: body.amount,
      ...(body.chain === undefined ? {} : { chain: body.chain }),
      ...(body.asset === undefined ? {} : { token: body.asset }),
      ...(body.refundTo === undefined ? {} : { refund_address: body.refundTo }),
      ...(body.confidential ? { confidential: true } : {}),
      idempotencyKey,
    },
  };
}

export function recoverExecutionRequest(body: Recover, idempotencyKey: string): ExecutionRequest {
  const { type, ...request } = body.request;
  switch (type) {
    case "swap":
      return swapExecution(request as Swap, idempotencyKey);
    case "withdraw":
      return withdrawExecution(request as Withdraw, idempotencyKey);
    case "transfer":
      return transferExecution(request as Transfer, idempotencyKey);
    case "shield":
    case "unshield":
    case "confidential_deposit":
      return balanceMoveExecution(type, request as BalanceMove, idempotencyKey);
  }
}

async function statusOf(actor: Actor, agentId: string, operationId: string) {
  const operation = await findOperation(actor.tenantId, agentId, operationId);
  if (!operation) throw new ApiError("operation_not_found", 404);
  return operationStatus(operation);
}

export async function runExecution(
  actor: Actor,
  agentId: string,
  request: ExecutionRequest,
  grantToken: string | undefined,
): Promise<StatusResponse> {
  const operation = await execute(actor, agentId, request, { token: grantToken });
  return statusOf(actor, agentId, operation.id);
}

export async function runRecovery(
  actor: Actor,
  agentId: string,
  correlationId: string,
  request: ExecutionRequest,
  grantToken: string | undefined,
): Promise<StatusResponse> {
  await recoverExecution(actor, agentId, correlationId, request, grantToken);
  return statusOf(actor, agentId, correlationId);
}

export async function swapQuote(actor: Actor, agentId: string, body: Swap): Promise<QuoteResponse> {
  const result = await queryWallet(actor, agentId, {
    query: "swap_quote",
    request: {
      token_in: body.originAsset,
      token_out: body.destinationAsset,
      amount_in: body.amount,
      ...(body.minAmountOut === undefined ? {} : { min_amount_out: body.minAmountOut }),
      confidential: body.confidential,
    },
  });
  return { dry: true, type: "swap", quote: camelRecord(result.data) };
}

export async function withdrawQuote(
  actor: Actor,
  agentId: string,
  body: Withdraw,
): Promise<QuoteResponse> {
  const result = await queryWallet(actor, agentId, {
    query: "withdraw_preview",
    request: {
      token: body.asset,
      amount: body.amount,
      chain: body.chain,
      to: body.recipient,
      ...(body.memo === undefined ? {} : { memo: body.memo }),
      confidential: body.confidential,
    },
  });
  return { dry: true, type: "withdraw", quote: camelRecord(result.data) };
}
