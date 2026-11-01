import { ArrowLeftIcon, ArrowUpRightIcon, CompassIcon, WarningIcon } from "@phosphor-icons/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, EmptyState, LocalDate, SectionHeader } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/i18n/runtime";
import {
  daoProposalPagesQueryOptions,
  daoProposalQueryOptions,
  nodeDaoQueryOptions,
} from "@/lib/queries/node-dao";
import { nodeBySlugQueryOptions } from "@/lib/queries/nodes";
import { type SputnikProposal, trezuDaoUrl } from "@/lib/sputnik-proposals";

type Translate = ReturnType<typeof useAppTranslation>;

export interface NodeDaoTarget {
  slug: string;
  parentId?: string;
}

interface ResolvedNodeDao {
  node: { id: string; name: string; slug: string };
  daoAccountId: string;
}

/**
 * Resolves the community by slug and its Node DAO from City Node's public
 * tenant record, then renders `children`. Every step has its own state, and a
 * failure is retryable rather than shown as "no proposals".
 */
export function NodeDaoGate({
  target,
  children,
}: {
  target: NodeDaoTarget;
  children: (resolved: ResolvedNodeDao) => ReactNode;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const nodeQuery = useQuery(nodeBySlugQueryOptions(apiClient, target.slug, target.parentId));
  const node = nodeQuery.data;
  const daoQuery = useQuery({
    ...nodeDaoQueryOptions(apiClient, node?.id ?? ""),
    enabled: !!node?.id,
  });

  if (nodeQuery.isPending || (node && daoQuery.isPending)) {
    return (
      <PageContainer variant="default">
        <ListSkeleton />
      </PageContainer>
    );
  }

  if (nodeQuery.isError) {
    return (
      <PageContainer variant="default">
        <RetryNotice
          message={translate("daoProposals.daoError")}
          onRetry={() => void nodeQuery.refetch()}
          testId="dao-proposals.dao-error"
        />
      </PageContainer>
    );
  }

  if (!node) {
    return (
      <PageContainer variant="default">
        <EmptyState
          icon={CompassIcon}
          title={translate("community.notFound")}
          description={translate("community.missingNamed", { slug: target.slug })}
          action={
            <Button
              nativeButton={false}
              render={<Link to="/explore" data-testid="dao-proposals.back-to-explore" />}
            >
              {translate("community.backExplore")}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const back = (
    <Button
      variant="ghost"
      size="sm"
      className="self-start"
      nativeButton={false}
      render={
        <Link
          to="/n/$slug"
          params={{ slug: node.slug }}
          search={{ parentId: target.parentId }}
          data-testid="dao-proposals.back-to-community"
        />
      }
    >
      <ArrowLeftIcon />
      {translate("daoProposals.back", { community: node.name })}
    </Button>
  );

  let body: ReactNode;
  if (daoQuery.isError) {
    body = (
      <RetryNotice
        message={translate("daoProposals.daoError")}
        onRetry={() => void daoQuery.refetch()}
        testId="dao-proposals.dao-error"
      />
    );
  } else if (!daoQuery.data?.daoAccountId) {
    body = <Notice testId="dao-proposals.no-dao">{translate("daoProposals.noDao")}</Notice>;
  } else if (daoQuery.data.network !== "mainnet") {
    body = <Notice testId="dao-proposals.testnet">{translate("daoProposals.testnet")}</Notice>;
  } else {
    body = children({ node, daoAccountId: daoQuery.data.daoAccountId });
  }

  return (
    <PageContainer variant="default">
      <div className="flex flex-col gap-6">
        {back}
        {body}
      </div>
    </PageContainer>
  );
}

export function DaoProposalList({
  node,
  daoAccountId,
  target,
}: ResolvedNodeDao & {
  target: NodeDaoTarget;
}) {
  const translate = useAppTranslation();
  const pages = useInfiniteQuery(daoProposalPagesQueryOptions(daoAccountId));
  const proposals = pages.data?.pages.flatMap((page) => page.proposals) ?? [];

  return (
    <section className="flex flex-col gap-6" data-testid="dao-proposals.list">
      <SectionHeader
        title={translate("daoProposals.title")}
        description={translate("daoProposals.description", { dao: daoAccountId })}
        action={<TrezuLink daoAccountId={daoAccountId} />}
      />
      {pages.isPending ? (
        <ListSkeleton />
      ) : pages.isError && !pages.data ? (
        <RetryNotice
          message={translate("daoProposals.loadError", { dao: daoAccountId })}
          onRetry={() => void pages.refetch()}
          testId="dao-proposals.load-error"
        />
      ) : proposals.length === 0 && !pages.hasNextPage ? (
        <Notice testId="dao-proposals.empty">{translate("daoProposals.empty")}</Notice>
      ) : proposals.length === 0 ? null : (
        <ul className="flex flex-col gap-2">
          {proposals.map((proposal) => (
            <li key={proposal.id}>
              <Link
                to="/n/$slug/proposals/$proposalId"
                params={{ slug: node.slug, proposalId: String(proposal.id) }}
                search={{ parentId: target.parentId }}
                className="flex flex-col gap-2 rounded-2xl border border-border p-4 transition-colors hover:bg-muted"
                data-testid="dao-proposals.item"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground tabular-nums">
                    {translate("daoProposals.number", { id: proposal.id })}
                  </span>
                  <StatusBadge status={proposal.status} translate={translate} />
                  <span>{proposalKindSummary(proposal, translate)}</span>
                </div>
                <p className="line-clamp-2 text-sm wrap-anywhere text-foreground">
                  {proposalTitle(proposal.description) || translate("daoProposals.noDescription")}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="break-all">
                    {translate("daoProposals.proposedBy", { account: proposal.proposer })}
                  </span>
                  <LocalDate value={submittedAt(proposal)} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages.data && pages.isFetchNextPageError && (
        <RetryNotice
          message={translate("daoProposals.loadError", { dao: daoAccountId })}
          onRetry={() => void pages.fetchNextPage()}
          testId="dao-proposals.older-error"
        />
      )}
      {pages.data && pages.hasNextPage && !pages.isFetchNextPageError && (
        <Button
          variant="outline"
          className="self-center"
          disabled={pages.isFetchingNextPage}
          onClick={() => void pages.fetchNextPage()}
          data-testid="dao-proposals.show-older"
        >
          {translate("daoProposals.showOlder")}
        </Button>
      )}
    </section>
  );
}

export function DaoProposalDetail({
  node,
  daoAccountId,
  proposalId,
  target,
}: ResolvedNodeDao & { proposalId: number | null; target: NodeDaoTarget }) {
  const translate = useAppTranslation();
  const query = useQuery({
    ...daoProposalQueryOptions(daoAccountId, proposalId ?? -1),
    enabled: proposalId !== null,
  });
  const allLink = (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={
        <Link
          to="/n/$slug/proposals"
          params={{ slug: node.slug }}
          search={{ parentId: target.parentId }}
          data-testid="dao-proposals.all"
        />
      }
    >
      {translate("daoProposals.all")}
    </Button>
  );

  if (proposalId !== null && query.isPending) return <ListSkeleton />;
  if (query.isError) {
    return (
      <RetryNotice
        message={translate("daoProposals.detailError", {
          id: proposalId ?? "—",
          dao: daoAccountId,
        })}
        onRetry={() => void query.refetch()}
        testId="dao-proposals.detail-error"
      />
    );
  }
  const proposal = proposalId === null ? null : query.data;
  if (!proposal) {
    return (
      <EmptyState
        icon={CompassIcon}
        title={translate("daoProposals.notFound")}
        description={translate("daoProposals.notFoundDescription", {
          id: proposalId ?? "—",
          dao: daoAccountId,
        })}
        action={allLink}
      />
    );
  }

  const tally = voteTally(proposal);
  return (
    <article className="flex flex-col gap-6" data-testid="dao-proposals.detail">
      <SectionHeader
        title={translate("daoProposals.number", { id: proposal.id })}
        description={proposalKindSummary(proposal, translate)}
        action={allLink}
      />
      <dl className="grid grid-cols-1 gap-4 border-y border-border py-4 sm:grid-cols-3">
        <Fact label={translate("daoProposals.status")}>
          <StatusBadge status={proposal.status} translate={translate} />
        </Fact>
        <Fact label={translate("daoProposals.proposer")}>
          <span className="break-all" data-testid="dao-proposals.proposer">
            {proposal.proposer}
          </span>
        </Fact>
        <Fact label={translate("daoProposals.submitted")}>
          <LocalDate value={submittedAt(proposal)} format="datetime" />
        </Fact>
        <Fact label={translate("daoProposals.votes")}>
          {translate("daoProposals.voteTally", tally)}
        </Fact>
      </dl>
      <p className="text-sm whitespace-pre-wrap wrap-anywhere text-foreground">
        {proposalText(proposal.description) || translate("daoProposals.noDescription")}
      </p>
      <TrezuLink daoAccountId={daoAccountId} />
    </article>
  );
}

/* ----------------------------------------------------------------- helpers */

const STATUS_KEYS = {
  InProgress: "daoProposals.statusInProgress",
  Approved: "daoProposals.statusApproved",
  Rejected: "daoProposals.statusRejected",
  Removed: "daoProposals.statusRemoved",
  Expired: "daoProposals.statusExpired",
  Moved: "daoProposals.statusMoved",
  Failed: "daoProposals.statusFailed",
} as const;

function StatusBadge({ status, translate }: { status: string; translate: Translate }) {
  const key = STATUS_KEYS[status as keyof typeof STATUS_KEYS];
  const variant =
    status === "Approved"
      ? "success"
      : status === "InProgress"
        ? "warning"
        : status === "Rejected" || status === "Failed"
          ? "destructive"
          : "secondary";
  return (
    <Badge variant={variant} data-testid="dao-proposals.status">
      {key ? translate(key) : status}
    </Badge>
  );
}

export function proposalKindSummary(proposal: SputnikProposal, translate: Translate): string {
  const kind = proposal.kind as Record<string, unknown>;
  const call = kind.FunctionCall as
    | { receiver_id: string; actions: { method_name: string }[] }
    | undefined;
  if (call) {
    return translate("daoProposals.kindCall", {
      method: call.actions.map((action) => action.method_name).join(", "),
      receiver: call.receiver_id,
    });
  }
  const transfer = kind.Transfer as { receiver_id: string } | undefined;
  if (transfer) return translate("daoProposals.kindTransfer", { receiver: transfer.receiver_id });
  const name = typeof proposal.kind === "string" ? proposal.kind : Object.keys(kind)[0];
  return translate("daoProposals.kindOther", { kind: name ?? "—" });
}

/**
 * Proposal descriptions are plain text with Trezu's conventions: `<br>` for
 * line breaks, `* Title:` / `* Summary:` lines, and metadata after `$$$$`.
 */
export function proposalText(description: string): string {
  return (description.split("$$$$")[0] ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** The `* Title:` line when there is one, otherwise the first line. */
export function proposalTitle(description: string): string {
  const lines = proposalText(description).split("\n").filter(Boolean);
  const title = lines.find((line) => /^\*\s*Title:/i.test(line));
  return (title ?? lines[0] ?? "").replace(/^\*\s*Title:\s*/i, "").trim();
}

function submittedAt(proposal: SputnikProposal): number {
  return Number(BigInt(proposal.submission_time || "0") / 1_000_000n);
}

export function voteTally(proposal: SputnikProposal) {
  const votes = Object.values(proposal.votes ?? {});
  return {
    approve: votes.filter((vote) => vote === "Approve").length,
    reject: votes.filter((vote) => vote === "Reject").length,
  };
}

function TrezuLink({ daoAccountId }: { daoAccountId: string }) {
  const translate = useAppTranslation();
  return (
    <Button
      variant="link"
      size="sm"
      className="self-start px-0"
      nativeButton={false}
      render={(props) => (
        <a
          {...props}
          href={trezuDaoUrl(daoAccountId)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="dao-proposals.trezu"
        />
      )}
    >
      {translate("daoProposals.openInTrezu")}
      <ArrowUpRightIcon />
    </Button>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Notice({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <p className="rounded-2xl bg-muted p-6 text-sm text-muted-foreground" data-testid={testId}>
      {children}
    </p>
  );
}

function RetryNotice({
  message,
  onRetry,
  testId,
}: {
  message: string;
  onRetry: () => void;
  testId: string;
}) {
  const translate = useAppTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col gap-4 rounded-2xl bg-muted p-6 sm:flex-row sm:items-center sm:justify-between"
      data-testid={testId}
    >
      <p className="flex items-center gap-2 text-sm text-foreground">
        <WarningIcon className="size-5 shrink-0 text-muted-foreground" />
        {message}
      </p>
      <Button variant="outline" onClick={onRetry} data-testid={`${testId}-retry`}>
        {translate("daoProposals.retry")}
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
