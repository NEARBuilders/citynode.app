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
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
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
  accountExplorerUrl,
  approvalThreshold,
  describePlan,
  formatNear,
  isPositive,
  nearblocksAccount,
  poolFeePercent,
  type SputnikProposal,
  sumVenear,
  VOTE_OPTIONS,
} from "./-poc-chain";
import type { PocForm } from "./-poc-form";
import {
  HOS_URL,
  hosDelegateUrl,
  POOL_PLACEHOLDER,
  TREZU_CREATE_URL,
  usePocLifecycle,
} from "./-poc-lifecycle";
import { LENS_OPTIONS, PHASES, SIGNER_LABEL, type StationState, signerLens } from "./-poc-stations";

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
  const { auth: routeAuth, runtimeConfig } = Route.useRouteContext();
  const {
    sessionAccount,
    connection,
    organizations,
    activeOrg,
    activeOrgId,
    form,
    values,
    slug,
    team,
    endowment,
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
    policyFor,
    platformAuditWarning,
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
  } = usePocLifecycle(routeAuth, runtimeConfig);

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

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
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
                  <div className="flex items-center gap-4 rounded-xl border border-border bg-muted p-3">
                    <UnderConstruction
                      className="w-20 shrink-0"
                      url={TREZU_CREATE_URL}
                      tooltip="deploy a confidential treasury on trezu.app"
                      runtimeConfig={runtimeConfig}
                    />
                    <div className="space-y-1">
                      <p className="text-sm text-foreground">No treasury connected.</p>
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
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted px-3 py-2">
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
                      <PocFormField form={form} name="endowment" label="Endowment treasury" mono />
                    )}
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      onClick={() => form.setFieldValue("endowmentLinked", !values.endowmentLinked)}
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
                    </Button>
                  </div>
                  <PocFormField
                    form={form}
                    name="pool"
                    label="Staking pool"
                    placeholder={POOL_PLACEHOLDER}
                    mono
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
                                        <Badge variant="success">config live</Badge>
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
                          <Badge variant="success">{tenantRecord.status}</Badge>
                          <span className="truncate">{tenantRecord.name}</span>
                        </span>
                      ) : (
                        <Badge variant="outline">not created</Badge>
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
                          {tenantBinding.isPrimary && <Badge variant="outline">primary</Badge>}
                          {tenantBinding.isVerified && <Badge variant="outline">verified</Badge>}
                        </span>
                      ) : (
                        <Badge variant="outline">not created</Badge>
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
                          <Badge variant="success">live</Badge>
                        ) : publishPendingProposal ? (
                          <Badge variant="warning">
                            awaiting votes #{publishPendingProposal.id}
                          </Badge>
                        ) : (
                          <Badge variant="outline">not published</Badge>
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
        className="font-mono"
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
  mono,
}: {
  form: PocForm;
  name: PocFormFieldName;
  label: string;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  mono?: boolean;
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
            className={mono ? "font-mono" : undefined}
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
        className="w-full justify-start"
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
    <div className="space-y-1.5 rounded-xl border border-border bg-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {connected ? (
            <CheckCircleIcon className="h-3.5 w-3.5 text-success-muted-foreground" />
          ) : (
            <CircleIcon className="h-3.5 w-3.5 text-border" />
          )}
          <InfoPopover title={popover.title} body={popover.body} links={popover.links} />
        </div>
      </div>
      <p className="break-all font-mono text-xs text-foreground">{account ?? "not set"}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{caption}</p>
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
    <Badge variant={variant} data-testid={`poc-status-${id}`}>
      {label}
    </Badge>
  );
}

function StationIcon({ status }: { status: StationState["status"] }) {
  const className = "h-4 w-4 shrink-0";
  switch (status) {
    case "done":
      return <CheckCircleIcon className={`${className} text-success-muted-foreground`} />;
    case "running":
      return (
        <span className="inline-flex shrink-0 text-muted-foreground">
          <Spinner className={className} />
        </span>
      );
    case "staged":
      return <CircleDashedIcon className={`${className} text-brand`} />;
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
      className={`space-y-2 rounded-xl border border-border bg-card p-3 transition-opacity ${
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
            <Badge variant="outline">
              {def.signer === "session" ? "you" : SIGNER_LABEL[def.signer]}
            </Badge>
            <StationStatusBadge
              status={status}
              hasPendingSteps={station.steps.some((step) => step.status === "pending")}
            />
            {warning && (
              <InfoPopover
                icon={<WarningIcon className="h-3.5 w-3.5 text-warning-muted-foreground" />}
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
                    <ul className="space-y-0.5 font-mono text-xs text-muted-foreground">
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
                <span className="min-w-0 font-mono text-xs text-muted-foreground">
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
