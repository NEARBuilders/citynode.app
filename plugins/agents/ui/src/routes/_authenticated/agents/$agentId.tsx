import type { StatusResponse } from "@near-intents-agent-api/contracts/api";
import { ArrowLeftIcon, CopyIcon, PlusIcon, TerminalIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer, PageHeader, SectionHeader } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  agentBalancesOptions,
  agentBudgetOptions,
  agentDetailOptions,
  agentGrantsOptions,
  agentHistoryOptions,
  agentPolicyOptions,
  agentTimelockOptions,
  agentWalletOptions,
  useAgentsClient,
} from "./-agent-queries";
import { ExecuteConsole } from "./-execute-console";
import { formatBalance, formatDateTime, formatUsd } from "./-format";
import { GrantIssueDialog, RevokeGrantButton } from "./-grant-dialog";
import { StatusBadge } from "./-status-badge";
import "../../../styles.css";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  head: () => ({
    meta: [
      { title: "Agent · Agents" },
      { name: "description", content: "Wallet, balances, policy and activity for one agent." },
    ],
  }),
  component: AgentDetailPage,
});

function CopyRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <button
        type="button"
        data-testid={testId}
        className="flex items-center gap-2 font-mono text-sm text-foreground"
        onClick={() => {
          navigator.clipboard.writeText(value);
        }}
      >
        {value}
        <CopyIcon size={14} className="text-muted-foreground" />
      </button>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  );
}

const CAPABILITY_LABELS = ["swap", "confidential", "cross_chain_withdraw", "sign_message"] as const;

function PolicySection({ agentId }: { agentId: string }) {
  const apiClient = useAgentsClient();
  const { data: policy, isPending } = useQuery(agentPolicyOptions(apiClient, agentId));

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (!policy || policy.status === "NONE") {
    return (
      <p className="text-sm text-muted-foreground">
        No provider policy applied yet — it lands with the first owner-signed policy write.
      </p>
    );
  }

  const capabilities = policy.policy?.capabilities;
  const rules = policy.policy?.rules;

  return (
    <div className="flex flex-col gap-3">
      <InfoRow label="Status">
        <Badge variant={policy.status === "APPLIED" ? "default" : "secondary"}>
          {policy.status}
        </Badge>
      </InfoRow>
      <InfoRow label="Revision">{policy.revision ?? "—"}</InfoRow>
      <InfoRow label="Provider synced">
        {policy.providerPolicySynced ? "yes" : "pending readback"}
      </InfoRow>
      {capabilities && (
        <InfoRow label="Capabilities">
          <span className="flex flex-wrap justify-end gap-1">
            {CAPABILITY_LABELS.map((cap) => {
              const allowed = capabilities[cap].allowed;
              return (
                <Badge key={cap} variant={allowed ? "default" : "outline"}>
                  {cap}
                </Badge>
              );
            })}
          </span>
        </InfoRow>
      )}
      {rules?.allowed_tokens && rules.allowed_tokens.length > 0 && (
        <InfoRow label="Allowed tokens">
          <span className="text-right font-mono text-xs">
            {rules.allowed_tokens.slice(0, 6).join(", ")}
            {(rules.allowed_tokens.length ?? 0) > 6 ? "…" : ""}
          </span>
        </InfoRow>
      )}
      {rules?.rate_limit && (
        <InfoRow label="Rate limit">{rules.rate_limit.max_per_hour}/hour</InfoRow>
      )}
    </div>
  );
}

function BudgetRow({
  label,
  window,
}: {
  label: string;
  window: {
    limitUsd: string | null;
    spentUsd: string;
    remainingUsd: string | null;
    resetsAt: string | null;
  };
}) {
  return (
    <div className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">
          {formatUsd(window.spentUsd)}
          {window.limitUsd !== null ? ` / ${formatUsd(window.limitUsd)}` : " (uncapped)"}
        </span>
      </div>
      {window.limitUsd !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground"
            style={{
              width: `${Math.min(100, (Number(window.spentUsd) / Number(window.limitUsd)) * 100)}%`,
            }}
          />
        </div>
      )}
      {window.resetsAt && (
        <span className="text-xs text-muted-foreground">
          resets {formatDateTime(window.resetsAt)}
        </span>
      )}
    </div>
  );
}

