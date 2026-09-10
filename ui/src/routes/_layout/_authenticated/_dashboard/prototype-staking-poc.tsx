import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import {
  AlertTriangle,
  ArrowDown,
  Building2,
  CheckCircle2,
  Circle,
  CircleDashed,
  CircleSlash,
  ExternalLink,
  FlaskConical,
  Gavel,
  Layers,
  Link2,
  Link2Off,
  Play,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";
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
  canAccountApprove,
  type DaoPlan,
  describePlan,
  fetchActiveGovProposals,
  fetchDaoProposals,
  fetchGovProof,
  fetchGovVoteRecord,
  fetchLockupAccountId,
  fetchLockupState,
  fetchPoolMeta,
  fetchSputnikPolicy,
  fetchVenearAccount,
  formatNear,
  getNear,
  isPositive,
  nearblocksAccount,
  type PoolAccountView,
  parseNearAmount,
  poolFeePercent,
  poolValidatorUrl,
  remainingToFund,
  remainingToLock,
  remainingToStake,
  type SputnikProposal,
  signPlanAsDao,
  sumVenear,
  txHash,
  VOTE_DEPOSIT,
  VOTE_OPTIONS,
  VOTING_ACCOUNT,
  type VoteOption,
  WHITELIST_ACCOUNT,
  waitFor,
  yoctoArg,
} from "./-poc-chain";
import {
  buildStations,
  type ChainFacts,
  deriveStations,
  nextStation,
  PHASES,
  pendingProposalCount,
  runnableRun,
  SIGNER_LABEL,
  type SignerKind,
  type StationId,
  type StationState,
  type StepState,
} from "./-poc-stations";

const DEFAULT_POOL = "everything.pool.near";
const REFETCH_MS = 15_000;
const TREZU_CREATE_URL = "https://trezu.app/create";
const HOS_URL = "https://gov.houseofstake.org";
const hosDelegateUrl = (accountId: string) => `${HOS_URL}/delegates/${accountId}`;

type LensId = "you" | "endowment" | "team";

const LENS_OPTIONS: readonly { id: LensId; label: string }[] = [
  { id: "you", label: "you" },
  { id: "team", label: "team" },
  { id: "endowment", label: "endowment" },
];

const signerLens = (signer: SignerKind): LensId => (signer === "session" ? "you" : signer);

interface LogEntry {
  id: string;
  time: string;
  label: string;
  detail?: string;
}

/** Proposals the cleanup panel can delete via `reject` (admin, nothing applied). */
function proposalCleanupMode(proposal: { reviewStatus: string; applyStatus: string }) {
  if (proposal.reviewStatus === "pending" && proposal.applyStatus !== "applying") return "reject";
  if (
    proposal.reviewStatus === "approved" &&
    (proposal.applyStatus === "not_started" || proposal.applyStatus === "failed")
  ) {
    return "reject";
  }
  return null;
}

/** "near builders" → "Near Builders" — the default node name from the org name. */
const titleCase = (value: string) =>
  value.replace(/(^|[\s-])[a-z]/g, (match) => match.toUpperCase());

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/prototype-staking-poc")({
  head: () => ({
    meta: [
      { title: "Node lifecycle POC | app" },
      {
        name: "description",
        content:
          "One node, end to end: your wallet applies, a sponsor endowment funds its pool, the team votes in House of Stake.",
      },
    ],
  }),
  component: NodeLifecyclePocPage,
});

