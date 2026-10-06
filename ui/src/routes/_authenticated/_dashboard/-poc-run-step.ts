import { toast } from "sonner";
import type { useApiClient, useAuthClient } from "@/app";
import type { AppTranslator } from "@/i18n/catalogs";
import { AppActionError } from "@/i18n/error-message";
import { translateEnglishAppMessage } from "@/i18n/runtime";
import { publishDaoTenantConfig } from "@/lib/tenant-deploy";
import { proposeNodeApplication } from "./-node-application";
import {
  type DaoPlan,
  describePlan,
  type fetchActiveGovProposals,
  fetchDaoProposals,
  fetchGovProof,
  formatNear,
  proposeAsSession,
  signPlanAsDao,
  transferFromSessionWallet,
  txHash,
  VOTE_STORAGE_FEE_FALLBACK,
  VOTING_ACCOUNT,
  waitFor,
} from "./-poc-chain";
import type { PocFormValues } from "./-poc-form";
import type { PocLogger } from "./-poc-log-message";
import type { SignerKind, StationState, StepState } from "./-poc-stations";

type GovProposal = Awaited<ReturnType<typeof fetchActiveGovProposals>>[number];

export interface StepRunnerContext {
  apiClient: ReturnType<typeof useApiClient>;
  auth: ReturnType<typeof useAuthClient>;
  activeOrgId: string | null;
  sessionAccount: string | null;
  isAdmin: boolean;
  values: PocFormValues;
  slug: string;
  team: string;
  endowment: string;
  t?: AppTranslator;
  locale?: string;
  pool: string;
  gatewayId: string;
  baseAccount: string;
  tenantBinding: unknown;
  orgTenant: unknown;
  treasuryFunded: boolean;
  fundYocto: bigint;
  tenantUrl: string | null;
  govProposal: GovProposal | null;
  voteStorageFee: string | undefined;
  accountFor: (signer: SignerKind) => string | null;
  log: PocLogger;
  fetchPublishedNow: () => Promise<unknown>;
  precheckPlan: (station: StationState, step: StepState) => Promise<DaoPlan | null>;
  viaSessionProposal: (signer: SignerKind) => boolean;
}

