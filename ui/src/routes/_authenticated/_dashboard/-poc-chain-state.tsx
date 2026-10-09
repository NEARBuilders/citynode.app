import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
  Badge,
  Button,
  InfoPopover,
  InfoRow,
  SectionHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { presentationLabel } from "@/lib/presentation-label";
import {
  accountExplorerUrl,
  formatNear,
  isPositive,
  nearblocksAccount,
  poolFeePercent,
  sumVenear,
  VOTE_OPTIONS,
} from "./-poc-chain";
import { HOS_URL, hosDelegateUrl, type PocLifecycle } from "./-poc-lifecycle";

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
    >
      {children}
    </a>
  );
}

function YesNo({ value }: { value: boolean }) {
  const translate = useAppTranslation();
  return (
    <Badge variant={value ? "success" : "outline"}>
      {value ? translate("common.yes") : translate("common.no")}
    </Badge>
  );
}

function Panel({
  title,
  testId,
  info,
  action,
  children,
}: {
  title: string;
  testId: string;
  info?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SectionHeader
        title={title}
        sectionTestId={testId}
        action={
          <div className="flex items-center gap-2">
            {action}
            {info}
          </div>
        }
      />
      <div>{children}</div>
    </div>
  );
}

export function PocChainState({ lc }: { lc: PocLifecycle }) {
  const { locale } = useAppLocale();
  const translate = useAppTranslation();
  const {
    team,
    facts,
    teamVe,
    treasuryBalance,
    requirementYocto,
    treasuryFunded,
    voteRecord,
    treasuriesShared,
    endowmentLockup,
    endowmentLockupState,
    endowmentAvailableYocto,
    endowmentPoolAccount,
    endowmentVe,
    poolMeta,
    whitelisted,
    teamPoolAccount,
    application,
    tenantRecord,
    tenantBinding,
    publishPendingProposal,
    fastKvUrl,
    tenantUrl,
    tenantDisplayHost,
  } = lc;

  return (
    <Tabs defaultValue="team" data-testid="poc-chain-state">
      <TabsList>
        <TabsTrigger value="team" data-testid="poc-state-tab-team">
          {translate("org.team")}
        </TabsTrigger>
        <TabsTrigger value="endowment" data-testid="poc-state-tab-endowment">
          {translate("lifecycle.endowment")}
        </TabsTrigger>
        <TabsTrigger value="pool" data-testid="poc-state-tab-pool">
          {translate("stake.pool")}
        </TabsTrigger>
        {application && (
          <TabsTrigger value="tenant" data-testid="poc-state-tab-tenant">
            {translate("common.tenant")}
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="team" className="pt-4">
        <Panel
          title={translate("org.team")}
          testId="poc-team-state"
          info={
            <InfoPopover
              title={translate("lifecycle.voterOwner")}
              body={translate("lifecycle.teamDescription")}
              links={
                team
                  ? [{ label: translate("lifecycle.hosProfile"), href: hosDelegateUrl(team) }]
                  : [{ label: "House of Stake", href: HOS_URL }]
              }
            />
          }
        >
          <InfoRow
            label={translate("lifecycle.registered")}
            value={<YesNo value={facts.teamRegistered} />}
          />
          <InfoRow
            label={translate("lifecycle.ownVeNear")}
            value={formatNear(sumVenear(teamVe?.account.balance), locale)}
            mono
          />
          <InfoRow
            label={translate("lifecycle.delegatedIn")}
            value={formatNear(sumVenear(teamVe?.account.delegated_balance), locale)}
            mono
          />
          <InfoRow
            label={translate("lifecycle.treasuryBalance")}
            value={formatNear(treasuryBalance, locale)}
            mono
          />
          <InfoRow
            label={translate("lifecycle.bootstrapRequired")}
            value={formatNear(requirementYocto.toString(), locale)}
            mono
          />
          <InfoRow label={translate("lifecycle.funded")} value={<YesNo value={treasuryFunded} />} />
          <InfoRow
            label={translate("lifecycle.voteCast")}
            value={
              voteRecord != null ? (
                presentationLabel(VOTE_OPTIONS[voteRecord] ?? String(voteRecord), translate)
              ) : team ? (
                <ExternalLink href={hosDelegateUrl(team)}>
                  {translate("lifecycle.hosView")}
                </ExternalLink>
              ) : (
                "—"
              )
            }
          />
          {treasuriesShared && (
            <p className="pt-3 text-sm text-muted-foreground">
              {translate("lifecycle.sameAccountHint")}
            </p>
          )}
        </Panel>
      </TabsContent>

      <TabsContent value="endowment" className="pt-4">
        <Panel
          title={translate("lifecycle.endowment")}
          testId="poc-endowment-state"
          info={
            <InfoPopover
              title={translate("lifecycle.veNearLockup")}
              body={translate("lifecycle.lockupDescription")}
              links={[{ label: "House of Stake", href: HOS_URL }]}
            />
          }
        >
          <InfoRow
            label={translate("lifecycle.lockup")}
            value={
              endowmentLockup ? (
                <ExternalLink href={nearblocksAccount(endowmentLockup)}>
                  {endowmentLockup}
                </ExternalLink>
              ) : (
                "—"
              )
            }
            mono
          />
          <InfoRow
            label={translate("lifecycle.locked")}
            value={formatNear(endowmentLockupState?.locked, locale)}
            mono
          />
          <InfoRow
            label={translate("lifecycle.liquid")}
            value={formatNear(endowmentLockupState?.liquid, locale)}
            mono
          />
          <InfoRow
            label={translate("lifecycle.availableStake")}
            value={
              endowmentAvailableYocto != null
                ? formatNear(endowmentAvailableYocto.toString(), locale)
                : "—"
            }
            mono
          />
          <InfoRow
            label={translate("lifecycle.stakedLockup")}
            value={formatNear(endowmentLockupState?.knownDeposited, locale)}
            mono
          />
          <InfoRow
            label={translate("lifecycle.unstaking")}
            value={
              endowmentPoolAccount && isPositive(endowmentPoolAccount.unstaked_balance)
                ? endowmentPoolAccount.can_withdraw
                  ? formatNear(endowmentPoolAccount.unstaked_balance, locale)
                  : translate("lifecycle.epochWindow", {
                      amount: formatNear(endowmentPoolAccount.unstaked_balance, locale),
                    })
                : "—"
            }
            mono
          />
          <InfoRow
            label={translate("lifecycle.delegatesTo")}
            value={
              endowmentVe && endowmentVe.account.delegations.length > 0
                ? endowmentVe.account.delegations
                    .map((entry) =>
                      translate("lifecycle.delegationNamed", {
                        account: entry.account_id,
                        bps: new Intl.NumberFormat(locale).format(entry.bps),
                      }),
                    )
                    .join(", ")
                : "—"
            }
            mono
          />
        </Panel>
      </TabsContent>

      <TabsContent value="pool" className="pt-4">
        <Panel
          title={translate("stake.pool")}
          testId="poc-pool"
          action={
            <>
              {poolMeta?.paused && (
                <Badge variant="destructive">{translate("lifecycle.paused")}</Badge>
              )}
              {whitelisted !== undefined && (
                <Badge variant={whitelisted ? "success" : "outline"}>
                  {translate(whitelisted ? "lifecycle.whitelisted" : "lifecycle.notWhitelisted")}
                </Badge>
              )}
            </>
          }
        >
          {poolMeta ? (
            <>
              <InfoRow
                label={translate("common.owner")}
                value={
                  poolMeta.owner ? (
                    <ExternalLink href={accountExplorerUrl(poolMeta.owner)}>
                      {poolMeta.owner}
                    </ExternalLink>
                  ) : (
                    translate("common.unknown")
                  )
                }
                mono
              />
              <InfoRow
                label={translate("lifecycle.rewards")}
                value={
                  poolMeta.owner && team && poolMeta.owner === team ? (
                    <Badge variant="success">{translate("lifecycle.teamOwned")}</Badge>
                  ) : (
                    <Badge variant="outline">{translate("lifecycle.externalPool")}</Badge>
                  )
                }
              />
              <InfoRow
                label={translate("stake.fee")}
                value={poolFeePercent(poolMeta.fee, locale) ?? poolMeta.fee}
                mono
              />
              <InfoRow
                label={translate("stake.total")}
                value={formatNear(poolMeta.totalStaked, locale)}
                mono
              />
              <InfoRow
                label={translate("stake.teamStake")}
                value={formatNear(teamPoolAccount?.staked_balance, locale)}
                mono
              />
              <InfoRow
                label={translate("lifecycle.endowmentStake")}
                value={formatNear(endowmentPoolAccount?.staked_balance, locale)}
                mono
              />
            </>
          ) : (
            <p className="py-3 text-sm text-muted-foreground">
              {translate("lifecycle.poolNotFound")}
            </p>
          )}
        </Panel>
      </TabsContent>

      {application && (
        <TabsContent value="tenant" className="pt-4">
          <Panel
            title={translate("common.tenant")}
            testId="poc-tenant"
            info={
              <InfoPopover
                title={translate("lifecycle.tenantState")}
                body={translate("lifecycle.tenantDescription")}
                links={
                  tenantUrl && facts.configPublished
                    ? [{ label: translate("lifecycle.openTenant"), href: tenantUrl }]
                    : []
                }
              />
            }
          >
            <InfoRow
              label={translate("lifecycle.record")}
              value={
                tenantRecord ? (
                  <span
                    className="inline-flex flex-wrap items-center gap-2"
                    data-testid="poc-tenant-record"
                  >
                    <Badge variant="success">
                      {presentationLabel(tenantRecord.status ?? "member", translate)}
                    </Badge>
                    <span className="truncate">{tenantRecord.name}</span>
                  </span>
                ) : (
                  <Badge variant="outline">{translate("lifecycle.notCreated")}</Badge>
                )
              }
            />
            <InfoRow
              label={translate("lifecycle.binding")}
              value={
                tenantBinding ? (
                  <span
                    className="inline-flex flex-wrap items-center gap-2"
                    data-testid="poc-tenant-binding"
                  >
                    <span className="truncate">{tenantBinding.hostname}</span>
                    {tenantBinding.isPrimary && (
                      <Badge variant="outline">{translate("common.primary")}</Badge>
                    )}
                    {tenantBinding.isVerified && (
                      <Badge variant="outline">{translate("common.verified")}</Badge>
                    )}
                  </span>
                ) : (
                  <Badge variant="outline">{translate("lifecycle.notCreated")}</Badge>
                )
              }
              mono
            />
            <InfoRow
              label={translate("lifecycle.config")}
              value={
                <span
                  className="inline-flex flex-wrap items-center gap-2"
                  data-testid="poc-tenant-config"
                >
                  {facts.configPublished ? (
                    <Badge variant="success">{translate("common.live")}</Badge>
                  ) : publishPendingProposal ? (
                    <Badge variant="warning">
                      {translate("lifecycle.awaitingProposal", {
                        proposal: publishPendingProposal.id,
                      })}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{translate("tenant.notPublished")}</Badge>
                  )}
                  {fastKvUrl && (
                    <ExternalLink href={fastKvUrl}>
                      {translate("lifecycle.viewFastkv")}
                    </ExternalLink>
                  )}
                </span>
              }
            />
            <InfoRow
              label={translate("lifecycle.hostname")}
              value={
                tenantUrl && facts.configPublished ? (
                  <ExternalLink href={tenantUrl}>{tenantDisplayHost}</ExternalLink>
                ) : (
                  tenantDisplayHost
                )
              }
              mono
            />
            <InfoRow
              label={translate("common.application")}
              value={application ? `${application.reviewStatus} / ${application.applyStatus}` : "—"}
              mono
            />
            {tenantUrl && facts.configPublished && (
              <Button
                variant="outline"
                className="mt-3"
                nativeButton={false}
                render={
                  <a href={tenantUrl} target="_blank" rel="noreferrer">
                    <ArrowSquareOutIcon />
                    {translate("common.open")}
                    {tenantUrl.replace(/^https?:\/\//, "")}
                  </a>
                }
              />
            )}
          </Panel>
        </TabsContent>
      )}
    </Tabs>
  );
}