function NodeLifecyclePocPage() {
  useDaoAutoRestore();
  const apiClient = useApiClient();
  const auth = useAuthClient();
  const connection = useDaoConnection();
  const queryClient = useQueryClient();
  const sessionAccount = useNearAccount();
  const { auth: routeAuth, runtimeConfig } = Route.useRouteContext();

  const gatewayId = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";
  const baseAccount = getAccount(runtimeConfig);
  const activeOrgId = routeAuth.activeOrganizationId;
  const isAdmin = routeAuth.isAdmin;

  const [linkTreasuries, setLinkTreasuries] = useState(true);
  const [lens, setLens] = useState<LensId>("you");

  const [endowmentInput, setEndowmentInput] = useState("");
  const [connectedTeamDao, setConnectedTeamDao] = useState<string | null>(null);
  const [poolInput, setPoolInput] = useState(DEFAULT_POOL);
  const [nameInput, setNameInput] = useState("");
  const [linkedAmounts, setLinkedAmounts] = useState(true);
  const [lockAmount, setLockAmount] = useState("1");
  const [stakeAmount, setStakeAmount] = useState("1");
  const [delegatePct, setDelegatePct] = useState("100");
  const [voteOption, setVoteOption] = useState<VoteOption>("For");
  const [selectedGovProposal, setSelectedGovProposal] = useState("");

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

  const lastAutoName = useRef<string | null>(null);
  const lastOrgId = useRef<string | null>(null);
  useEffect(() => {
    if (activeOrgId === lastOrgId.current) return;
    lastOrgId.current = activeOrgId;
    setFailures({});
    setSelectedGovProposal("");
    setLinkTreasuries(true);
    setEndowmentInput("");
    setConnectedTeamDao(null);
    if (activeOrgName) {
      const defaultName = titleCase(activeOrgName);
      lastAutoName.current = defaultName;
      setNameInput(defaultName);
    }
  }, [activeOrgId, activeOrgName]);

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
  const endowment = (linkTreasuries ? team : endowmentInput).trim();
  const pool = poolInput.trim();
  const treasuriesShared = !!team && team === endowment;

  const lockYocto = useMemo(() => parseNearAmount(lockAmount), [lockAmount]);
  const stakeYocto = useMemo(() => parseNearAmount(stakeAmount), [stakeAmount]);
  const delegateBpsValue = useMemo(() => {
    const value = Number(delegatePct);
    if (!delegatePct || Number.isNaN(value) || value < 1 || value > 100) return null;
    return Math.floor(value) * 100;
  }, [delegatePct]);

  const { data: endowmentVe } = useQuery(
    poc(["venear", endowment], () => fetchVenearAccount(endowment), !!endowment),
  );
  const { data: teamVe } = useQuery(poc(["venear", team], () => fetchVenearAccount(team), !!team));
  const { data: endowmentLockupId } = useQuery(
    poc(["lockup-id", endowment], () => fetchLockupAccountId(endowment), !!endowment),
  );
  const endowmentLockup = endowmentLockupId ?? "";
  const lockupDeployed = endowmentVe?.internal.lockup_version != null;

  const { data: lockupState } = useQuery(
    poc(
      ["lockup-state", endowmentLockup],
      () => fetchLockupState(endowmentLockup),
      !!endowmentLockup && lockupDeployed,
    ),
  );
  const { data: poolMeta } = useQuery(poc(["pool-meta", pool], () => fetchPoolMeta(pool), !!pool));
  const { data: poolAccount } = useQuery(
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
    govProposals.find((p) => String(p.id) === selectedGovProposal) ?? govProposals[0] ?? null;

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
  /** Recent node applications — the cleanup panel's delete candidates. */
  const { data: cleanupProposals = [] } = useQuery(
    poc(
      ["node-proposals"],
      async () => {
        const result = await apiClient.proposals.getProposals({ pluginId: "node", limit: 8 });
        return result.data;
      },
      isAdmin,
    ),
  );

  /* -------------------------------------------------------------------- model */

  const facts: ChainFacts = {
    applicationProposed: !!application,
    configPublished: !!registryApp,
    applicationApplied: application?.applyStatus === "applied",
    tenantDeployed: !!tenantBinding || !!orgTenant,
    endowmentRegistered: endowmentVe != null,
    lockupDeployed,
    lockupFunded: isPositive(lockupState?.liquid) || isPositive(lockupState?.locked),
    nearLocked: isPositive(lockupState?.locked),
    poolSelected: !!lockupState?.stakingPool && lockupState.stakingPool === pool,
    stakedFromLockup: isPositive(lockupState?.knownDeposited),
    teamRegistered: teamVe != null,
    delegated: !!endowmentVe?.account.delegations.some((entry) => entry.account_id === team),
    voteCast: voteRecord != null,
    unstaked: !isPositive(lockupState?.knownDeposited),
    withdrawn: poolAccount ? !isPositive(poolAccount.unstaked_balance) : true,
    poolReleased: !lockupState?.stakingPool,
    delegationsCleared: endowmentVe ? endowmentVe.account.delegations.length === 0 : true,
    treasuriesShared,
  };

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
  else if (!nameInput.trim()) blockers.apply = "enter a node name";
  if (!sessionAccount) blockers.approve = "sign in to approve";
  else if (!isAdmin) blockers.approve = "admin access required — sign in as an admin";
  else if (!team) blockers.approve = "connect your team DAO with Trezu";
  else if (daoBlocked) blockers.approve = daoBlocked;
  else if (daoPolicyForAudit && !isExplicitDaoMember(daoPolicyForAudit, sessionAccount)) {
    blockers.approve = `${sessionAccount} is not a member of ${team}`;
  }
  const platformAuditWarning =
    daoPolicyForAudit && baseAccount && !isExplicitDaoMember(daoPolicyForAudit, baseAccount) && team
      ? `the platform audit account ${baseAccount} is not a member of ${team}`
      : null;
  const trezuMembersUrl = team ? `https://trezu.app/${team}/members` : null;
  if (!team) blockers.publish = "connect your team DAO with Trezu";
  else if (application && facts.configPublished && !isAdmin) {
    blockers.publish = "config is live — an admin must mark the application applied";
  }
  if (!team) blockers["register-team"] = "connect your team DAO with Trezu";
  if (!team) blockers.vote = "connect your team DAO with Trezu";
  if (!lockYocto || !stakeYocto) blockers.endow = "enter lock and stake amounts";
  if (!pool) blockers.stake = "enter a staking pool";
  if (lockYocto && stakeYocto && !endowmentLockup) {
    blockers.stake = "resolving the endowment lockup…";
  }
  if (!delegateBpsValue) blockers.delegate = "delegate between 1 and 100 percent";
  if (!team) blockers.delegate = "connect your team DAO with Trezu";
  else if (!govProposal) blockers.vote = "no active House of Stake proposal";
  if (!endowment) blockers.unstake = "set an endowment treasury";
  else if (!endowmentLockup) blockers.unstake = "resolving the endowment lockup…";
  if (!endowment) blockers.undelegate = "set an endowment treasury";

  const stationDefs = useMemo(
    () =>
      buildStations({
        slug,
        pool,
        endowmentAccount: endowment,
        teamAccount: team,
        endowmentLockup,
        lockYocto,
        stakeYocto,
        delegateBps: delegateBpsValue,
        govProposalId: govProposal?.id ?? null,
      }),
    [
      slug,
      pool,
      endowment,
      team,
      endowmentLockup,
      lockYocto,
      stakeYocto,
      delegateBpsValue,
      govProposal?.id,
    ],
  );

  const stations = deriveStations({
    stations: stationDefs,
    facts,
    proposalsBySigner: { endowment: endowmentProposals, team: teamProposals },
    accounts: { session: sessionAccount, endowment, team },
    connectedDao: connection.daoAccountId,
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

  /** Executes one station's remaining steps in order, as its declared signer. */
  const runStation = async (station: StationState) => {
    const { def } = station;
    setRunningStation(def.id);
    setFailures((prev) => ({ ...prev, [def.id]: undefined }));
    try {
      await requireConnected(def.signer);
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
    switch (step.id) {
      case "register":
      case "register-team": {
        const account = accountFor(station.def.signer) ?? "";
        const ve = await fetchVenearAccount(account).catch(() => null);
        if (ve) {
          log("already registered in veNEAR — skipping");
          return null;
        }
        return plan;
      }
      case "deploy-lockup": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (state) {
          log("lockup already deployed — skipping");
          return null;
        }
        return plan;
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
      case "lock":
      case "stake": {
        if (!endowmentLockup) {
          throw new Error("resolving the endowment lockup — run again in a moment");
        }
        const want = yoctoArg(plan.args.amount);
        if (want <= 0n) return plan;
        const state = await fetchLockupState(endowmentLockup).catch(() => null);
        if (!state) return plan;
        const remaining =
          step.id === "lock"
            ? remainingToLock(want.toString(), state)
            : remainingToStake(want.toString(), state);
        if (remaining <= 0n) {
          log(step.id === "lock" ? "already locked — skipping" : "already staked — skipping");
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
      case "withdraw-all": {
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
          name: nameInput.trim(),
          slug,
          motivation: `Prototype application for ${nameInput.trim()}`,
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
          name: nameInput.trim(),
          slug,
          motivation: `Prototype application for ${nameInput.trim()}`,
          orgId: activeOrgId ?? "",
          accountId: team,
          submitterAccountId: sessionAccount ?? "",
          hostname: `${slug}.${gatewayId}`,
        });
        log(`created tenant, node and binding for ${slug}`, `node ${node.nodeId}`);
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

    if (stepId === "publish") {
      const result = await publishDaoTenantConfig(apiClient, {
        daoAccountId: team,
        gatewayId,
        baseAccount,
        hostname: `${slug}.${gatewayId}`,
        title: nameInput.trim() || slug,
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
          vote: voteOption,
          merkle_proof: proof[0],
          v_account: proof[1],
        },
        gas: "300 Tgas",
        attachedDeposit: VOTE_DEPOSIT,
      });
      log(`voted ${voteOption} on proposal ${govProposal.id} as ${signerId}`, txHash(result));
      return;
    }

    if (!step.plan) throw new Error(`step ${stepId} has no plan`);
    if (!signerId) throw new Error("Signer account not set");
    const plan = await precheckPlan(station, step);
    if (!plan) return;
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

  const approveMutation = useMutation({
    mutationFn: async ({ dao, proposalId }: { dao: string; proposalId: number }) => {
      if (!sessionAccount) throw new Error("Sign in with your NEAR wallet first");
      const plan = approveProposalPlan(dao, proposalId);
      return auth.near
        .getNearClient()
        .transaction(sessionAccount)
        .functionCall(plan.receiverId, plan.methodName, plan.args, {
          gas: "200 Tgas",
          attachedDeposit: 0n,
        })
        .send({ waitUntil: "EXECUTED" });
    },
    onSuccess: (result, variables) => {
      toast.success(`approved proposal ${variables.proposalId}`);
      log(`voted Approve on ${variables.dao} proposal ${variables.proposalId}`, txHash(result));
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
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
      setLinkTreasuries(false);
      setEndowmentInput(dao);
      return dao;
    },
    onSuccess: (dao) => {
      log(`endowment treasury set to ${dao}`);
    },
    onError: (error: Error) =>
      toast.error(describeDaoError(error, connection.daoAccountId ?? "the treasury")),
  });

  const cleanupMutation = useMutation({
    mutationFn: async ({ entityId, updatedAt }: { entityId: string; updatedAt: string }) =>
      apiClient.proposals.reject({
        pluginId: "node",
        entityId,
        expectedUpdatedAt: updatedAt,
        reason: "cleanup — superseded application",
      }),
    onSuccess: (result) => {
      toast.success(`deleted application ${result.data.entityId}`);
      log(`deleted application ${result.data.entityId}`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const markAppliedMutation = useMutation({
    mutationFn: async ({
      entityId,
      updatedAt,
      payload,
    }: {
      entityId: string;
      updatedAt: string;
      payload: unknown;
    }) => {
      if (!isAdmin) throw new Error("admin access required — sign in as an admin");
      const accountId = (() => {
        try {
          return parseNodeProposalPayload(payload).accountId;
        } catch {
          return null;
        }
      })();
      if (accountId) {
        const published = await apiClient.apps
          .getRegistryApp({ accountId, gatewayId })
          .then((result) => result.data ?? null)
          .catch(() => null);
        if (!published) throw new Error(`config not published for ${accountId} — publish it first`);
      }
      return apiClient.proposals.markApplied({
        pluginId: "node",
        entityId,
        expectedUpdatedAt: updatedAt,
        appliedResourceId: entityId,
      });
    },
    onSuccess: (result) => {
      toast.success(`marked application ${result.data.entityId} applied`);
      log(`marked application ${result.data.entityId} applied`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /* --------------------------------------------------------------------- view */

  const busy = runChainMutation.isPending || !!runningStation;

  const orgSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="poc-org-switcher">
          <Building2 className="h-3.5 w-3.5" />
          {activeOrg?.name ?? "select an organization"}
        </Button>
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
            icon={FlaskConical}
            label="Prototype"
            headerTestId="prototype-staking-poc.heading"
            title="Node lifecycle"
            subtitle="initialize node → fund it → participate in governance"
            description="Your wallet applies, a sponsor endowment funds the node's pool, the team takes its vote to House of Stake. Treasury calls are staged as proposals you can pass by vote."
            actions={
              <Button variant="outline" size="sm" onClick={refresh} data-testid="poc-refresh">
                <RefreshCw className="h-3.5 w-3.5" />
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
          icon={FlaskConical}
          label="Prototype"
          headerTestId="prototype-staking-poc.heading"
          title="Node lifecycle"
          subtitle="initialize node → fund it → participate in governance"
          description="Your wallet applies, a sponsor endowment funds the node's pool, the team takes its vote to House of Stake. Treasury calls are staged as proposals you can pass by vote."
          actions={
            <Button variant="outline" size="sm" onClick={refresh} data-testid="poc-refresh">
              <RefreshCw className="h-3.5 w-3.5" />
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
                    icon={Wallet}
                    label="you"
                    account={sessionAccount}
                    caption="applies; approves the tenant as admin; votes on treasury proposals"
                    connected={!!sessionAccount}
                    popover={{
                      title: "You",
                      body: "Your SIWN wallet. Submits the application and casts the member votes that release staged treasury proposals.",
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
                    icon={Gavel}
                    label="team"
                    account={team || null}
                    caption="the node's account — owns the tenant, receives the vote, votes"
                    connected={connection.daoAccountId === team && !!team}
                    popover={{
                      title: "Team",
                      body: "The DAO linked to your organization. Owns the tenant config, receives the endowment's delegated voting power, votes in House of Stake.",
                      links: [
                        { label: "deploy one on trezu.app/create", href: TREZU_CREATE_URL },
                        ...(team
                          ? [{ label: `${team} on nearblocks`, href: nearblocksAccount(team) }]
                          : []),
                      ],
                    }}
                  />
                  <ActorTile
                    icon={Layers}
                    label="endowment"
                    account={endowment || null}
                    caption="the sponsor — locks NEAR, stakes the pool, delegates its vote"
                    connected={connection.daoAccountId === endowment && !!endowment}
                    popover={{
                      title: "Endowment (sponsor)",
                      body: "A confidential multisig that puts up the capital: locks NEAR, stakes the node's pool, hands its voting power to the team.",
                      links: [
                        { label: "deploy one on trezu.app/create", href: TREZU_CREATE_URL },
                        ...(endowment
                          ? [
                              {
                                label: `${endowment} on nearblocks`,
                                href: nearblocksAccount(endowment),
                              },
                            ]
                          : []),
                      ],
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
                  <PocField
                    id="poc-name"
                    label="Node name"
                    value={nameInput}
                    onChange={setNameInput}
                    placeholder="Thing"
                  />
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
                    {!linkTreasuries && !endowmentInput ? (
                      <PocConnectField
                        id="poc-endowment"
                        label="Endowment treasury"
                        connecting={
                          connectEndowmentMutation.isPending || connection.status === "connecting"
                        }
                        onClick={() => connectEndowmentMutation.mutate()}
                        testId="poc-connect-endowment"
                      >
                        connect endowment
                      </PocConnectField>
                    ) : (
                      <PocField
                        id="poc-endowment"
                        label="Endowment treasury"
                        value={linkTreasuries ? team : endowmentInput}
                        onChange={setEndowmentInput}
                        disabled={linkTreasuries}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setLinkTreasuries((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                      data-testid="poc-link-treasuries"
                    >
                      {linkTreasuries ? (
                        <>
                          <Link2 className="h-3 w-3" /> same as team wallet
                        </>
                      ) : (
                        <>
                          <Link2Off className="h-3 w-3" /> separate treasuries
                        </>
                      )}
                    </button>
                  </div>
                  <PocField
                    id="poc-pool"
                    label="Staking pool"
                    value={poolInput}
                    onChange={setPoolInput}
                  />
                  {linkedAmounts ? (
                    <div className="space-y-1">
                      <PocField
                        id="poc-amount"
                        label="Amount (NEAR)"
                        value={lockAmount}
                        onChange={(value) => {
                          setLockAmount(value);
                          setStakeAmount(value);
                        }}
                        type="number"
                      />
                      <button
                        type="button"
                        onClick={() => setLinkedAmounts(false)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                        data-testid="poc-link-amounts"
                      >
                        <Link2 className="h-3 w-3" /> lock and stake together
                      </button>
                    </div>
                  ) : (
                    <>
                      <PocField
                        id="poc-lock"
                        label="Lock (NEAR)"
                        value={lockAmount}
                        onChange={setLockAmount}
                        type="number"
                      />
                      <div className="space-y-1">
                        <PocField
                          id="poc-stake"
                          label="Stake (NEAR)"
                          value={stakeAmount}
                          onChange={setStakeAmount}
                          type="number"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setStakeAmount(lockAmount);
                            setLinkedAmounts(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline hover:text-foreground"
                          data-testid="poc-link-amounts"
                        >
                          <Link2Off className="h-3 w-3" /> separate amounts
                        </button>
                      </div>
                    </>
                  )}
                  <PocField
                    id="poc-delegate"
                    label="Delegate to team (%)"
                    value={delegatePct}
                    onChange={setDelegatePct}
                    type="number"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <span className="text-xs text-muted-foreground">act as</span>
              <ToggleGroup
                type="single"
                value={lens}
                onValueChange={(value) => {
                  if (value) setLens(value as LensId);
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
                          <Play className="h-3.5 w-3.5" />
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
                              dimmed={signerLens(station.def.signer) !== lens}
                              busy={busy}
                              policy={policyFor(station.def.signer)}
                              sessionAccount={sessionAccount}
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
                                            <ExternalLink className="h-3 w-3 shrink-0" />
                                          </a>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">
                                        config not published yet — the open link appears once the DAO
                                        proposal passes
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
                                      value={govProposal ? String(govProposal.id) : ""}
                                      onValueChange={setSelectedGovProposal}
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
                                      value={voteOption}
                                      onValueChange={(value) => setVoteOption(value as VoteOption)}
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
                                ) : null
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isAdmin && cleanupProposals.length > 0 && (
                  <div
                    className="space-y-1.5 border-t border-border pt-3"
                    data-testid="poc-cleanup"
                  >
                    <p className="text-xs font-semibold text-foreground">node applications</p>
                    {cleanupProposals.map((proposal) => {
                      const mode = proposalCleanupMode(proposal);
                      const applying =
                        proposal.reviewStatus === "approved" && proposal.applyStatus === "applying";
                      return (
                        <div
                          key={proposal.id}
                          className="flex items-center justify-between gap-2"
                          data-testid={`poc-cleanup-row-${proposal.entityId}`}
                        >
                          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                            {proposal.entityId} · {proposal.reviewStatus}/{proposal.applyStatus}
                          </span>
                          {applying ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                markAppliedMutation.mutate({
                                  entityId: proposal.entityId,
                                  updatedAt: proposal.updatedAt,
                                  payload: proposal.payload,
                                })
                              }
                              disabled={busy || markAppliedMutation.isPending}
                              title="checks the published config, then marks the application applied"
                              data-testid={`poc-mark-applied-${proposal.entityId}`}
                            >
                              mark applied
                            </Button>
                          ) : mode ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                cleanupMutation.mutate({
                                  entityId: proposal.entityId,
                                  updatedAt: proposal.updatedAt,
                                })
                              }
                              disabled={busy || cleanupMutation.isPending}
                              data-testid={`poc-cleanup-delete-${proposal.entityId}`}
                            >
                              delete
                            </Button>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              keep
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
                  <ArrowDown className="h-3.5 w-3.5 shrink-0" />
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
                      title="Delegate and voter"
                      body="Registers in veNEAR to receive the endowment's voting power. Its votes are what the node's stake buys."
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
                    same account as the endowment — the delegate stations are skipped
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
                      body="Locked NEAR mints veNEAR voting power. The lockup also holds the stake delegated to the node's validator pool."
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
                <InfoRow label="liquid" value={formatNear(lockupState?.liquid)} mono />
                <InfoRow label="locked" value={formatNear(lockupState?.locked)} mono />
                <InfoRow
                  label="pool"
                  value={
                    lockupState?.stakingPool ? (
                      <a
                        href={poolValidatorUrl(lockupState.stakingPool)}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-border underline-offset-2 transition-colors hover:decoration-foreground"
                      >
                        {lockupState.stakingPool}
                      </a>
                    ) : (
                      "none"
                    )
                  }
                  mono
                />
                <InfoRow label="staked" value={formatNear(lockupState?.knownDeposited)} mono />
                <InfoRow
                  label="unstaking"
                  value={
                    poolAccount && isPositive(poolAccount.unstaked_balance)
                      ? `${formatNear(poolAccount.unstaked_balance)}${poolAccount.can_withdraw ? "" : " — epoch window"}`
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
                      label="our stake"
                      value={formatNear(poolAccount?.staked_balance)}
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

            {tenantBinding && (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <SectionHeader
                    title="Tenant"
                    sectionTestId="poc-tenant"
                    action={
                      <InfoPopover
                        title="Tenant resolution"
                        body="The host resolves a tenant from the request hostname. Locally the gateway id is still the production domain, so the link points at <slug>.localhost, which the host maps back to the gateway alias in development."
                        links={tenantUrl ? [{ label: "open the tenant", href: tenantUrl }] : []}
                      />
                    }
                  />
                  <InfoRow
                    label="hostname"
                    value={
                      tenantUrl ? (
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
                  {tenantUrl && (
                    <Button variant="outline" size="sm" asChild className="w-full">
                      <a href={tenantUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        open {tenantUrl.replace(/^https?:\/\//, "")}
                      </a>
                    </Button>
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
            <CheckCircle2 className="h-3.5 w-3.5 text-status-success-foreground" />
          ) : (
            <Circle className="h-3.5 w-3.5 text-border" />
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
      return <CheckCircle2 className={`${className} text-status-success-foreground`} />;
    case "running":
      return <Spinner className={`${className} text-muted-foreground`} />;
    case "staged":
      return <CircleDashed className={`${className} text-brand-accent-border`} />;
    case "failed":
      return <XCircle className={`${className} text-destructive`} />;
    case "skipped":
      return <CircleSlash className={`${className} text-border`} />;
    default:
      return <Circle className={`${className} text-border`} />;
  }
}

function StationRow({
  station,
  dimmed,
  busy,
  policy,
  sessionAccount,
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
  sessionAccount: string | null;
  warning?: string | null;
  membersHref?: string | null;
  onRun: () => void;
  onConnect: () => void;
  onApprove: (proposalId: number) => void;
  extra?: ReactNode;
}) {
  const { def, status } = station;
  const settled = status === "done" || status === "skipped";
  const canApprove = canAccountApprove(policy, sessionAccount);
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
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
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
            const alreadyVoted = sessionAccount ? !!proposal.votes[sessionAccount] : false;
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
                    disabled={busy || !canApprove || alreadyVoted}
                    data-testid={`poc-approve-${proposal.id}`}
                  >
                    {alreadyVoted ? "voted" : canApprove ? "approve" : "not an approver"}
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
