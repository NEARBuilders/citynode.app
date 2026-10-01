import {
  custodyWallets,
  delayedExecutions,
  operationArtifacts,
} from "@near-intents-agent-api/database";
import { and, count, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import { getRuntime } from "../config/runtime.js";
import { getDatabase } from "../lib/db.js";
import { openSecret, type SecretContext, sealSecret } from "./secrets.js";

const batchSize = 100;

/** Rewrap one locked batch. A failed decrypt aborts the transaction without dropping ciphertext. */
export async function rewrapSecretsBatch(): Promise<{ wallets: number; jobs: number }> {
  const active = getRuntime().secretEncryptionActiveKeyId ?? "env:v1";
  return getDatabase().transaction(async (tx) => {
    const wallets = await tx
      .select()
      .from(custodyWallets)
      .where(ne(custodyWallets.credentialKeyId, active))
      .limit(batchSize)
      .for("update", { skipLocked: true });
    for (const wallet of wallets) {
      const context: SecretContext = {
        schemaVersion: 1,
        tenantId: wallet.tenantId,
        agentId: wallet.agentId,
        walletId: wallet.id,
        providerId: wallet.providerWalletId || undefined,
        purpose: "outlayer.custody_credential",
      };
      const value = openSecret(
        {
          ciphertext: wallet.credentialCiphertext,
          nonce: wallet.credentialNonce,
          keyId: wallet.credentialKeyId,
        },
        context,
      );
      const sealed = sealSecret(value, context);
      await tx
        .update(custodyWallets)
        .set({
          credentialCiphertext: sealed.ciphertext,
          credentialNonce: sealed.nonce,
          credentialKeyId: sealed.keyId,
        })
        .where(eq(custodyWallets.id, wallet.id));
    }

    const jobs = await tx
      .select()
      .from(delayedExecutions)
      .where(
        and(
          isNotNull(delayedExecutions.ciphertext),
          or(isNull(delayedExecutions.keyId), ne(delayedExecutions.keyId, active)),
        ),
      )
      .limit(batchSize)
      .for("update", { skipLocked: true });
    for (const job of jobs) {
      if (!job.ciphertext || !job.nonce || !job.keyId) throw new Error("timelock_payload_missing");
      const context: SecretContext = {
        schemaVersion: 1,
        tenantId: job.tenantId,
        agentId: job.agentId,
        walletId: "",
        purpose: "delayed_execution",
        operationId: job.id,
        grantId: job.grantId,
        ownerEpoch: job.ownerEpoch,
      };
      const sealed = sealSecret(
        openSecret({ ciphertext: job.ciphertext, nonce: job.nonce, keyId: job.keyId }, context),
        context,
      );
      await tx
        .update(delayedExecutions)
        .set({ ciphertext: sealed.ciphertext, nonce: sealed.nonce, keyId: sealed.keyId })
        .where(
          and(
            eq(delayedExecutions.tenantId, job.tenantId),
            eq(delayedExecutions.agentId, job.agentId),
            eq(delayedExecutions.id, job.id),
          ),
        );
    }

    return { wallets: wallets.length, jobs: jobs.length };
  });
}

/** Old key material must remain available until every count reaches zero. */
export async function staleSecretCounts() {
  const active = getRuntime().secretEncryptionActiveKeyId ?? "env:v1";
  const [walletRows, jobRows, artifactRows] = await Promise.all([
    getDatabase()
      .select({ total: count() })
      .from(custodyWallets)
      .where(ne(custodyWallets.credentialKeyId, active)),
    getDatabase()
      .select({ total: count() })
      .from(delayedExecutions)
      .where(
        and(
          isNotNull(delayedExecutions.ciphertext),
          or(isNull(delayedExecutions.keyId), ne(delayedExecutions.keyId, active)),
        ),
      ),
    getDatabase()
      .select({ total: count() })
      .from(operationArtifacts)
      .where(
        and(
          isNotNull(operationArtifacts.ciphertext),
          or(isNull(operationArtifacts.keyId), ne(operationArtifacts.keyId, active)),
        ),
      ),
  ]);
  return {
    wallets: walletRows[0]?.total ?? 0,
    jobs: jobRows[0]?.total ?? 0,
    artifacts: artifactRows[0]?.total ?? 0,
  };
}
