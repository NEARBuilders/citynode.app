import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildTenantUrl, getAccount, getGatewayId, useApiClient, useAuthClient } from "@/app";
import { AppActionError } from "@/i18n/error-message";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import {
  describeDaoError,
  isExplicitDaoMember,
  useDaoAutoRestore,
  useDaoConnection,
  verifyDaoAccount,
} from "@/lib/dao-connect";
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { generateSlug } from "@/lib/slug";
import { useNearAccount } from "@/lib/use-near-account";
import { parseNodeProposalPayload } from "./-node-application";
import {
  approveProposalPlan,
  canAccountPropose,
  fetchAccountBalance,
  fetchActiveGovProposals,
  fetchDaoProposals,
  fetchGovVoteRecord,
  fetchLockupAccountId,
  fetchLockupState,
  fetchPoolMeta,
  fetchSputnikPolicy,
  fetchVenearAccount,
  fetchVoteStorageFee,
  getNear,
  isPositive,
  LOCKUP_DEPLOY_DEPOSIT,
  lockupAvailableYocto,
  meetsTeamStakeMinimum,
  type PoolAccountView,
  parseNearAmount,
  signPlanAsDao,
  txHash,
  WHITELIST_ACCOUNT,
  yoctoArg,
} from "./-poc-chain";
import { buildPocFormValues, prefillIfEmpty, usePocForm, usePocFormValues } from "./-poc-form";
import type { PocLogDetail, PocLogMessage } from "./-poc-log-message";
import { createPrecheckPlan } from "./-poc-precheck";
import { createStepRunner } from "./-poc-run-step";
import {
  buildStations,
  type ChainFacts,
  deriveStations,
  nextStation,
  pendingProposalCount,
  runnableRun,
  type SignerKind,
  type StationId,
  type StationState,
  teamTreasuryRequirementYocto,
} from "./-poc-stations";

const REFETCH_MS = 15_000;
export const TREZU_CREATE_URL = "https://trezu.app/create";
export const HOS_URL = "https://gov.houseofstake.org";
export const POOL_PLACEHOLDER = "everything.pool.near";
const TREASURY_FUND_FLOOR_YOCTO = 4n * 10n ** 24n;
const TREASURY_FUND_BUFFER_YOCTO = 10n ** 24n;
export const hosDelegateUrl = (accountId: string) => `${HOS_URL}/delegates/${accountId}`;

export interface LogEntry {
  id: string;
  at: number;
  label: PocLogMessage;
  detail?: PocLogDetail;
}

/** "near builders" → "Near Builders" — the default node name from the org name. */
const titleCase = (value: string) =>
  value.replace(/(^|[\s-])[a-z]/g, (match) => match.toUpperCase());

type RuntimeConfig = Parameters<typeof getAccount>[0];

export interface PocRouteAuth {
  activeOrganizationId: string | null;
  isAdmin: boolean;
}

