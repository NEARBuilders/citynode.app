import type { TransactionBuilder } from "near-kit";
import type { ApiClient, AuthClient } from "@/app";
import { getAccount, getActiveRuntime } from "@/app";
import { buildTenantPublishConfig } from "./dao-policy";

type SpawnTenantOutput = Awaited<ReturnType<ApiClient["spawnTenant"]>>;
type SpawnStatusOutput = Awaited<ReturnType<ApiClient["getSpawnStatus"]>>;

export type SpawnTenant = SpawnTenantOutput["tenant"];
export type SpawnBinding = SpawnTenantOutput["binding"];
export type SpawnStatus = SpawnStatusOutput;
export type PublishStatus = SpawnStatusOutput["publishStatus"];

const CONFIG_GAS = "300000000000000";

export function gatewayForAccount(accountId: string): string {
  return accountId.endsWith(".testnet") ? "testnet.citynode.app" : "citynode.app";
}

export function baseAccountForGateway(): string {
  return getAccount();
}

export function buildSpawnHostname(slug: string, ownerAccountId: string): string {
  return `${slug}.${gatewayForAccount(ownerAccountId)}`;
}

export async function spawnTenant(
  apiClient: ApiClient,
  input: { name: string; hostname: string },
): Promise<SpawnTenantOutput> {
  return apiClient.spawnTenant(input);
}

export async function getSpawnStatus(
  apiClient: ApiClient,
  tenantId: string,
): Promise<SpawnStatus | null> {
  try {
    return await apiClient.getSpawnStatus({ tenantId });
  } catch {
    return null;
  }
}

export interface PublishTenantInput {
  accountId: string;
  hostname: string;
  title: string;
  description?: string;
  repository?: string;
}

/**
 * Publishes the spawned tenant's config to FastKV: the config write is
 * prepared by the apps plugin, signed by the owner account (wallet or
 * passkey-derived executor) as a NEP-366 delegate action, and relayed
 * gaslessly. Meta-transactions preserve the original sender, so the row
 * lands under the owner's own namespace.
 */
export async function publishTenantConfig(
  apiClient: ApiClient,
  auth: AuthClient,
  input: PublishTenantInput,
): Promise<{ txHash: string | null }> {
  const connected = await auth.near.ensureConnected();
  if (!connected) {
    throw new Error("Connect a NEAR signer first");
  }

  const signerAccountId = auth.near.getAccountId();
  if (!signerAccountId) {
    throw new Error("Connect a NEAR signer first");
  }
  if (signerAccountId !== input.accountId) {
    throw new Error(
      `Connected account ${signerAccountId} cannot publish ${input.accountId}. Connect ${input.accountId}.`,
    );
  }

  const gatewayId = getActiveRuntime()?.gatewayId ?? "citynode.app";
  const config = buildTenantPublishConfig({
    daoAccountId: input.accountId,
    gatewayId,
    baseAccount: baseAccountForGateway(),
    hostname: input.hostname,
    title: input.title,
    description: input.description,
    ...(input.repository ? { repository: input.repository } : {}),
  });

  const prepared = await apiClient.apps.prepareRegistryConfigWrite({
    accountId: input.accountId,
    gatewayId,
    config: config as unknown as Record<string, unknown>,
  });

  const signed = await auth.near.buildSignedDelegateAction(
    prepared.data.contractId,
    (builder: TransactionBuilder, receiverId: string) =>
      builder.functionCall(receiverId, prepared.data.methodName, prepared.data.args, {
        gas: CONFIG_GAS,
        attachedDeposit: 0n,
      }),
  );

  const relayed = await auth.near.relayTransaction({ payload: signed as string });
  if (relayed.error) {
    throw new Error(relayed.error.message);
  }
  return { txHash: relayed.data?.txHash ?? null };
}