/** Executes one step of a station as its declared signer. */
export function createStepRunner(ctx: StepRunnerContext) {
  const {
    t = translateEnglishAppMessage,
    locale = "en",
    apiClient,
    auth,
    activeOrgId,
    sessionAccount,
    isAdmin,
    values,
    slug,
    team,
    endowment,
    pool,
    gatewayId,
    baseAccount,
    tenantBinding,
    orgTenant,
    treasuryFunded,
    fundYocto,
    tenantUrl,
    govProposal,
    voteStorageFee,
    accountFor,
    log,
    fetchPublishedNow,
    precheckPlan,
    viaSessionProposal,
  } = ctx;
  return async (station: StationState, stepId: string) => {
    const step = station.steps.find((entry) => entry.id === stepId);
    if (!step) throw new AppActionError("error.action");
    const signerId = accountFor(station.def.signer);

    if (stepId === "propose") {
      if (!activeOrgId || !sessionAccount) throw new AppActionError("poc.organizationRequired");
      const result = await proposeNodeApplication(
        apiClient,
        {
          kind: "country",
          parentId: null,
          name: values.name.trim(),
          slug,
          motivation: t("lifecycle.prototypeMotivation", { name: values.name.trim() }),
        },
        { orgId: activeOrgId, daoAccountId: team, submitterAccountId: sessionAccount },
      );
      log(
        { messageId: "poc.applied", values: { slug: slug ?? "", account: sessionAccount ?? "" } },
        { messageId: "poc.proposalLog", values: { proposal: result.data.entityId ?? "" } },
      );
      return;
    }

    if (stepId === "approve") {
      if (!isAdmin) {
        throw new AppActionError("poc.adminRequired");
      }
      const current = await apiClient.proposals.getProposals({
        pluginId: "node",
        entityId: slug,
        limit: 1,
      });
      const proposal = current.data[0];
      if (!proposal) throw new AppActionError("poc.noApplication");
      let updatedAt = proposal.updatedAt;
      if (proposal.reviewStatus !== "approved") {
        const approved = await apiClient.proposals.approve({
          pluginId: "node",
          entityId: slug,
          expectedUpdatedAt: proposal.updatedAt,
        });
        updatedAt = approved.data.updatedAt;
        log({ messageId: "poc.applicationApproved", values: { slug: slug ?? "" } });
      }
      if (tenantBinding || orgTenant) {
        log({ messageId: "poc.applicationCreated" });
        return;
      }
      try {
        const node = await apiClient.applyNodeProposal({
          kind: "country",
          parentId: null,
          name: values.name.trim(),
          slug,
          motivation: t("lifecycle.prototypeMotivation", { name: values.name.trim() }),
          orgId: activeOrgId ?? "",
          accountId: team,
          submitterAccountId: sessionAccount ?? "",
          hostname: `${slug}.${gatewayId}`,
          ...(pool ? { poolAccountId: pool } : {}),
        });
        log(
          pool
            ? { messageId: "poc.nodeCreatedPool", values: { slug, pool } }
            : { messageId: "poc.nodeCreated", values: { slug } },
          {
            messageId: "poc.nodeLog",
            values: { node: node.nodeId ?? "" },
          },
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await apiClient.proposals
          .markApplyFailed({
            pluginId: "node",
            entityId: slug,
            expectedUpdatedAt: updatedAt,
            error: detail.slice(0, 4000),
          })
          .catch(() => {});
        throw error;
      }
      return;
    }

    if (stepId === "fund-treasury") {
      if (!team) throw new AppActionError("poc.teamConnectFirst");
      if (!sessionAccount) throw new AppActionError("poc.nearSignInFirst");
      if (!isAdmin) throw new AppActionError("poc.adminFunding");
      if (treasuryFunded) {
        log({ messageId: "poc.treasuryFunded" });
        return;
      }
      const result = await transferFromSessionWallet(auth.near, team, fundYocto);
      log(
        {
          messageId: "poc.funded",
          values: {
            team: team ?? "",
            amount: formatNear(fundYocto.toString(), locale) ?? "",
            account: sessionAccount ?? "",
          },
        },
        txHash(result),
      );
      return;
    }

    if (stepId === "publish") {
      const result = await publishDaoTenantConfig(apiClient, {
        daoAccountId: team,
        gatewayId,
        baseAccount,
        hostname: `${slug}.${gatewayId}`,
        title: values.name.trim() || slug,
      });
      const immediate = await waitFor(async () => !!(await fetchPublishedNow()), 30_000, 3_000);
      if (immediate) {
        log({ messageId: "poc.published", values: { team: team ?? "" } }, txHash(result));
        toast.success(
          t("lifecycle.configLiveNamed", {
            url: tenantUrl ?? `${slug}.${gatewayId}`,
          }),
        );
      } else {
        const latest = await fetchDaoProposals(team).catch(() => []);
        const detail =
          [txHash(result), latest[0] ? t("poc.proposalLog", { proposal: latest[0].id }) : null]
            .filter(Boolean)
            .join(" · ") || undefined;
        log({ messageId: "poc.publishSigned", values: { team: team ?? "" } }, detail);
        toast.info(t("poc.publishAwaiting"));
      }
      return;
    }

    if (stepId === "mark-applied") {
      if (!isAdmin) {
        log({ messageId: "poc.markAdminDeferred" });
        toast.info(t("poc.markAdminHint"));
        return;
      }
      const published = await fetchPublishedNow();
      if (!published) {
        log({ messageId: "poc.markConfigDeferred" });
        toast.info(t("poc.markVotesHint"));
        return;
      }
      const current = await apiClient.proposals.getProposals({
        pluginId: "node",
        entityId: slug,
        limit: 1,
      });
      const proposal = current.data[0];
      if (!proposal) throw new AppActionError("poc.applicationMissing");
      await apiClient.proposals.markApplied({
        pluginId: "node",
        entityId: slug,
        expectedUpdatedAt: proposal.updatedAt,
        appliedResourceId: slug,
      });
      log({ messageId: "poc.markedApplied", values: { slug: slug ?? "" } });
      return;
    }

    if (stepId === "vote") {
      if (!govProposal) throw new AppActionError("poc.noProposal");
      if (!signerId) throw new AppActionError("poc.teamWalletMissing");
      const proof = await fetchGovProof(signerId);
      if (!proof) throw new AppActionError("poc.venearMissing", { account: signerId ?? "" });
      const result = await signPlanAsDao(signerId, {
        kind: "call",
        receiverId: VOTING_ACCOUNT,
        methodName: "vote",
        args: {
          proposal_id: govProposal.id,
          vote: values.voteOption,
          merkle_proof: proof[0],
          v_account: proof[1],
        },
        gas: "300 Tgas",
        attachedDeposit: voteStorageFee ?? VOTE_STORAGE_FEE_FALLBACK,
      });
      log(
        {
          messageId: "poc.voted",
          values: {
            option: values.voteOption ?? "",
            proposal: govProposal.id ?? "",
            account: signerId ?? "",
          },
        },
        txHash(result),
      );
      return;
    }

    if (!step.plan) throw new AppActionError("error.action");
    if (!signerId) throw new AppActionError("poc.signerMissing");
    const plan = await precheckPlan(station, step);
    if (!plan) return;
    if (viaSessionProposal(station.def.signer)) {
      const description = `* Title: ${step.label} <br>* Summary: ${t("lifecycle.stagedSummary", { plan: describePlan(plan, t, locale) })}`;
      const result = await proposeAsSession(auth.near, endowment, plan, description);
      log(
        {
          messageId: "poc.staged",
          values: { account: endowment ?? "", plan: describePlan(plan, t, locale) ?? "" },
        },
        txHash(result),
      );
      return;
    }
    const result = await signPlanAsDao(signerId, plan);
    log(
      {
        messageId: "poc.signedPlan",
        values: { plan: describePlan(plan, t, locale) ?? "", account: signerId ?? "" },
      },
      txHash(result),
    );
  };
}
