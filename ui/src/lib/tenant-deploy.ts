import type { ApiClient } from "@/app";
import { buildTenantPublishConfig, type SignAsDaoSpec, signAsDaoTransaction } from "./dao-connect";

export interface DaoTenantPublishInput {
  daoAccountId: string;
  gatewayId: string;
  baseAccount: string;
  hostname: string;
  title: string;
  status?: "active" | "suspended" | "pending_deletion";
}

export interface TenantConfigWriteInput {
  accountId: string;
  gatewayId: string;
  baseAccount: string;
  hostname: string;
  title: string;
  status?: "active" | "suspended" | "pending_deletion";
}

export type DaoTransactionSigner = (daoAccountId: string, spec: SignAsDaoSpec) => Promise<unknown>;

export async function prepareTenantConfigWrite(
  apiClient: ApiClient,
  input: TenantConfigWriteInput,
) {
  const config = buildTenantPublishConfig({
    daoAccountId: input.accountId,
    gatewayId: input.gatewayId,
    baseAccount: input.baseAccount,
    hostname: input.hostname,
    title: input.title,
    ...(input.status ? { status: input.status } : {}),
  });
  return apiClient.apps.prepareRegistryConfigWrite({
    accountId: input.accountId,
    gatewayId: input.gatewayId,
    config: config as unknown as Record<string, unknown>,
  });
}

export async function publishDaoTenantConfig(
  apiClient: ApiClient,
  input: DaoTenantPublishInput,
  signTransaction: DaoTransactionSigner = signAsDaoTransaction,
) {
  const prepared = await prepareTenantConfigWrite(apiClient, {
    accountId: input.daoAccountId,
    gatewayId: input.gatewayId,
    baseAccount: input.baseAccount,
    hostname: input.hostname,
    title: input.title,
    ...(input.status ? { status: input.status } : {}),
  });

  return signTransaction(input.daoAccountId, {
    receiverId: prepared.data.contractId,
    methodName: prepared.data.methodName,
    args: prepared.data.args as unknown as Record<string, unknown>,
    gas: prepared.data.gas,
    attachedDeposit: prepared.data.attachedDeposit,
  });
}
