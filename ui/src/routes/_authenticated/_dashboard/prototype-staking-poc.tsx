import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  BankIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  CircleIcon,
  FlaskIcon,
  GavelIcon,
  LinkBreakIcon,
  LinkIcon,
  PlayIcon,
  ProhibitIcon,
  StackIcon,
  WalletIcon,
  WarningIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getAccount, getActiveRuntime, useApiClient, useAuthClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  InfoPopover,
  type InfoPopoverLink,
  InfoRow,
  Input,
  PageContainer,
  PageHeader,
  SectionHeader,
  UnderConstruction,
} from "@/components";
import { OrgSwitcherMenuContent } from "@/components/layout/org-switcher-menu";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  describeDaoError,
  isExplicitDaoMember,
  useDaoAutoRestore,
  useDaoConnection,
  verifyDaoAccount,
} from "@/lib/dao-connect";
import { generateSlug } from "@/lib/slug";
import { publishDaoTenantConfig } from "@/lib/tenant-deploy";
import { buildTenantUrl } from "@/lib/tenant-url";
import { useNearAccount } from "@/lib/use-near-account";
import { parseNodeProposalPayload, proposeNodeApplication } from "./-node-application";
import {
  accountExplorerUrl,
  approvalThreshold,
  approveProposalPlan,
  canAccountPropose,
  type DaoPlan,
  describePlan,
  fetchAccountBalance,
  fetchActiveGovProposals,
  fetchDaoProposals,
  fetchGovProof,
  fetchGovVoteRecord,
  fetchLockupAccountId,
  fetchLockupState,
  fetchPoolMeta,
  fetchSputnikPolicy,
  fetchVenearAccount,
  fetchVoteStorageFee,
  formatNear,
  getNear,
  isPositive,
  LOCKUP_DEPLOY_DEPOSIT,
  meetsTeamStakeMinimum,
  nearblocksAccount,
  type PoolAccountView,
  parseNearAmount,
  poolFeePercent,
  proposeAsSession,
  remainingToFund,
  remainingToStake,
  type SputnikProposal,
  signPlanAsDao,
  sumVenear,
  transferFromSessionWallet,
  txHash,
  VOTE_OPTIONS,
  VOTE_STORAGE_FEE_FALLBACK,
  VOTING_ACCOUNT,
  WHITELIST_ACCOUNT,
  waitFor,
  yoctoArg,
} from "./-poc-chain";
import {
  buildPocFormValues,
  type PocForm,
  prefillIfEmpty,
  usePocForm,
  usePocFormValues,
} from "./-poc-form";
import {
  buildStations,
  type ChainFacts,
  deriveStations,
  LENS_OPTIONS,
  nextStation,
  PHASES,
  pendingProposalCount,
  runnableRun,
  SIGNER_LABEL,
  type SignerKind,
  type StationId,
  type StationState,
  type StepState,
  signerLens,
  teamTreasuryRequirementYocto,
} from "./-poc-stations";

const REFETCH_MS = 15_000;
const TREZU_CREATE_URL = "https://trezu.app/create";
const HOS_URL = "https://gov.houseofstake.org";
const POOL_PLACEHOLDER = "everything.pool.near";
const TREASURY_FUND_FLOOR_YOCTO = 4n * 10n ** 24n;
const TREASURY_FUND_BUFFER_YOCTO = 10n ** 24n;
const hosDelegateUrl = (accountId: string) => `${HOS_URL}/delegates/${accountId}`;

interface LogEntry {
  id: string;
  time: string;
  label: string;
  detail?: string;
}

/** "near builders" → "Near Builders" — the default node name from the org name. */
const titleCase = (value: string) =>
  value.replace(/(^|[\s-])[a-z]/g, (match) => match.toUpperCase());

export const Route = createFileRoute("/_authenticated/_dashboard/prototype-staking-poc")({
  head: () => ({
    meta: [
      { title: "Node lifecycle POC | app" },
      {
        name: "description",
        content:
          "One node, end to end: apply, approve and assign the pool, fund the team treasury, stake, lock veNEAR, sponsor, and vote in House of Stake.",
      },
    ],
  }),
  component: NodeLifecyclePocPage,
});

