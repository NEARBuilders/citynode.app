import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { ReactNode } from "react";
import { useApiClient } from "@/app";
import { LocalDate } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import type { Proposal } from "@/lib/queries/proposals";
import { nodeProposalPayloadSchema } from "@/routes/_authenticated/_dashboard/-node-application";
import { humanize } from "../-admin-ui";

export function NodeProposalRequest({ proposal }: { proposal: Proposal }) {
  const translate = useAppTranslation();
  const parsed = nodeProposalPayloadSchema.safeParse(proposal.payload);
  if (!parsed.success) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {translate("admin.proposal.invalidPayload")}
      </p>
    );
  }

  const application = parsed.data;
  return (
    <div className="flex flex-col gap-6" data-testid="admin-proposal-request">
      <blockquote className="border-l-2 border-border pl-4 text-base whitespace-pre-wrap text-foreground">
        {application.motivation}
      </blockquote>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Fact label={translate("admin.proposal.requestedBy")}>
          <span className="font-mono break-all">
            {application.submitterAccountId || translate("common.none")}
          </span>
        </Fact>
        <Fact label={translate("common.submitted")}>
          <LocalDate value={proposal.createdAt} format="relative" />
        </Fact>
        <Fact label={translate("common.kind")}>{humanize(application.kind, translate)}</Fact>
        <Fact label={translate("admin.proposal.parentCommunity")}>
          {application.parentId ? (
            <ParentName nodeId={application.parentId} />
          ) : (
            translate("admin.proposal.noParent")
          )}
        </Fact>
        <Fact label={translate("admin.proposal.owningDao")} className="sm:col-span-2">
          <span className="font-mono break-all" data-testid="admin-proposal-dao">
            {application.accountId}
          </span>
        </Fact>
      </dl>
    </div>
  );
}

function ParentName({ nodeId }: { nodeId: string }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const parentQuery = useQuery(nodeByIdQueryOptions(apiClient, nodeId));
  if (parentQuery.isLoading) return <span className="text-muted-foreground">…</span>;
  if (!parentQuery.data) {
    return (
      <span className="text-muted-foreground">{translate("admin.proposal.parentMissing")}</span>
    );
  }
  return (
    <Link
      to="/admin/nodes/$nodeId"
      params={{ nodeId }}
      search={{}}
      className="text-foreground hover:underline"
    >
      {parentQuery.data.name}
    </Link>
  );
}

function Fact({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}
