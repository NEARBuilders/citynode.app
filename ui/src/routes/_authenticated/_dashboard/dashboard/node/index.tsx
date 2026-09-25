import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getActiveRuntime, useApiClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  NodeValidatorTable,
  SectionHeader,
  TeamStakeCard,
} from "@/components";
import { resolveTeamStakeTarget } from "@/lib/queries/stake-pool";
import { buildTenantUrl } from "@/lib/tenant-url";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/node/")({
  component: NodeOverview,
});

function NodeOverview() {
  const { runtimeConfig, selectedNode, summary, stakingSourceNode, tenant, auth } =
    Route.useRouteContext();
  const apiClient = useApiClient();
  const orgId = tenant?.orgId ?? auth.activeOrganizationId;
  const daoQuery = useQuery({
    queryKey: ["org-dao", orgId],
    enabled: !!orgId && !!selectedNode && !!summary,
    staleTime: 60_000,
    queryFn: () =>
      apiClient.auth.getDao({ organizationId: orgId ?? "" }).catch(() => ({
        daoAccountId: null,
        daoNetwork: null,
      })),
  });
  if (!selectedNode || !summary) return null;

  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId;
  const stakingIsInherited = summary.stakingValidators.sourceNodeId !== selectedNode.id;
  const teamStake = resolveTeamStakeTarget({
    daoAccountId: daoQuery.data?.daoAccountId,
    tenantAccountId: tenant?.accountId,
    tenantOwnerKind: tenant?.ownerKind,
    validators: summary.stakingValidators.validators,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-muted p-5">
        <div>
          <h2 className="font-semibold">What’s happening in your community?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add an event, share an update, or change how your community appears on Explore.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link to="/nodes/$nodeId/content" params={{ nodeId: selectedNode.id }} />}
        >
          Manage events & profile
        </Button>
      </div>
      <TeamStakeCard target={teamStake} pending={daoQuery.isLoading} />

      <section className="space-y-3">
        <SectionHeader title="Validators" />
        <Card className="overflow-hidden">
          {summary.validators.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">This node has no validators.</p>
          ) : (
            <NodeValidatorTable validators={summary.validators} />
          )}
        </Card>
      </section>

      <section className="space-y-3">
        <SectionHeader title="Direct children" />
        {summary.children.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">This node has no direct children.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.children.map((child) => {
              const childUrl = gateway ? buildTenantUrl(child.slug, gateway) : null;
              return (
                <Card key={child.id} className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-foreground">{child.name}</h3>
                      <p className="font-mono text-xs text-muted-foreground">{child.slug}</p>
                    </div>
                    <Badge variant="outline">{child.kind}</Badge>
                  </div>
                  {childUrl && (
                    <a
                      href={childUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
                    >
                      {child.slug}.{gateway}
                      <ArrowSquareOutIcon className="h-3.5 w-3.5" />
                    </a>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader title="Staking resolution" />
        <Card className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={stakingIsInherited ? "secondary" : "default"}>
              {stakingIsInherited ? "inherited" : "own validators"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {stakingIsInherited
                ? `Staking resolves to ${stakingSourceNode?.name ?? "an ancestor node"}.`
                : "Staking resolves to this node's validators."}
            </p>
          </div>
          {summary.stakingValidators.validators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No validators are available for staking on this node or its ancestors.
            </p>
          ) : (
            <div className="-mx-6 -mb-6 border-t border-border">
              <NodeValidatorTable validators={summary.stakingValidators.validators} />
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