function NodeLifecyclePocPage() {
  const sessionAccount = useNearAccount();
  useDaoAutoRestore(sessionAccount);
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const connection = useDaoConnection();
  const queryClient = useQueryClient();
  const { auth: routeAuth, runtimeConfig } = Route.useRouteContext();

  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
  const baseAccount = getAccount(runtimeConfig);
  const activeOrgId = routeAuth.activeOrganizationId;
  const isAdmin = routeAuth.isAdmin;

  const initialFormValues = useMemo(() => buildPocFormValues(activeOrgId), [activeOrgId]);
  const form = usePocForm(activeOrgId, initialFormValues);
  const values = usePocFormValues(form);

  const [connectedTeamDao, setConnectedTeamDao] = useState<string | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [runningStation, setRunningStation] = useState<StationId | null>(null);
  const [failures, setFailures] = useState<Partial<Record<StationId, string>>>({});

  const log = (label: string, detail?: string) => {
    setEntries((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random()}`,
          time: new Date().toLocaleTimeString(),
          label,
          detail,
        },
        ...prev,
      ].slice(0, 40),
    );
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["poc"] });

  /* ------------------------------------------------------------------ queries */

  const { data: organizations = [] } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      const { data } = await auth.organization.list();
      return data ?? [];
    },
  });

  const activeOrg = organizations.find((org) => org.id === activeOrgId);
  const activeOrgName = activeOrg?.name ?? null;

  const lastOrgId = useRef<string | null>(null);
  useEffect(() => {
    if (activeOrgId === lastOrgId.current) return;
    lastOrgId.current = activeOrgId;
    setFailures({});
    setConnectedTeamDao(null);
    form.reset(
      buildPocFormValues(activeOrgId, activeOrgName ? { name: titleCase(activeOrgName) } : {}),
    );
  }, [activeOrgId, activeOrgName, form]);

  const poc = <T,>(key: readonly unknown[], queryFn: () => Promise<T>, enabled = true) =>
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
      !!slug,
    ),
  );
  const { data: registryApp } = useQuery(
    poc(
      ["registry-app", team, gatewayId],
      async () => {
        try {
          const result = await apiClient.apps.getRegistryApp({
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
  const daoBlocked = daoTakenElsewhere
    ? "this organization's DAO already runs a tenant elsewhere"
    : null;

  const blockers: Partial<Record<StationId, string>> = {};
  if (!activeOrgId) blockers.apply = "select an organization";
  else if (!team) blockers.apply = "connect your team DAO with Trezu";
  else if (daoBlocked) blockers.apply = daoBlocked;
  else if (!sessionAccount) blockers.apply = "sign in with your NEAR wallet";
  else if (!values.name.trim()) blockers.apply = "enter a node name";
  if (!sessionAccount) blockers.approve = "sign in to approve";
  else if (!isAdmin) blockers.approve = "admin access required — sign in as an admin";
  else if (!team) blockers.approve = "connect your team DAO with Trezu";
  else if (daoBlocked) blockers.approve = daoBlocked;
  else if (daoPolicyForAudit && !isExplicitDaoMember(daoPolicyForAudit, sessionAccount)) {
    blockers.approve = `${sessionAccount} is not a member of ${team}`;
  }
  if (!team) blockers.fund = "connect your team DAO with Trezu";
  else if (!sessionAccount) blockers.fund = "sign in with your NEAR wallet";
  else if (!isAdmin) blockers.fund = "admin access required — the admin's wallet does the funding";
  if (!team) blockers.publish = "connect your team DAO with Trezu";
  else if (application && facts.configPublished && !isAdmin) {
    blockers.publish = "config is live — an admin must mark the application applied";
  }
  if (!team) blockers.stake = "connect your team DAO with Trezu";
  else if (!pool) blockers.stake = "enter the staking pool";
  if (!team) blockers["setup-hos"] = "connect your team DAO with Trezu";
  if (!endowment) blockers["sponsor-lock"] = "set the endowment treasury";
  else if (!sponsorYocto) blockers["sponsor-lock"] = "enter the sponsor amount";
  if (!endowment) blockers["sponsor-stake"] = "set the endowment treasury";
  else if (!pool) blockers["sponsor-stake"] = "enter the staking pool";
  else if (!sponsorYocto) blockers["sponsor-stake"] = "enter the sponsor amount";
  if (!endowment) blockers["sponsor-delegate"] = "set the endowment treasury";
  if (!team) blockers.vote = "connect your team DAO with Trezu";
  else if (!govProposal) blockers.vote = "no active House of Stake proposal";
  if (!team) blockers.unstake = "connect your team DAO with Trezu";
  else if (!pool) blockers.unstake = "enter the staking pool";
  if (!endowment) blockers["sponsor-unwind"] = "set the endowment treasury";

  const platformAuditWarning =
    daoPolicyForAudit && baseAccount && !isExplicitDaoMember(daoPolicyForAudit, baseAccount) && team
      ? `the platform audit account ${baseAccount} is not a member of ${team}`
      : null;
  const trezuMembersUrl = team ? `https://trezu.app/${team}/members` : null;

  const stationDefs = useMemo(
    () =>
      buildStations({
        slug,
        pool,
        teamAccount: team,
        endowmentAccount: endowment,
        teamLockup,
        endowmentLockup,
        sponsorYocto,
        sponsorStakeYocto,
        govProposalId: govProposal?.id ?? null,
      }),
    [slug, pool, team, endowment, teamLockup, endowmentLockup, sponsorYocto, govProposal?.id],
  );

  /** The session wallet connects to the endowment through policy membership. */
  const sessionCanProposeEndowment = canAccountPropose(endowmentPolicy, sessionAccount);

  const stations = deriveStations({
    stations: stationDefs,
    facts,
    proposalsBySigner: { endowment: endowmentProposals, team: teamProposals },
    accounts: { session: sessionAccount, endowment, team },
    connectedDao: connection.daoAccountId,
    sessionProposerSigners: sessionCanProposeEndowment ? (["endowment"] as const) : [],
    blockers,
    runningStation,
    failedStations: failures,
  });

  const accountFor = (signer: SignerKind) =>
    signer === "session" ? sessionAccount : signer === "endowment" ? endowment : team;
  const policyFor = (signer: SignerKind) => (signer === "endowment" ? endowmentPolicy : teamPolicy);

  const runnable = runnableRun(stations);
  const upcoming = nextStation(stations);
  const stagedCount = pendingProposalCount(stations);
  const tenantHostname = tenantBinding?.hostname ?? (slug ? `${slug}.${gatewayId}` : "");
  const tenantUrl = tenantHostname ? buildTenantUrl(tenantHostname, gatewayId) : null;
  const tenantDisplayHost = tenantUrl ? new URL(tenantUrl).host : tenantHostname || "—";
  const tenantRecord = orgTenant ?? tenantByDao ?? null;
  const publishPendingProposal =
    stations
      .find((station) => station.def.id === "publish")
      ?.steps.find((step) => step.id === "publish")?.pendingProposal ?? null;
  const fastKvUrl = team ? buildRegistryConfigUrl(team, gatewayId) : null;

  /* ------------------------------------------------------------------ actions */

  const requireConnected = async (signer: SignerKind) => {
    const want = accountFor(signer);
    if (signer === "session") {
      if (!sessionAccount) throw new Error("Sign in with your NEAR wallet first");
      return;
    }
    if (!want) throw new Error("Set the treasury account first");
    if (connection.daoAccountId === want && (await verifyDaoAccount(want))) return;
    if (connection.daoAccountId) await connection.disconnect();
    try {
      const connected = await connection.connect();
      if (connected !== want) {
        throw new Error(`Trezu connected ${connected}, but this step must be signed by ${want}`);
      }
    } catch (error) {
      throw new Error(describeDaoError(error, want));
    }
  };

  /** Fresh read of the published tenant config — the truth for publish/mark-applied. */
  const fetchPublishedNow = () =>
    apiClient.apps
      .getRegistryApp({ accountId: team, gatewayId })
      .then((result) => result.data ?? null)
      .catch(() => null);

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
        try {
          await runStep(station, step.id);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`${step.label} — ${detail}`);
        }
      }
      toast.success(`${def.title} — done`);
    } catch (error) {
      const message = describeDaoError(error, accountFor(def.signer) ?? def.signer);
      setFailures((prev) => ({ ...prev, [def.id]: message }));
      toast.error(message);
      log(`${def.title} failed`, message);
      throw error;
    } finally {
      setRunningStation(null);
      refresh();
    }
  };

  /**
   * Re-checks a step against fresh chain state right before signing. Returns
   * the plan to sign (possibly narrowed to the remaining amount), or null when
   * the step is already done and must be skipped instead of re-signed.
   */
  const precheckPlan = async (station: StationState, step: StepState): Promise<DaoPlan | null> => {
    const plan = step.plan;
    if (!plan) return null;
    if (plan.kind === "transfer") {
      if (step.id !== "fund-lockup") return plan;
      if (!endowmentLockup) {
        throw new Error("resolving the endowment lockup — run again in a moment");
      }
      const state = await fetchLockupState(endowmentLockup).catch(() => null);
      if (!state) return plan;
      const remaining = remainingToFund(plan.amountYocto, state);
      if (remaining <= 0n) {
        log("lockup already funded — skipping");
        return null;
      }
      if (remaining < BigInt(plan.amountYocto)) {
        log(`topping up ${formatNear(remaining.toString())} — part of it is already there`);
      }
      return { kind: "transfer", receiverId: plan.receiverId, amountYocto: remaining.toString() };
    }
    if (plan.kind !== "call") return plan;
    const signerLockup = station.def.signer === "endowment" ? endowmentLockup : teamLockup;
    switch (step.id) {
      case "publish": {
        const live = await fetchPublishedNow();
        if (live) {
          log("config already live — skipping");
          return null;
        }
        return plan;
      }
      case "register":
      case "register-endowment": {
        const account = accountFor(station.def.signer) ?? "";
        const ve = await fetchVenearAccount(account).catch(() => null);
        if (ve) {
          log("already registered in veNEAR — skipping");
          return null;
        }
        return plan;
      }
      case "deploy-lockup":
      case "deploy-lockup-endowment": {
        if (!signerLockup) {
          throw new Error("resolving the lockup — run again in a moment");
        }
        const state = await fetchLockupState(signerLockup).catch(() => null);
        if (state) {
          log("lockup already deployed — skipping");
          return null;
        }
        return plan;
      }
      case "lock":
      case "lock-endowment": {
        if (!signerLockup) {
          throw new Error("resolving the lockup — run again in a moment");
        }
        const state = await fetchLockupState(signerLockup).catch(() => null);
        if (!state) throw new Error("the lockup is not deployed yet — deploy it first");
        if (isPositive(state.liquid)) return plan;
        if (isPositive(state.locked)) {
          log("already locked — skipping");
          return null;
        }
        throw new Error("nothing in the lockup to lock yet — fund it first");
      }
      case "stake": {
        const want = yoctoArg(plan.attachedDeposit);
        if (want <= 0n) return plan;
        const current = await fetchTeamPoolAccount();
        if (!current) return plan;
        const staked = yoctoArg(current.staked_balance);
        const remaining = want > staked ? want - staked : 0n;
        if (remaining <= 0n) {
          log("team already staked at least 1 NEAR — skipping");
          return null;
        }
        return { ...plan, attachedDeposit: remaining.toString() };
      }
      case "select-pool": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (state?.stakingPool && state.stakingPool === String(plan.args.staking_pool_account_id)) {
          log("pool already selected — skipping");
          return null;
        }
        return plan;
      }
      case "unselect-old-pool": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state?.stakingPool) {
          log("no pool selected — skipping");
          return null;
        }
        if (state.stakingPool === pool) {
          log("the lockup already points at the node's pool — skipping");
          return null;
        }
        if (isPositive(state.knownDeposited)) {
          throw new Error("unstake first — the pool still holds a deposit");
        }
        return plan;
      }
      case "stake-endowment": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const want = yoctoArg(plan.args.amount);
        if (want <= 0n) return plan;
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state) return plan;
        const remaining = remainingToStake(want.toString(), state);
        if (remaining <= 0n) {
          log("already staked from the lockup — skipping");
          return null;
        }
        return { ...plan, args: { ...plan.args, amount: remaining.toString() } };
      }
      case "set-delegations": {
        const entries = plan.args.entries as { account_id: string; bps: number }[] | undefined;
        if (!entries) return plan;
        const ve = await fetchVenearAccount(accountFor("endowment") ?? "").catch(() => null);
        if (
          ve &&
          ve.account.delegations.length === entries.length &&
          entries.every((entry) =>
            ve.account.delegations.some(
              (delegation) =>
                delegation.account_id === entry.account_id && delegation.bps === entry.bps,
            ),
          )
        ) {
          log("delegation already set — skipping");
          return null;
        }
        return plan;
      }
      case "unstake-all": {
        const current = await fetchTeamPoolAccount();
        if (!current || !isPositive(current.staked_balance)) {
          log("nothing staked by the team — skipping");
          return null;
        }
        return plan;
      }
      case "withdraw": {
        const current = await fetchTeamPoolAccount();
        if (!current || !isPositive(current.unstaked_balance)) {
          log("nothing for the team to withdraw — skipping");
          return null;
        }
        if (!current.can_withdraw) {
          throw new Error(
            "unstaked balance is still locked in the epoch window — run again in a couple of days",
          );
        }
        return plan;
      }
      case "unstake-endowment": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (state && !isPositive(state.knownDeposited)) {
          log("nothing staked — skipping");
          return null;
        }
        return plan;
      }
      case "withdraw-endowment": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state?.stakingPool) {
          log("no pool selected — skipping");
          return null;
        }
        const staked = await getNear()
          .view<PoolAccountView>(state.stakingPool, "get_account", { account_id: endowmentLockup })
          .catch(() => null);
        if (!staked || !isPositive(staked.unstaked_balance)) {
          log("nothing to withdraw — skipping");
          return null;
        }
        if (!staked.can_withdraw) {
          throw new Error(
            "unstaked balance is still locked in the epoch window — run again in a couple of days",
          );
        }
        return plan;
      }
      case "unselect-pool": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state?.stakingPool) {
          log("pool already released — skipping");
          return null;
        }
        if (isPositive(state.knownDeposited)) {
          throw new Error("unstake first — the pool still holds a deposit");
        }
        return plan;
      }
      case "clear-delegations": {
        const ve = await fetchVenearAccount(accountFor("endowment") ?? "").catch(() => null);
        if (ve && ve.account.delegations.length === 0) {
          log("no delegations — skipping");
          return null;
        }
        return plan;
      }
      default:
        return plan;
    }
  };

  const runStep = async (station: StationState, stepId: string) => {
    const step = station.steps.find((entry) => entry.id === stepId);
    if (!step) throw new Error(`unknown step ${stepId}`);
    const signerId = accountFor(station.def.signer);

    if (stepId === "propose") {
      if (!activeOrgId || !sessionAccount)
        throw new Error("Organization and NEAR account required");
      const result = await proposeNodeApplication(
        apiClient,
        {
          kind: "country",
          parentId: null,
          name: values.name.trim(),
          slug,
          motivation: `Prototype application for ${values.name.trim()}`,
        },
        { orgId: activeOrgId, daoAccountId: team, submitterAccountId: sessionAccount },
      );
      log(`applied for ${slug} as ${sessionAccount}`, `proposal ${result.data.entityId}`);
      return;
    }

    if (stepId === "approve") {
      if (!isAdmin) {
        throw new Error("admin access required — sign in as an admin");
      }
      const current = await apiClient.proposals.getProposals({
        pluginId: "node",
        entityId: slug,
        limit: 1,
      });
      const proposal = current.data[0];
      if (!proposal) throw new Error("No application to approve");
      let updatedAt = proposal.updatedAt;
      if (proposal.reviewStatus !== "approved") {
        const approved = await apiClient.proposals.approve({
          pluginId: "node",
          entityId: slug,
          expectedUpdatedAt: proposal.updatedAt,
        });
        updatedAt = approved.data.updatedAt;
        log(`approved the application for ${slug}`);
      }
      if (tenantBinding || orgTenant) {
        log("application already approved and node created — skipping");
        return;
      }
      try {
        const node = await apiClient.applyNodeProposal({
          kind: "country",
          parentId: null,
          name: values.name.trim(),
          slug,
          motivation: `Prototype application for ${values.name.trim()}`,
          orgId: activeOrgId ?? "",
          accountId: team,
          submitterAccountId: sessionAccount ?? "",
          hostname: `${slug}.${gatewayId}`,
          ...(pool ? { poolAccountId: pool } : {}),
        });
        log(
          `created tenant, node and binding for ${slug}${pool ? `, assigned pool ${pool}` : ""}`,
          `node ${node.nodeId}`,
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
        throw new Error(detail);
      }
      return;
    }

    if (stepId === "fund-treasury") {
      if (!team) throw new Error("Connect the team DAO first");
      if (!sessionAccount) throw new Error("Sign in with your NEAR wallet first");
      if (!isAdmin) throw new Error("admin access required — the admin's wallet does the funding");
      if (treasuryFunded) {
        log("treasury already funded — skipping");
        return;
      }
      const result = await transferFromSessionWallet(auth.near, team, fundYocto);
      log(
        `funded ${team} with ${formatNear(fundYocto.toString())} from ${sessionAccount}`,
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
        log(`published the tenant config as ${team}`, txHash(result));
        toast.success(`tenant config is live — ${tenantUrl ?? `${slug}.${gatewayId}`}`);
      } else {
        const latest = await fetchDaoProposals(team).catch(() => []);
        const detail =
          [txHash(result), latest[0] ? `latest proposal #${latest[0].id}` : null]
            .filter(Boolean)
            .join(" · ") || undefined;
        log(`publish proposal signed as ${team} — config goes live when it passes`, detail);
        toast.info("publish proposal awaiting votes — the config goes live once it passes");
      }
      return;
    }

    if (stepId === "mark-applied") {
      if (!isAdmin) {
        log("mark-applied needs an admin session — deferred");
        toast.info("mark-applied needs an admin session — run this again signed in as an admin");
        return;
      }
      const published = await fetchPublishedNow();
      if (!published) {
        log("tenant config not live yet — mark-applied deferred");
        toast.info("the publish proposal is still awaiting votes — run this again once it passes");
        return;
      }
      const current = await apiClient.proposals.getProposals({
        pluginId: "node",
        entityId: slug,
        limit: 1,
      });
      const proposal = current.data[0];
      if (!proposal) throw new Error("Application disappeared");
      await apiClient.proposals.markApplied({
        pluginId: "node",
        entityId: slug,
        expectedUpdatedAt: proposal.updatedAt,
        appliedResourceId: slug,
      });
      log(`marked ${slug} applied`);
      return;
    }

    if (stepId === "vote") {
      if (!govProposal) throw new Error("No active proposal selected");
      if (!signerId) throw new Error("Team wallet not set");
      const proof = await fetchGovProof(signerId);
      if (!proof) throw new Error(`${signerId} has no veNEAR account — register it first`);
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
        `voted ${values.voteOption} on proposal ${govProposal.id} as ${signerId}`,
        txHash(result),
      );
      return;
    }

    if (!step.plan) throw new Error(`step ${stepId} has no plan`);
    if (!signerId) throw new Error("Signer account not set");
    const plan = await precheckPlan(station, step);
    if (!plan) return;
    if (viaSessionProposal(station.def.signer)) {
      const description = `* Title: ${step.label} <br>* Summary: staged from the node lifecycle — ${describePlan(plan)}`;
      const result = await proposeAsSession(auth.near, endowment, plan, description);
      log(`staged a proposal on ${endowment} — ${describePlan(plan)}`, txHash(result));
      return;
    }
    if (station.def.signer === "endowment") {
      throw new Error(
        "connect the endowment in Trezu, or hold AddProposal rights on its policy, to stage this step",
      );
    }
    const result = await signPlanAsDao(signerId, plan);
    log(`${describePlan(plan)} as ${signerId}`, txHash(result));
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
      if (!dao) throw new Error("Set the treasury account first");
      await requireConnected(signer);
      return signPlanAsDao(dao, approveProposalPlan(dao, proposalId));
    },
    onSuccess: (result, variables) => {
      toast.success(`approved proposal ${variables.proposalId}`);
      log(`voted Approve on ${variables.dao} proposal ${variables.proposalId}`, txHash(result));
      refresh();
    },
    onError: (error: Error, variables) => toast.error(describeDaoError(error, variables.dao)),
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
      log(`team wallet set to ${dao} — linked to the organization`);
      refresh();
    },
    onError: (error: Error) =>
      toast.error(describeDaoError(error, connection.daoAccountId ?? "the treasury")),
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
      log(`endowment treasury set to ${dao}`);
    },
    onError: (error: Error) =>
      toast.error(describeDaoError(error, connection.daoAccountId ?? "the treasury")),
  });

  /* --------------------------------------------------------------------- view */

  const busy = runChainMutation.isPending || !!runningStation;

  const orgSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" data-testid="poc-org-switcher" />}
      >
        <BankIcon className="h-3.5 w-3.5" />
        {activeOrg?.name ?? "select an organization"}
      </DropdownMenuTrigger>
      <OrgSwitcherMenuContent
        organizations={organizations}
        activeOrgId={activeOrgId}
        align="start"
      />
    </DropdownMenu>
  );

  if (!activeOrgId) {
    return (
      <PageContainer variant="wide">
        <div className="space-y-6">
          <PageHeader
            icon={FlaskIcon}
            label="Prototype"
            headerTestId="prototype-staking-poc.heading"
            title="Node lifecycle"
            subtitle="initialize node → fund it → sponsor it → participate in governance"
            description="Your wallet applies, an admin approves and funds the team treasury, the team stakes its pool and locks veNEAR, and an endowment sponsors the stake and delegates its voting power to the team."
            actions={
              <Button variant="outline" size="sm" onClick={refresh} data-testid="poc-refresh">
                <ArrowsClockwiseIcon className="h-3.5 w-3.5" />
                refresh
              </Button>
            }
          />
          <Card>
            <CardContent className="space-y-4 p-4">
              <SectionHeader title="Who does what" sectionTestId="poc-actors" />
              <div className="flex flex-wrap items-center gap-2">
                {orgSwitcher}
                <span className="text-xs text-muted-foreground">
                  the node is created for this organization
                </span>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="poc-org-required">
                select an organization to continue
              </p>
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer variant="wide">
      <div className="space-y-6">
        <PageHeader
          icon={FlaskIcon}
          label="Prototype"
          headerTestId="prototype-staking-poc.heading"
          title="Node lifecycle"
          subtitle="initialize node → fund it → sponsor it → participate in governance"
          description="Your wallet applies, an admin approves and funds the team treasury, the team stakes its pool and locks veNEAR, and an endowment sponsors the stake and delegates its voting power to the team. Treasury calls are staged as proposals you can pass by vote."
          actions={
            <Button variant="outline" size="sm" onClick={refresh} data-testid="poc-refresh">
              <ArrowsClockwiseIcon className="h-3.5 w-3.5" />
              refresh
            </Button>
          }
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 p-4">
                <SectionHeader title="Who does what" sectionTestId="poc-actors" />

                <div className="flex flex-wrap items-center gap-2">
                  {orgSwitcher}
                  <span className="text-xs text-muted-foreground">
                    the node is created for this organization
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <ActorTile
                    icon={WalletIcon}
                    label="you"
                    account={sessionAccount}
                    caption="applies; as admin — approves, assigns the pool, funds the treasury; votes on treasury proposals"
                    connected={!!sessionAccount}
                    popover={{
                      title: "You",
                      body: "Your SIWN wallet. Submits the application, and as the admin approves it, assigns the pre-deployed pool, and funds the team treasury from this wallet.",
                      links: sessionAccount
                        ? [
                            {
                              label: `${sessionAccount} on nearblocks`,
                              href: nearblocksAccount(sessionAccount),
                            },
                          ]
                        : [],
                    }}
                  />
                  <ActorTile
                    icon={GavelIcon}
                    label="team"
                    account={team || null}
                    caption="the node's account — owns the pool and the tenant, locks veNEAR, votes in House of Stake"
                    connected={connection.daoAccountId === team && !!team}
                    popover={{
                      title: "Team",
                      body: "The DAO linked to your organization. Owns the node's validator pool and the tenant config, stakes its own skin in the game, locks NEAR for its veNEAR, and casts the votes the sponsor's stake buys.",
                      links: [
                        { label: "deploy one on trezu.app/create", href: TREZU_CREATE_URL },
                        ...(team
                          ? [{ label: `${team} on nearblocks`, href: nearblocksAccount(team) }]
                          : []),
                      ],
                    }}
                  />
                  <ActorTile
                    icon={StackIcon}
                    label="endowment"
                    account={endowment || null}
                    caption="the sponsor — you connect as a member (Requestor); your wallet stages the proposals, approvers vote on trezu.app"
                    connected={
                      !!endowment &&
                      (sessionCanProposeEndowment || connection.daoAccountId === endowment)
                    }
                    popover={{
                      title: "Endowment (sponsor)",
                      body: "A separate treasury that puts up the capital: its NEAR is locked in a veNEAR lockup, staked into the node's pool from that lockup, and all of its voting power is delegated to the team. You connect to it through policy membership — a wallet holding AddProposal rights stages each step as a proposal — or by connecting the treasury itself in Trezu. Its approvers pass the proposals by vote. Optional — it never blocks the team's track.",
                      links: endowment
                        ? [
                            {
                              label: "view proposals on trezu",
                              href: `https://trezu.app/${endowment}`,
                            },
                            {
                              label: `${endowment} on nearblocks`,
                              href: nearblocksAccount(endowment),
                            },
                          ]
                        : [],
                    }}
                  />
                </div>

                {!connection.daoAccountId && (
                  <div className="flex items-center gap-4 rounded-[10px] border border-border bg-muted p-3">
                    <UnderConstruction
                      className="w-20 shrink-0"
                      url={TREZU_CREATE_URL}
                      tooltip="deploy a confidential treasury on trezu.app"
                      runtimeConfig={runtimeConfig}
                    />
                    <div className="space-y-1">
                      <p className="text-[13px] text-foreground">No treasury connected.</p>
                      <p className="text-xs text-muted-foreground">
                        Only one treasury connects at a time — the page switches as stations need
                        it.
                      </p>
                      <Button
                        size="sm"
                        onClick={() => void connection.connect().catch(() => {})}
                        disabled={connection.status === "connecting"}
                        data-testid="poc-connect"
                      >
                        {connection.status === "connecting" ? "connecting…" : "connect a treasury"}
                      </Button>
                    </div>
                  </div>
                )}

                {connection.daoAccountId && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-muted px-3 py-2">
                    <span className="min-w-0 text-xs text-muted-foreground">
                      Trezu connected as{" "}
                      <code className="font-mono text-foreground">{connection.daoAccountId}</code>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void connection.disconnect()}
                      data-testid="poc-disconnect"
                    >
                      disconnect
                    </Button>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <PocFormField form={form} name="name" label="Node name" placeholder="Thing" />
                  <PocField
                    id="poc-slug"
                    label="Node slug"
                    value={slug}
                    onChange={() => {}}
                    placeholder="select an organization"
                    disabled
                  />
                  {team ? (
                    <PocField
                      id="poc-team"
                      label="Team wallet"
                      value={team}
                      onChange={() => {}}
                      disabled
                    />
                  ) : (
                    <PocConnectField
                      id="poc-team"
                      label="Team wallet"
                      connecting={
                        connectTeamDaoMutation.isPending || connection.status === "connecting"
                      }
                      onClick={() => connectTeamDaoMutation.mutate()}
                      testId="poc-connect-team"
                    >
                      connect team DAO
                    </PocConnectField>
                  )}
                  <div className="space-y-1">
                    {values.endowmentLinked ? (
                      <PocField
                        id="poc-endowment"
                        label="Endowment treasury"
                        value={team}
                        onChange={() => {}}
                        disabled
                      />
                    ) : !values.endowment ? (
                      <PocConnectField
                        id="poc-endowment"
                        label="Endowment treasury"
                        connecting={
                          connectEndowmentMutation.isPending || connection.status === "connecting"
                        }
                        onClick={() => connectEndowmentMutation.mutate()}
                        testId="poc-connect-endowment"
                      >
                        connect endowment via Trezu
                      </PocConnectField>
                    ) : (
                      <PocFormField form={form} name="endowment" label="Endowment treasury" />
                    )}
                    <button
                      type="button"
                      onClick={() => form.setFieldValue("endowmentLinked", !values.endowmentLinked)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                      data-testid="poc-link-treasuries"
                    >
                      {values.endowmentLinked ? (
                        <>
                          <LinkIcon className="h-3 w-3" /> same as team wallet
                        </>
                      ) : (
                        <>
                          <LinkBreakIcon className="h-3 w-3" /> separate treasuries
                        </>
                      )}
                    </button>
                  </div>
                  <PocFormField
                    form={form}
                    name="pool"
                    label="Staking pool"
                    placeholder={POOL_PLACEHOLDER}
                  />
                  <PocFormField
                    form={form}
                    name="sponsorAmount"
                    label="Sponsor NEAR"
                    type="number"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <span className="text-xs text-muted-foreground">act as</span>
              <ToggleGroup
                value={[values.lens]}
                onValueChange={(value) => {
                  const next = LENS_OPTIONS.find((option) => value.includes(option.id));
                  if (next) form.setFieldValue("lens", next.id);
                }}
                data-testid="poc-lens"
              >
                {LENS_OPTIONS.map((option) => (
                  <ToggleGroupItem
                    key={option.id}
                    value={option.id}
                    className="px-4 py-2 text-sm"
                    data-testid={`poc-lens-${option.id}`}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <InfoPopover
                title="Acting lens"
                body="Pick the role you're acting as. Stations another role signs stay visible but dimmed, with their actions hidden."
              />
            </div>

            <Card>
              <CardContent className="space-y-4 p-4">
                <SectionHeader
                  title="Lifecycle"
                  sectionTestId="poc-lifecycle"
                  action={
                    <div className="flex flex-wrap items-center gap-2">
                      {stagedCount > 0 && (
                        <Badge variant="secondary">{stagedCount} awaiting votes</Badge>
                      )}
                      <Button
                        size="sm"
                        onClick={() => runChainMutation.mutate()}
                        disabled={busy || runnable.length === 0}
                        data-testid="poc-run-chain"
                      >
                        {busy ? (
                          <Spinner className="h-3.5 w-3.5" />
                        ) : (
                          <PlayIcon className="h-3.5 w-3.5" />
                        )}
                        run what I can sign
                      </Button>
                    </div>
                  }
                />

                {runnable.length === 0 && upcoming && (
                  <p className="text-xs text-muted-foreground" data-testid="poc-next-hint">
                    next up is <span className="text-foreground">{upcoming.def.title}</span>, signed
                    by the {SIGNER_LABEL[upcoming.def.signer]}
                    {upcoming.signerAccountId ? (
                      <>
                        {" "}
                        (<code className="font-mono">{upcoming.signerAccountId}</code>)
                      </>
                    ) : null}
                    {upcoming.blockedBy === "input" && upcoming.blockedReason
                      ? ` — ${upcoming.blockedReason}`
                      : !upcoming.signerConnected
                        ? " — connect it to continue"
                        : ""}
                  </p>
                )}

                <div className="space-y-5">
                  {PHASES.map((phase) => {
                    const phaseStations = stations.filter(
                      (station) => station.def.phase === phase.id,
                    );
                    return (
                      <div key={phase.id} className="space-y-3">
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-sm font-semibold text-foreground">{phase.title}</h3>
                          <span className="min-w-0 text-xs text-muted-foreground">
                            {phase.blurb}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {phaseStations.map((station) => (
                            <StationRow
                              key={station.def.id}
                              station={station}
                              dimmed={signerLens(station.def.signer) !== values.lens}
                              busy={busy}
                              policy={policyFor(station.def.signer)}
                              warning={station.def.id === "approve" ? platformAuditWarning : null}
                              membersHref={station.def.id === "approve" ? trezuMembersUrl : null}
                              onRun={() => void runStation(station).catch(() => {})}
                              onConnect={() =>
                                void requireConnected(station.def.signer).catch((error) =>
                                  toast.error(
                                    error instanceof Error ? error.message : String(error),
                                  ),
                                )
                              }
                              onApprove={(proposalId) =>
                                approveMutation.mutate({
                                  signer: station.def.signer,
                                  dao: station.signerAccountId ?? "",
                                  proposalId,
                                })
                              }
                              extra={
                                station.def.id === "publish" && facts.tenantDeployed ? (
                                  <div
                                    className="flex flex-wrap items-center gap-2"
                                    data-testid="poc-publish-state"
                                  >
                                    {facts.configPublished ? (
                                      <>
                                        <Badge variant="success" className="text-[10px]">
                                          config live
                                        </Badge>
                                        {tenantUrl && (
                                          <a
                                            href={tenantUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground"
                                            data-testid="poc-open-tenant"
                                          >
                                            open {tenantUrl.replace(/^https?:\/\//, "")}
                                            <ArrowSquareOutIcon className="h-3 w-3 shrink-0" />
                                          </a>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        config not published yet — the open link appears once the
                                        config goes live. The proposal itself often reports failed
                                        even when the write lands — this check is the source of
                                        truth.
                                        {team ? (
                                          <>
                                            {" · "}
                                            <a
                                              href={`https://trezu.app/${team}`}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="underline hover:text-foreground"
                                            >
                                              view proposals on trezu
                                            </a>
                                          </>
                                        ) : null}
                                      </span>
                                    )}
                                  </div>
                                ) : station.def.id === "vote" && govProposals.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Select
                                      value={
                                        values.govProposalId ||
                                        (govProposal ? String(govProposal.id) : "")
                                      }
                                      items={govProposals.map((proposal) => ({
                                        value: String(proposal.id),
                                        label: `#${proposal.id} ${proposal.title ?? "untitled"}`,
                                      }))}
                                      onValueChange={(value) => {
                                        if (value !== null)
                                          form.setFieldValue("govProposalId", value);
                                      }}
                                    >
                                      <SelectTrigger size="sm" className="w-56">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {govProposals.map((proposal) => (
                                          <SelectItem key={proposal.id} value={String(proposal.id)}>
                                            #{proposal.id} {proposal.title ?? "untitled"}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={values.voteOption}
                                      onValueChange={(value) => {
                                        if (value !== null) form.setFieldValue("voteOption", value);
                                      }}
                                    >
                                      <SelectTrigger size="sm" className="w-28">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {VOTE_OPTIONS.map((option) => (
                                          <SelectItem
                                            key={option}
                                            value={option}
                                            disabled={
                                              govProposal?.status === "Sandbox" && option !== "For"
                                            }
                                          >
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : station.def.id === "fund" ? (
                                  <p
                                    className="text-xs text-muted-foreground"
                                    data-testid="poc-fund-detail"
                                  >
                                    transfers {formatNear(fundYocto.toString())} — the remaining
                                    stations need {formatNear(requirementYocto.toString())} of
                                    attached deposits
                                  </p>
                                ) : null
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <ArrowDownIcon className="h-3.5 w-3.5 shrink-0" />
                  rewards accrue to the pool's stakers and owner — the cycle starts again for the
                  next node.
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardContent className="space-y-3 p-4">
                <SectionHeader
                  title="Team"
                  sectionTestId="poc-team-state"
                  action={
                    <InfoPopover
                      title="Voter and pool owner"
                      body="Registers in veNEAR, locks NEAR for voting power, owns the node's pool, and casts the votes — its own lock plus any delegated sponsor power."
                      links={
                        team
                          ? [{ label: "House of Stake profile", href: hosDelegateUrl(team) }]
                          : [{ label: "House of Stake", href: HOS_URL }]
                      }
                    />
                  }
                />
                <InfoRow
                  label="registered in veNEAR"
                  value={
                    <Badge variant={facts.teamRegistered ? "default" : "outline"}>
                      {String(facts.teamRegistered)}
                    </Badge>
                  }
                />
                <InfoRow
                  label="own veNEAR"
                  value={formatNear(sumVenear(teamVe?.account.balance))}
                  mono
                />
                <InfoRow
                  label="delegated in"
                  value={formatNear(sumVenear(teamVe?.account.delegated_balance))}
                  mono
                />
                <InfoRow label="treasury balance" value={formatNear(treasuryBalance)} mono />
                <InfoRow
                  label="bootstrap requirement"
                  value={formatNear(requirementYocto.toString())}
                  mono
                />
                <InfoRow
                  label="funded"
                  value={
                    <Badge variant={treasuryFunded ? "default" : "outline"}>
                      {String(treasuryFunded)}
                    </Badge>
                  }
                />
                <InfoRow
                  label="vote cast"
                  value={
                    voteRecord != null ? (
                      (VOTE_OPTIONS[voteRecord] ?? String(voteRecord))
                    ) : team ? (
                      <a
                        href={hosDelegateUrl(team)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                      >
                        view on House of Stake
                      </a>
                    ) : (
                      "—"
                    )
                  }
                />
                {treasuriesShared && (
                  <p className="text-xs text-muted-foreground">
                    same account as the endowment — the sponsor stations are skipped
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <SectionHeader
                  title="Endowment"
                  sectionTestId="poc-endowment-state"
                  action={
                    <InfoPopover
                      title="veNEAR lockup"
                      body="The sponsor's lockup: locked NEAR mints veNEAR voting power, and the same locked NEAR is staked into the node's pool from the lockup — the capital works twice."
                      links={[{ label: "House of Stake", href: HOS_URL }]}
                    />
                  }
                />
                <InfoRow
                  label="lockup"
                  value={
                    endowmentLockup ? (
                      <a
                        href={nearblocksAccount(endowmentLockup)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                      >
                        {endowmentLockup}
                      </a>
                    ) : (
                      "—"
                    )
                  }
                  mono
                />
                <InfoRow label="locked" value={formatNear(endowmentLockupState?.locked)} mono />
                <InfoRow label="liquid" value={formatNear(endowmentLockupState?.liquid)} mono />
                <InfoRow
                  label="staked from lockup"
                  value={formatNear(endowmentLockupState?.knownDeposited)}
                  mono
                />
                <InfoRow
                  label="unstaking"
                  value={
                    endowmentPoolAccount && isPositive(endowmentPoolAccount.unstaked_balance)
                      ? `${formatNear(endowmentPoolAccount.unstaked_balance)}${endowmentPoolAccount.can_withdraw ? "" : " — epoch window"}`
                      : "—"
                  }
                  mono
                />
                <InfoRow
                  label="delegates to"
                  value={
                    endowmentVe && endowmentVe.account.delegations.length > 0
                      ? endowmentVe.account.delegations
                          .map((entry) => `${entry.account_id} (${entry.bps} bps)`)
                          .join(", ")
                      : "—"
                  }
                  mono
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-4">
                <SectionHeader
                  title="Pool"
                  sectionTestId="poc-pool"
                  action={
                    <div className="flex items-center gap-1.5">
                      {poolMeta?.paused && <Badge variant="destructive">paused</Badge>}
                      {whitelisted !== undefined && (
                        <Badge variant={whitelisted ? "default" : "outline"}>
                          {whitelisted ? "whitelisted" : "not whitelisted"}
                        </Badge>
                      )}
                    </div>
                  }
                />
                {poolMeta ? (
                  <>
                    <InfoRow
                      label="owner"
                      value={
                        poolMeta.owner ? (
                          <a
                            href={accountExplorerUrl(poolMeta.owner)}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                          >
                            {poolMeta.owner}
                          </a>
                        ) : (
                          "unknown"
                        )
                      }
                      mono
                    />
                    <InfoRow
                      label="rewards"
                      value={
                        poolMeta.owner && team && poolMeta.owner === team ? (
                          <Badge variant="default">team-owned — fees come to the team</Badge>
                        ) : (
                          <Badge variant="outline">external pool</Badge>
                        )
                      }
                    />
                    <InfoRow
                      label="fee"
                      value={poolFeePercent(poolMeta.fee) ?? poolMeta.fee}
                      mono
                    />
                    <InfoRow label="total staked" value={formatNear(poolMeta.totalStaked)} mono />
                    <InfoRow
                      label="team stake"
                      value={formatNear(teamPoolAccount?.staked_balance)}
                      mono
                    />
                    <InfoRow
                      label="endowment stake"
                      value={formatNear(endowmentPoolAccount?.staked_balance)}
                      mono
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    pool not found or not a staking pool contract
                  </p>
                )}
              </CardContent>
            </Card>

            {application && (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <SectionHeader
                    title="Tenant"
                    sectionTestId="poc-tenant"
                    action={
                      <InfoPopover
                        title="Tenant state"
                        body="The DB record and binding are created by the approve station; the config goes live in FastKV when the team's publish proposal passes. A tenant page that renders means its config is live — a 404 means it is not. Locally the link points at <slug>.localhost, which the host maps back to the gateway alias in development."
                        links={
                          tenantUrl && facts.configPublished
                            ? [{ label: "open the tenant", href: tenantUrl }]
                            : []
                        }
                      />
                    }
                  />
                  <InfoRow
                    label="record"
                    value={
                      tenantRecord ? (
                        <span
                          className="inline-flex flex-wrap items-center gap-2"
                          data-testid="poc-tenant-record"
                        >
                          <Badge variant="success" className="text-[10px]">
                            {tenantRecord.status}
                          </Badge>
                          <span className="truncate">{tenantRecord.name}</span>
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          not created
                        </Badge>
                      )
                    }
                  />
                  <InfoRow
                    label="binding"
                    value={
                      tenantBinding ? (
                        <span
                          className="inline-flex flex-wrap items-center gap-2"
                          data-testid="poc-tenant-binding"
                        >
                          <span className="truncate">{tenantBinding.hostname}</span>
                          {tenantBinding.isPrimary && (
                            <Badge variant="outline" className="text-[10px]">
                              primary
                            </Badge>
                          )}
                          {tenantBinding.isVerified && (
                            <Badge variant="outline" className="text-[10px]">
                              verified
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          not created
                        </Badge>
                      )
                    }
                    mono
                  />
                  <InfoRow
                    label="config"
                    value={
                      <span
                        className="inline-flex flex-wrap items-center gap-2"
                        data-testid="poc-tenant-config"
                      >
                        {facts.configPublished ? (
                          <Badge variant="success" className="text-[10px]">
                            live
                          </Badge>
                        ) : publishPendingProposal ? (
                          <Badge variant="warning" className="text-[10px]">
                            awaiting votes #{publishPendingProposal.id}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            not published
                          </Badge>
                        )}
                        {fastKvUrl && (
                          <a
                            href={fastKvUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                          >
                            view on FastKV
                          </a>
                        )}
                      </span>
                    }
                  />
                  <InfoRow
                    label="hostname"
                    value={
                      tenantUrl && facts.configPublished ? (
                        <a
                          href={tenantUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                        >
                          {tenantDisplayHost}
                        </a>
                      ) : (
                        tenantDisplayHost
                      )
                    }
                    mono
                  />
                  <InfoRow
                    label="application"
                    value={
                      application ? `${application.reviewStatus} / ${application.applyStatus}` : "—"
                    }
                    mono
                  />
                  {tenantUrl && facts.configPublished && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      nativeButton={false}
                      render={
                        <a href={tenantUrl} target="_blank" rel="noreferrer">
                          <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                          open {tenantUrl.replace(/^https?:\/\//, "")}
                        </a>
                      }
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            <SectionHeader title="Log" sectionTestId="poc-log" />
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">no actions signed yet</p>
            ) : (
              <div className="space-y-1" data-testid="poc-log-entries">
                {entries.map((entry) => (
                  <div key={entry.id} className="font-mono text-xs text-muted-foreground">
                    <span className="text-foreground">{entry.time}</span> — {entry.label}
                    {entry.detail ? ` — ${entry.detail}` : ""}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ subviews */

function PocField({
  id,
  label,
  value,
  onChange,
  type,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="font-mono text-xs"
        data-testid={id}
      />
    </Field>
  );
}

type PocFormFieldName = "name" | "pool" | "endowment" | "sponsorAmount";

function PocFormField({
  form,
  name,
  label,
  type,
  placeholder,
  disabled,
}: {
  form: PocForm;
  name: PocFormFieldName;
  label: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <Field>
          <FieldLabel htmlFor={`poc-${name}`}>{label}</FieldLabel>
          <Input
            id={`poc-${name}`}
            type={type}
            value={field.state.value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(event) => field.handleChange(event.target.value)}
            className="font-mono text-xs"
            data-testid={`poc-${name}`}
          />
        </Field>
      )}
    </form.Field>
  );
}

/** Takes the place of a PocField when the wallet it holds is not set yet. */
function PocConnectField({
  id,
  label,
  connecting,
  onClick,
  testId,
  children,
}: {
  id: string;
  label: string;
  connecting: boolean;
  onClick: () => void;
  testId: string;
  children: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Button
        id={id}
        variant="outline"
        size="sm"
        className="w-full justify-start font-mono text-xs"
        onClick={onClick}
        disabled={connecting}
        data-testid={testId}
      >
        {connecting ? "connecting…" : children}
      </Button>
    </Field>
  );
}

function ActorTile({
  icon: Icon,
  label,
  account,
  caption,
  connected,
  popover,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  account: string | null;
  caption: string;
  connected: boolean;
  popover: { title: string; body: string; links: InfoPopoverLink[] };
}) {
  return (
    <div className="space-y-1.5 rounded-[10px] border border-border bg-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {connected ? (
            <CheckCircleIcon className="h-3.5 w-3.5 text-status-success-foreground" />
          ) : (
            <CircleIcon className="h-3.5 w-3.5 text-border" />
          )}
          <InfoPopover title={popover.title} body={popover.body} links={popover.links} />
        </div>
      </div>
      <p className="break-all font-mono text-xs text-foreground">{account ?? "not set"}</p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{caption}</p>
    </div>
  );
}

function TrezuMembersLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
    >
      add members on trezu
    </a>
  );
}

function StationStatusBadge({
  status,
  hasPendingSteps,
}: {
  status: StationState["status"];
  hasPendingSteps: boolean;
}) {
  const { label, variant, id } = ((): {
    label: string;
    variant: "success" | "warning" | "destructive" | "secondary" | "outline";
    id: string;
  } => {
    switch (status) {
      case "done":
        return { label: "done", variant: "success", id: "done" };
      case "staged":
        return hasPendingSteps
          ? { label: "pending", variant: "warning", id: "pending" }
          : { label: "awaiting votes", variant: "warning", id: "awaiting-votes" };
      case "failed":
        return { label: "failed", variant: "destructive", id: "failed" };
      case "blocked":
        return { label: "blocked", variant: "secondary", id: "blocked" };
      case "running":
        return { label: "running…", variant: "secondary", id: "running" };
      case "skipped":
        return { label: "skipped", variant: "outline", id: "skipped" };
      default:
        return { label: "ready", variant: "outline", id: "ready" };
    }
  })();
  return (
    <Badge variant={variant} className="text-[10px]" data-testid={`poc-status-${id}`}>
      {label}
    </Badge>
  );
}

function StationIcon({ status }: { status: StationState["status"] }) {
  const className = "h-4 w-4 shrink-0";
  switch (status) {
    case "done":
      return <CheckCircleIcon className={`${className} text-status-success-foreground`} />;
    case "running":
      return <Spinner className={`${className} text-muted-foreground`} />;
    case "staged":
      return <CircleDashedIcon className={`${className} text-brand-accent-border`} />;
    case "failed":
      return <XCircleIcon className={`${className} text-destructive`} />;
    case "skipped":
      return <ProhibitIcon className={`${className} text-border`} />;
    default:
      return <CircleIcon className={`${className} text-border`} />;
  }
}

function StationRow({
  station,
  dimmed,
  busy,
  policy,
  warning,
  membersHref,
  onRun,
  onConnect,
  onApprove,
  extra,
}: {
  station: StationState;
  dimmed: boolean;
  busy: boolean;
  policy: Parameters<typeof approvalThreshold>[0];
  warning?: string | null;
  membersHref?: string | null;
  onRun: () => void;
  onConnect: () => void;
  onApprove: (proposalId: number) => void;
  extra?: ReactNode;
}) {
  const { def, status } = station;
  const settled = status === "done" || status === "skipped";
  const stagedSteps = station.steps.filter((step) => step.pendingProposal);

  return (
    <div
      className={`space-y-2 rounded-[10px] border border-border bg-card p-3 transition-opacity ${
        dimmed ? "opacity-45" : ""
      }`}
      data-testid={`poc-station-${def.id}`}
      data-status={status}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-4 shrink-0 font-mono text-xs text-muted-foreground">
          {def.index}
        </span>
        <StationIcon status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-sm ${status === "failed" ? "text-destructive" : "text-foreground"}`}
            >
              {def.title}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {def.signer === "session" ? "you" : SIGNER_LABEL[def.signer]}
            </Badge>
            <StationStatusBadge
              status={status}
              hasPendingSteps={station.steps.some((step) => step.status === "pending")}
            />
            {warning && (
              <InfoPopover
                icon={<WarningIcon className="h-3.5 w-3.5" />}
                className="text-status-warning-foreground hover:text-status-warning-foreground"
                title="platform audit seat"
                body={warning}
                links={membersHref ? [{ label: "add members on trezu", href: membersHref }] : []}
                testId={`poc-warning-${def.id}`}
              />
            )}
            <InfoPopover
              title={def.title}
              body={
                <div className="space-y-1.5">
                  <p>{def.purpose}</p>
                  <p className="text-muted-foreground">
                    signed by the {SIGNER_LABEL[def.signer]}
                    {station.signerAccountId ? ` (${station.signerAccountId})` : ""}
                  </p>
                  {def.steps.some((step) => step.plan) && (
                    <ul className="space-y-0.5 font-mono text-[11px] text-muted-foreground">
                      {def.steps.map((step) => (
                        <li key={step.id}>
                          {step.plan ? describePlan(step.plan) : `${step.label} (off-chain)`}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              }
            />
          </div>
          {station.blockedReason && status !== "done" && status !== "skipped" && (
            <p
              className={`text-xs ${status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
            >
              {status === "failed" ? "failed: " : "blocked: "}
              {station.blockedReason}
              {station.blockedReason.includes("is not a member of") && membersHref && (
                <TrezuMembersLink href={membersHref} />
              )}
            </p>
          )}
          {status === "skipped" && station.skipReason && (
            <p className="text-xs text-muted-foreground">skipped: {station.skipReason}</p>
          )}
          {extra}
        </div>
        {!settled && !dimmed && (
          <div className="flex shrink-0 flex-col items-end gap-1">
            {!station.signerConnected ? (
              <Button variant="outline" size="sm" onClick={onConnect} disabled={busy}>
                connect {station.def.signer === "endowment" ? "endowment" : "team"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onRun}
                disabled={!station.canRun || busy}
                title={station.runBlockReason ?? undefined}
                data-testid={`poc-run-${def.id}`}
              >
                {status === "running" ? "running…" : "run"}
              </Button>
            )}
          </div>
        )}
      </div>

      {stagedSteps.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-2 pl-7">
          {stagedSteps.map((step) => {
            const proposal = step.pendingProposal as SputnikProposal;
            const threshold = approvalThreshold(policy, proposal);
            const alreadyVoted = station.signerAccountId
              ? !!proposal.votes[station.signerAccountId]
              : false;
            return (
              <div
                key={step.id}
                className="flex flex-wrap items-center justify-between gap-2"
                data-testid={`poc-staged-${def.id}-${step.id}`}
              >
                <span className="min-w-0 font-mono text-[11px] text-muted-foreground">
                  #{proposal.id} {step.label} · {threshold.approved}
                  {threshold.required == null ? "" : `/${threshold.required}`} approvals
                </span>
                {!dimmed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onApprove(proposal.id)}
                    disabled={busy || !station.signerConnected || alreadyVoted}
                    data-testid={`poc-approve-${proposal.id}`}
                  >
                    {alreadyVoted
                      ? "voted"
                      : station.signerConnected
                        ? "approve"
                        : "connect to approve"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