/** Every query, derived fact, and signed action behind the node lifecycle walkthrough. */
export function usePocLifecycle(routeAuth: PocRouteAuth, runtimeConfig: RuntimeConfig) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const sessionAccount = useNearAccount();
  useDaoAutoRestore(sessionAccount);
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const connection = useDaoConnection();
  const queryClient = useQueryClient();

  const gatewayId = getGatewayId(runtimeConfig);
  const baseAccount = getAccount(runtimeConfig);
  const activeOrgId = routeAuth.activeOrganizationId;
  const isAdmin = routeAuth.isAdmin;

  const initialFormValues = useMemo(() => buildPocFormValues(activeOrgId), [activeOrgId]);
  const form = usePocForm(activeOrgId, initialFormValues);
  const values = usePocFormValues(form);

  const [connectedTeamDao, setConnectedTeamDao] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [runningStation, setRunningStation] = useState<StationId | null>(null);
  const [failures, setFailures] = useState<
    Partial<Record<StationId, { error: unknown; account: string }>>
  >({});

  const log = (label: PocLogMessage, detail?: PocLogDetail) => {
    setEntries((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          at: Date.now(),
          label,
          detail,
        },
        ...prev,
      ].slice(0, 40),
    );
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["poc"] });

  /* ------------------------------------------------------------------ queries */

  const { data: organizations = [] } = useQuery(organizationsQueryOptions(apiClient));

  const activeOrg = organizations.find((org) => org.id === activeOrgId);
  const activeOrgName = activeOrg?.name ?? null;
  /** An org can override the name its node gets with `metadata.name`. */
  const orgNamePrefill = (() => {
    const override = activeOrg?.metadata?.name;
    if (typeof override === "string" && override.trim()) return override.trim();
    return activeOrgName ? titleCase(activeOrgName) : null;
  })();

  const lastOrgId = useRef<string | null>(null);
  const lastPrefillKey = useRef<string | null>(null);
  useEffect(() => {
    const prefillKey = `${activeOrgId ?? ""}:${orgNamePrefill ?? ""}`;
    if (activeOrgId === lastOrgId.current && prefillKey === lastPrefillKey.current) return;
    const orgChanged = lastOrgId.current !== activeOrgId;
    lastOrgId.current = activeOrgId;
    lastPrefillKey.current = prefillKey;
    if (orgChanged) {
      setFailures({});
      setConnectedTeamDao(null);
    }
    form.reset(buildPocFormValues(activeOrgId, orgNamePrefill ? { name: orgNamePrefill } : {}));
  }, [activeOrgId, orgNamePrefill, form]);

  const poc = <T>(key: readonly unknown[], queryFn: () => Promise<T>, enabled = true) =>
    ({ queryKey: ["poc", ...key], queryFn, enabled, refetchInterval: REFETCH_MS }) as const;

  /** Org-linked DAO wins; the application payload keeps it stable once proposed. */
  const { data: orgDao } = useQuery(
    poc(
      ["org-dao", activeOrgId],
      () => apiClient.auth.getDao({ organizationId: activeOrgId ?? "" }).catch(() => null),
      !!activeOrgId,
    ),
  );
  const orgDaoAccountId = orgDao?.daoAccountId ?? null;

  /** The node slug is pinned to the organization; the node name is the custom part. */
  const slug = generateSlug(activeOrg?.slug ?? "");

  const { data: application } = useQuery(
    poc(
      ["application", slug],
      async () => {
        const result = await apiClient.proposals.getProposals({
          pluginId: "node",
          entityId: slug,
          limit: 1,
        });
        return result.data[0] ?? null;
      },
      !!slug,
    ),
  );
  const proposedDaoAccountId = useMemo(() => {
    if (!application) return null;
    try {
      return parseNodeProposalPayload(application.payload).accountId;
    } catch {
      return null;
    }
  }, [application]);

  const team = orgDaoAccountId ?? proposedDaoAccountId ?? connectedTeamDao ?? "";
  const endowment = values.endowmentLinked ? team : values.endowment.trim();
  const pool = values.pool.trim();
  const treasuriesShared = !!team && team === endowment;

  const sponsorYocto = useMemo(() => parseNearAmount(values.sponsorAmount), [values.sponsorAmount]);
  const sponsorStakeYocto = sponsorYocto;

  const { data: teamVe } = useQuery(poc(["venear", team], () => fetchVenearAccount(team), !!team));
  const { data: endowmentVe } = useQuery(
    poc(["venear", endowment], () => fetchVenearAccount(endowment), !!endowment),
  );
  const { data: teamLockupId } = useQuery(
    poc(["lockup-id", team], () => fetchLockupAccountId(team), !!team),
  );
  const teamLockup = teamLockupId ?? "";
  const { data: endowmentLockupId } = useQuery(
    poc(["lockup-id", endowment], () => fetchLockupAccountId(endowment), !!endowment),
  );
  const endowmentLockup = endowmentLockupId ?? "";

  const { data: teamLockupState } = useQuery(
    poc(["lockup-state", teamLockup], () => fetchLockupState(teamLockup), !!teamLockup),
  );
  const { data: endowmentLockupState } = useQuery(
    poc(
      ["lockup-state", endowmentLockup],
      () => fetchLockupState(endowmentLockup),
      !!endowmentLockup,
    ),
  );
  const { data: endowmentLockupBalance } = useQuery(
    poc(
      ["lockup-balance", endowmentLockup],
      () => fetchAccountBalance(endowmentLockup),
      !!endowmentLockup,
    ),
  );
  /** The lockup can stake its balance minus the storage reserve it refuses to spend. */
  const endowmentAvailableYocto = useMemo(
    () => (endowmentLockupBalance == null ? null : lockupAvailableYocto(endowmentLockupBalance)),
    [endowmentLockupBalance],
  );
  const { data: poolMeta } = useQuery(poc(["pool-meta", pool], () => fetchPoolMeta(pool), !!pool));
  const { data: teamPoolAccount } = useQuery(
    poc(
      ["pool-account", pool, team],
      () => getNear().view<PoolAccountView>(pool, "get_account", { account_id: team }),
      !!pool && !!team,
    ),
  );
  const { data: endowmentPoolAccount } = useQuery(
    poc(
      ["pool-account", pool, endowmentLockup],
      () => getNear().view<PoolAccountView>(pool, "get_account", { account_id: endowmentLockup }),
      !!pool && !!endowmentLockup,
    ),
  );
  const { data: whitelisted } = useQuery(
    poc(
      ["whitelist", pool],
      () =>
        getNear().view<boolean>(WHITELIST_ACCOUNT, "is_whitelisted", {
          staking_pool_account_id: pool,
        }),
      !!pool,
    ),
  );
  const { data: treasuryBalance } = useQuery(
    poc(["treasury-balance", team], () => fetchAccountBalance(team), !!team),
  );
  const { data: voteStorageFee } = useQuery({
    queryKey: ["poc", "vote-fee"],
    queryFn: fetchVoteStorageFee,
  });
  const { data: govProposals = [] } = useQuery(poc(["gov-proposals"], fetchActiveGovProposals));
  const { data: daoPolicyForAudit } = useQuery(
    poc(["audit-policy", team], () => fetchSputnikPolicy(team), !!team),
  );
  const { data: endowmentPolicy } = useQuery(
    poc(["policy", endowment], () => fetchSputnikPolicy(endowment), !!endowment),
  );
  const { data: teamPolicy } = useQuery(
    poc(["policy", team], () => fetchSputnikPolicy(team), !!team),
  );
  const { data: endowmentProposals = [] } = useQuery(
    poc(["dao-proposals", endowment], () => fetchDaoProposals(endowment), !!endowment),
  );
  const { data: teamProposals = [] } = useQuery(
    poc(["dao-proposals", team], () => fetchDaoProposals(team), !!team),
  );

  const govProposal =
    govProposals.find((p) => String(p.id) === values.govProposalId) ?? govProposals[0] ?? null;

  const { data: voteRecord } = useQuery(
    poc(
      ["vote-record", team, govProposal?.id],
      () => fetchGovVoteRecord(team, govProposal?.id ?? -1),
      !!team && !!govProposal,
    ),
  );
  const { data: tenantBinding } = useQuery(
    poc(
      ["binding", slug],
      () => apiClient.resolveBindingByHostname({ hostname: `${slug}.${gatewayId}` }),
      !!slug && !!gatewayId,
    ),
  );
  const { data: registryApp } = useQuery(
    poc(
      ["registry-app", team, gatewayId],
      async () => {
        if (!team || !gatewayId) return null;
        try {
          const result = await apiClient.registry.getRegistryApp({
            accountId: team,
            gatewayId,
          });
          return result.data ?? null;
        } catch {
          return null;
        }
      },
      !!team && !!gatewayId,
    ),
  );

  /** Conflict preflight: one DAO owns at most one tenant, and one org one node. */
  const { data: tenantByDao } = useQuery(
    poc(["tenant-by-dao", team], () => apiClient.resolveTenant({ accountId: team }), !!team),
  );
  const { data: orgTenant } = useQuery(
    poc(
      ["tenant-by-org", activeOrgId],
      () => apiClient.resolveTenantByOrgId({ orgId: activeOrgId ?? "" }).catch(() => null),
      !!activeOrgId,
    ),
  );

  /** The admin-assigned pool, once the node exists: its default staking validator. */
  const { data: nodeBySlug } = useQuery(
    poc(
      ["node-by-slug", slug],
      () => apiClient.resolveNodeBySlug({ slug }).catch(() => null),
      !!slug,
    ),
  );
  const { data: stakingValidators } = useQuery(
    poc(
      ["staking-validators", nodeBySlug?.id],
      () => apiClient.resolveStakingValidators({ nodeId: nodeBySlug?.id ?? "" }),
      !!nodeBySlug?.id,
    ),
  );
  const savedPool =
    stakingValidators?.validators.find((validator) => validator.isDefault)?.accountId ??
    stakingValidators?.validators[0]?.accountId ??
    null;

  useEffect(() => {
    prefillIfEmpty(form, "pool", savedPool ?? "");
  }, [form, savedPool]);

  /* -------------------------------------------------------------------- model */

  const factsPartial: ChainFacts = {
    applicationProposed: !!application,
    applicationApplied: application?.applyStatus === "applied",
    tenantDeployed: !!tenantBinding || !!orgTenant,
    poolAssigned: !!pool,
    treasuryFunded: false,
    configPublished: !!registryApp,
    teamStaked: meetsTeamStakeMinimum(teamPoolAccount?.staked_balance),
    teamRegistered: teamVe != null,
    lockupDeployed: teamVe?.internal.lockup_version != null,
    nearLocked: isPositive(teamLockupState?.locked),
    endowmentRegistered: endowmentVe != null,
    endowmentLockupDeployed: endowmentVe?.internal.lockup_version != null,
    endowmentFunded:
      yoctoArg(endowmentLockupState?.liquid) + yoctoArg(endowmentLockupState?.locked) >
      BigInt(LOCKUP_DEPLOY_DEPOSIT),
    endowmentLocked: isPositive(endowmentLockupState?.locked),
    endowmentPoolSelected:
      !!endowmentLockupState?.stakingPool && endowmentLockupState.stakingPool === pool,
    endowmentStaked: isPositive(endowmentLockupState?.knownDeposited),
    delegated: !!endowmentVe?.account.delegations.some((entry) => entry.account_id === team),
    voteCast: voteRecord != null,
    teamUnstaked: teamPoolAccount ? !isPositive(teamPoolAccount.staked_balance) : true,
    teamWithdrawn: teamPoolAccount ? !isPositive(teamPoolAccount.unstaked_balance) : true,
    endowmentUnstaked: !isPositive(endowmentLockupState?.knownDeposited),
    endowmentWithdrawn: endowmentPoolAccount
      ? !isPositive(endowmentPoolAccount.unstaked_balance)
      : true,
    endowmentPoolReleased: !endowmentLockupState?.stakingPool,
    delegationsCleared: endowmentVe ? endowmentVe.account.delegations.length === 0 : true,
    treasuriesShared,
  };

  const requirementYocto = teamTreasuryRequirementYocto(factsPartial);
  const treasuryFunded =
    !!team && treasuryBalance != null && BigInt(treasuryBalance) >= requirementYocto;
  const facts: ChainFacts = { ...factsPartial, treasuryFunded };
  const fundYocto =
    requirementYocto + TREASURY_FUND_BUFFER_YOCTO >= TREASURY_FUND_FLOOR_YOCTO
      ? requirementYocto + TREASURY_FUND_BUFFER_YOCTO
      : TREASURY_FUND_FLOOR_YOCTO;

  const daoTakenElsewhere =
    !!team && !!tenantByDao && tenantByDao.orgId != null && tenantByDao.orgId !== activeOrgId;
  const daoBlocked = daoTakenElsewhere ? translate("lifecycle.daoElsewhere") : null;

  const membershipBlocked =
    !!daoPolicyForAudit &&
    !!sessionAccount &&
    !isExplicitDaoMember(daoPolicyForAudit, sessionAccount);
  const blockers: Partial<Record<StationId, string>> = {};
  if (!activeOrgId) blockers.apply = translate("lifecycle.chooseOrgLower");
  else if (!team) blockers.apply = translate("lifecycle.connectTeamReason");
  else if (daoBlocked) blockers.apply = daoBlocked;
  else if (!sessionAccount) blockers.apply = translate("lifecycle.signinWalletReason");
  else if (!values.name.trim()) blockers.apply = translate("lifecycle.nodeNameReason");
  if (!sessionAccount) blockers.approve = translate("lifecycle.signinApproveReason");
  else if (!isAdmin) blockers.approve = translate("lifecycle.adminApproveReason");
  else if (!team) blockers.approve = translate("lifecycle.connectTeamReason");
  else if (daoBlocked) blockers.approve = daoBlocked;
  else if (membershipBlocked) {
    blockers.approve = translate("wallet.daoNotMember", { account: sessionAccount, dao: team });
  }
  if (!team) blockers.fund = translate("lifecycle.connectTeamReason");
  else if (!sessionAccount) blockers.fund = translate("lifecycle.signinWalletReason");
  else if (!isAdmin) blockers.fund = translate("lifecycle.adminFundingReason");
  if (!team) blockers.publish = translate("lifecycle.connectTeamReason");
  else if (application && facts.configPublished && !isAdmin) {
    blockers.publish = translate("lifecycle.adminMarkReason");
  }
  if (!team) blockers.stake = translate("lifecycle.connectTeamReason");
  else if (!pool) blockers.stake = translate("lifecycle.poolReason");
  if (!team) blockers["setup-hos"] = translate("lifecycle.connectTeamReason");
  if (!endowment) blockers["sponsor-lock"] = translate("lifecycle.endowmentReason");
  else if (!sponsorYocto) blockers["sponsor-lock"] = translate("lifecycle.sponsorAmountReason");
  if (!endowment) blockers["sponsor-stake"] = translate("lifecycle.endowmentReason");
  else if (!pool) blockers["sponsor-stake"] = translate("lifecycle.poolReason");
  else if (!sponsorYocto) blockers["sponsor-stake"] = translate("lifecycle.sponsorAmountReason");
  if (!endowment) blockers["sponsor-delegate"] = translate("lifecycle.endowmentReason");
  if (!team) blockers.vote = translate("lifecycle.connectTeamReason");
  else if (!govProposal) blockers.vote = translate("lifecycle.noGovProposalReason");
  if (!team) blockers.unstake = translate("lifecycle.connectTeamReason");
  else if (!pool) blockers.unstake = translate("lifecycle.poolReason");
  if (!endowment) blockers["sponsor-unwind"] = translate("lifecycle.endowmentReason");

  const platformAuditWarning =
    daoPolicyForAudit && baseAccount && !isExplicitDaoMember(daoPolicyForAudit, baseAccount) && team
      ? translate("poc.auditNotMember", { account: baseAccount, dao: team })
      : null;
  const trezuMembersUrl = team ? `https://trezu.app/${team}/members` : null;

  const stationDefs = useMemo(
    () =>
      buildStations(
        {
          slug,
          pool,
          teamAccount: team,
          endowmentAccount: endowment,
          teamLockup,
          endowmentLockup,
          sponsorYocto,
          sponsorStakeYocto,
          govProposalId: govProposal?.id ?? null,
        },
        translate,
      ),
    [
      slug,
      pool,
      team,
      endowment,
      teamLockup,
      endowmentLockup,
      sponsorYocto,
      sponsorStakeYocto,
      govProposal?.id,
      translate,
    ],
  );

  /** The session wallet connects to the endowment through policy membership. */
  const sessionCanProposeEndowment = canAccountPropose(endowmentPolicy, sessionAccount);

  const localizedFailures: Partial<Record<StationId, string>> = {};
  for (const [id, failure] of Object.entries(failures)) {
    if (failure)
      localizedFailures[id as StationId] = describeDaoError(
        failure.error,
        failure.account,
        translate,
      );
  }

  const stations = deriveStations(
    {
      stations: stationDefs,
      facts,
      proposalsBySigner: { endowment: endowmentProposals, team: teamProposals },
      accounts: { session: sessionAccount, endowment, team },
      connectedDao: connection.daoAccountId,
      sessionProposerSigners: sessionCanProposeEndowment ? (["endowment"] as const) : [],
      blockers,
      runningStation,
      failedStations: localizedFailures,
    },
    translate,
  );

  const accountFor = (signer: SignerKind) =>
    signer === "session" ? sessionAccount : signer === "endowment" ? endowment : team;
  const policyFor = (signer: SignerKind) => (signer === "endowment" ? endowmentPolicy : teamPolicy);

  const runnable = runnableRun(stations);
  const upcoming = nextStation(stations);
  const stagedCount = pendingProposalCount(stations);
  const tenantHostname =
    tenantBinding?.hostname ?? (slug && gatewayId ? `${slug}.${gatewayId}` : "");
  const tenantUrl = tenantHostname && gatewayId ? buildTenantUrl(tenantHostname, gatewayId) : null;
  const tenantDisplayHost = tenantUrl ? new URL(tenantUrl).host : tenantHostname || "—";
  const tenantRecord = orgTenant ?? tenantByDao ?? null;
  const publishPendingProposal =
    stations
      .find((station) => station.def.id === "publish")
      ?.steps.find((step) => step.id === "publish")?.pendingProposal ?? null;
  const fastKvUrl = team && gatewayId ? buildRegistryConfigUrl(team, gatewayId) : null;

  /* ------------------------------------------------------------------ actions */

  const requireConnected = async (signer: SignerKind) => {
    const want = accountFor(signer);
    if (signer === "session") {
      if (!sessionAccount) throw new AppActionError("poc.nearSignInFirst");
      return;
    }
    if (!want) throw new AppActionError("poc.treasuryMissing");
    if (connection.daoAccountId === want && (await verifyDaoAccount(want))) return;
    if (connection.daoAccountId) await connection.disconnect();
    const connected = await connection.connect();
    if (connected !== want) {
      throw new AppActionError("wallet.daoWrongAccount", { actual: connected, expected: want });
    }
  };

  /** Fresh read of the published tenant config — the truth for publish/mark-applied. */
  const fetchPublishedNow = () =>
    team && gatewayId
      ? apiClient.registry
          .getRegistryApp({ accountId: team, gatewayId })
          .then((result) => result.data ?? null)
          .catch(() => null)
      : Promise.resolve(null);

  /** Fresh read of the team's account in the pool — the truth for the team stake stations. */
  const fetchTeamPoolAccount = () =>
    pool && team
      ? getNear()
          .view<PoolAccountView>(pool, "get_account", { account_id: team })
          .catch(() => null)
      : Promise.resolve(null);

  /**
   * True when an endowment step stages as a proposal from the session wallet
   * instead of being signed by a connected endowment wallet.
   */
  const viaSessionProposal = (signer: SignerKind) =>
    signer === "endowment" && connection.daoAccountId !== endowment && sessionCanProposeEndowment;

  /** Executes one station's remaining steps in order, as its declared signer. */
  const runStation = async (station: StationState) => {
    const { def } = station;
    setRunningStation(def.id);
    setFailures((prev) => ({ ...prev, [def.id]: undefined }));
    try {
      if (!viaSessionProposal(def.signer)) await requireConnected(def.signer);
      for (const step of station.steps) {
        if (step.status !== "pending") continue;
        await runStep(station, step.id);
      }
      toast.success(translate("lifecycle.stepDone", { step: def.title ?? "" }));
    } catch (error) {
      const message = describeDaoError(error, accountFor(def.signer) ?? def.signer, translate);
      setFailures((prev) => ({
        ...prev,
        [def.id]: { error, account: accountFor(def.signer) ?? def.signer },
      }));
      toast.error(message);
      log(
        { messageId: "poc.stationFailed", values: { station: def.title ?? "" } },
        { error, account: accountFor(def.signer) ?? def.signer },
      );
      throw error;
    } finally {
      setRunningStation(null);
      refresh();
    }
  };

  const precheckPlan = createPrecheckPlan({
    locale,
    pool,
    teamLockup,
    endowmentLockup,
    accountFor,
    log,
    fetchPublishedNow,
    fetchTeamPoolAccount,
  });

  const runStep = gatewayId
    ? createStepRunner({
        t: translate,
        locale,
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
      })
    : async () => {
        throw new AppActionError("poc.gatewayMissing");
      };

  const runChainMutation = useMutation({
    mutationFn: async () => {
      for (const station of runnable) {
        await runStation(station);
      }
    },
    onError: () => {},
  });

  /**
   * Approves a staged proposal with the connected Trezu wallet — never the
   * session wallet. A mismatched treasury is disconnected and reconnected as
   * the proposal's DAO before the vote is signed.
   */
  const approveMutation = useMutation({
    mutationFn: async ({
      signer,
      dao,
      proposalId,
    }: {
      signer: SignerKind;
      dao: string;
      proposalId: number;
    }) => {
      if (!dao) throw new AppActionError("poc.treasuryMissing");
      await requireConnected(signer);
      return signPlanAsDao(dao, approveProposalPlan(dao, proposalId));
    },
    onSuccess: (result, variables) => {
      toast.success(
        translate("lifecycle.proposalApprovedNamed", { id: variables.proposalId ?? "" }),
      );
      log(
        {
          messageId: "poc.voteApproved",
          values: {
            account: variables.dao ?? "",
            proposal: variables.proposalId ?? "",
          },
        },
        txHash(result),
      );
      refresh();
    },
    onError: (error: Error, variables) =>
      toast.error(describeDaoError(error, variables.dao, translate)),
  });

  const connectTeamDaoMutation = useMutation({
    mutationFn: async () => {
      let dao = connection.daoAccountId;
      if (dao && !(await verifyDaoAccount(dao).catch(() => false))) {
        await connection.disconnect();
        dao = null;
      }
      if (!dao) dao = await connection.connect();
      setConnectedTeamDao(dao);
      if (activeOrgId && dao !== orgDaoAccountId) {
        await apiClient.auth
          .linkDao({ organizationId: activeOrgId, daoAccountId: dao })
          .catch(() => {});
      }
      return dao;
    },
    onSuccess: (dao) => {
      log({ messageId: "poc.teamLinked", values: { account: dao ?? "" } });
      refresh();
    },
    onError: (error: Error) =>
      toast.error(
        describeDaoError(error, connection.daoAccountId ?? translate("wallet.treasury"), translate),
      ),
  });

  const connectEndowmentMutation = useMutation({
    mutationFn: async () => {
      let dao = connection.daoAccountId;
      if (dao && !(await verifyDaoAccount(dao).catch(() => false))) {
        await connection.disconnect();
        dao = null;
      }
      if (!dao) dao = await connection.connect();
      form.setFieldValue("endowmentLinked", false);
      form.setFieldValue("endowment", dao);
      return dao;
    },
    onSuccess: (dao) => {
      log({ messageId: "poc.endowmentSet", values: { account: dao ?? "" } });
    },
    onError: (error: Error) =>
      toast.error(
        describeDaoError(error, connection.daoAccountId ?? translate("wallet.treasury"), translate),
      ),
  });

  /* --------------------------------------------------------------------- view */

  const busy = runChainMutation.isPending || !!runningStation;

  return {
    runtimeConfig,
    sessionAccount,
    connection,
    organizations,
    activeOrg,
    activeOrgId,
    isAdmin,
    form,
    values,
    slug,
    team,
    endowment,
    pool,
    treasuriesShared,
    entries,
    refresh,
    application,
    facts,
    stations,
    runnable,
    upcoming,
    stagedCount,
    busy,
    runningStation,
    policyFor,
    platformAuditWarning,
    membershipBlocked,
    trezuMembersUrl,
    sessionCanProposeEndowment,
    tenantUrl,
    tenantDisplayHost,
    tenantRecord,
    tenantBinding,
    publishPendingProposal,
    fastKvUrl,
    govProposals,
    govProposal,
    fundYocto,
    requirementYocto,
    teamVe,
    treasuryBalance,
    treasuryFunded,
    voteRecord,
    endowmentLockup,
    endowmentLockupState,
    endowmentAvailableYocto,
    endowmentPoolAccount,
    endowmentVe,
    poolMeta,
    whitelisted,
    teamPoolAccount,
    runStation,
    requireConnected,
    runChainMutation,
    approveMutation,
    connectTeamDaoMutation,
    connectEndowmentMutation,
  };
}

export type PocLifecycle = ReturnType<typeof usePocLifecycle>;