function HistorySection({ agentId }: { agentId: string }) {
  const apiClient = useAgentsClient();
  const { data: history, isPending } = useQuery(agentHistoryOptions(apiClient, agentId));

  if (isPending) return <Skeleton className="h-32 w-full" />;
  if (!history || history.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="agents-history">
      {history.map((raw) => {
        const entry = raw as StatusResponse;
        return (
          <Card key={entry.correlationId} data-testid={`agents-history-${entry.correlationId}`}>
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground capitalize">{entry.type}</span>
                <StatusBadge status={entry.status} />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatDateTime(entry.createdAt)}</span>
                {entry.grant && <span>via {entry.grant.label}</span>}
              </div>
              {entry.failureCode && (
                <span className="text-xs text-destructive">{entry.failureCode}</span>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function GrantsSection({ agentId }: { agentId: string }) {
  const apiClient = useAgentsClient();
  const { data: grants, isPending } = useQuery(agentGrantsOptions(apiClient, agentId));

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (!grants || grants.length === 0) {
    return <p className="text-sm text-muted-foreground">No delegated access issued.</p>;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="agents-grants">
      {grants.map((grant) => (
        <Card key={grant.grantId}>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-foreground">{grant.label}</span>
              <span className="flex items-center gap-2">
                {grant.revokedAt ? (
                  <Badge variant="outline">Revoked</Badge>
                ) : new Date(grant.expiresAt) < new Date() ? (
                  <Badge variant="secondary">Expired</Badge>
                ) : (
                  <>
                    <Badge variant="default">Active</Badge>
                    {!grant.revokedAt && (
                      <RevokeGrantButton
                        agentId={agentId}
                        grantId={grant.grantId}
                        grantLabel={grant.label}
                      />
                    )}
                  </>
                )}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {grant.actions.join(", ")} · expires {formatDateTime(grant.expiresAt)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AgentDetailPage() {
  const { agentId } = Route.useParams();
  const apiClient = useAgentsClient();
  const detail = useQuery(agentDetailOptions(apiClient, agentId));
  const wallet = useQuery(agentWalletOptions(apiClient, agentId));
  const balances = useQuery(agentBalancesOptions(apiClient, agentId));
  const budget = useQuery(agentBudgetOptions(apiClient, agentId));
  const timelock = useQuery(agentTimelockOptions(apiClient, agentId));

  const [executeOpen, setExecuteOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);

  return (
    <PageContainer>
      <Link
        to="/agents"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        data-testid="agents-back"
      >
        <ArrowLeftIcon size={14} /> All agents
      </Link>
      <PageHeader
        title={detail.data?.name ?? "Agent"}
        description={`Created ${formatDateTime(detail.data?.createdAt)}`}
        headerTestId="agents.detail.heading"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setGrantOpen(true)}
              data-testid="agents-issue-grant"
            >
              <PlusIcon size={14} /> Issue grant
            </Button>
            <Button onClick={() => setExecuteOpen(true)} data-testid="agents-execute-open">
              <TerminalIcon size={14} /> Execute
            </Button>
          </>
        }
      />

      <Dialog open={executeOpen} onOpenChange={setExecuteOpen}>
        <DialogContent data-testid="agents-execute-dialog">
          <DialogHeader>
            <DialogTitle>Execute for {detail.data?.name ?? "agent"}</DialogTitle>
            <DialogDescription>
              Runs under a stored grant token, inside the agent's policy.
            </DialogDescription>
          </DialogHeader>
          <ExecuteConsole agentId={agentId} />
        </DialogContent>
      </Dialog>
      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent data-testid="agents-grant-dialog">
          <DialogHeader>
            <DialogTitle>Issue delegated grant</DialogTitle>
            <DialogDescription>
              The token stays on this device; the owner wallet signs only its commitment.
            </DialogDescription>
          </DialogHeader>
          <GrantIssueDialog agentId={agentId} open={grantOpen} onOpenChange={setGrantOpen} />
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <SectionHeader title="Wallet" sectionTestId="agents-wallet" />
          {wallet.data ? (
            <Card>
              <CardContent className="flex flex-col">
                <CopyRow label="Wallet ID" value={wallet.data.walletId} testId="agents-wallet-id" />
                <Separator />
                <CopyRow
                  label="NEAR account"
                  value={wallet.data.nearAccountId}
                  testId="agents-wallet-near"
                />
                {wallet.data.evmAddress && (
                  <>
                    <Separator />
                    <CopyRow
                      label="EVM address"
                      value={wallet.data.evmAddress}
                      testId="agents-wallet-evm"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Balances" sectionTestId="agents-balances" />
          {balances.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : !balances.data || balances.data.balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No public balances — deposit to the wallet address above to fund the agent.
            </p>
          ) : (
            <div className="flex flex-col gap-2" data-testid="agents-balance-list">
              {balances.data.balances.map((entry) => (
                <Card key={entry.assetId}>
                  <CardContent className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {entry.symbol ?? entry.assetId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.blockchain ?? "unknown chain"}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span
                        className="font-mono text-foreground"
                        data-testid={`agents-balance-${entry.symbol ?? entry.assetId}`}
                      >
                        {formatBalance(entry.balance)}
                      </span>
                      {entry.price !== null && entry.balance !== null && (
                        <span className="text-xs text-muted-foreground">
                          ≈ {formatUsd(String(Number(entry.balance) * entry.price))}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Policy" sectionTestId="agents-policy" />
          <Card>
            <CardContent>
              <PolicySection agentId={agentId} />
            </CardContent>
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Spend budget" sectionTestId="agents-budget" />
          {budget.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : budget.data ? (
            <Card>
              <CardContent className="flex flex-col divide-y">
                <BudgetRow label="Daily" window={budget.data.daily} />
                <BudgetRow label="Weekly" window={budget.data.weekly} />
                <BudgetRow label="Monthly" window={budget.data.monthly} />
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">No budget configured.</p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Timelock" sectionTestId="agents-timelock" />
          {timelock.isPending ? (
            <Skeleton className="h-16 w-full" />
          ) : timelock.data ? (
            <Card>
              <CardContent className="flex flex-col">
                <InfoRow label="Delay">{timelock.data.delaySeconds}s</InfoRow>
                <InfoRow label="Scheduled executions">{timelock.data.scheduledCount}</InfoRow>
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground">No timelock configured.</p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Activity" sectionTestId="agents-history-section" />
          <HistorySection agentId={agentId} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Delegated access" sectionTestId="agents-grants-section" />
          <GrantsSection agentId={agentId} />
        </section>
      </div>
    </PageContainer>
  );
}
