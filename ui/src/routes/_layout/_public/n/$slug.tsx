import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { z } from "zod";
import { getActiveRuntime, useApiClient } from "@/app";
import { Badge, NodeDirectory } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { NodeDirectorySkeleton } from "@/components/node-directory-skeleton";
import { NodeStakeSection } from "@/components/node-stake-section";
import { Skeleton } from "@/components/ui/skeleton";
import {
  childNodesQueryOptions,
  nodeBySlugQueryOptions,
  stakingValidatorsQueryOptions,
} from "@/lib/queries/nodes";

export const Route = createFileRoute("/_layout/_public/n/$slug")({
  validateSearch: z.object({ parentId: z.uuid().optional() }),
  loaderDeps: ({ search }) => ({ parentId: search.parentId }),
  loader: async ({ params, context, deps: { parentId } }) => {
    const { queryClient, apiClient, runtimeConfig } = context;
    const slug = params.slug;

    const node = await queryClient.ensureQueryData(
      nodeBySlugQueryOptions(apiClient, slug, parentId),
    );

    if (node) {
      await Promise.all([
        queryClient.prefetchQuery(childNodesQueryOptions(apiClient, node.id)),
        queryClient.prefetchQuery(stakingValidatorsQueryOptions(apiClient, node.id)),
      ]);
    }

    return { slug, parentId, runtimeConfig, nodeName: node?.name ?? null };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.nodeName ? `${loaderData.nodeName} | app` : "Node | app" },
      {
        name: "description",
        content: loaderData?.nodeName
          ? `${loaderData.nodeName} — geographic node, validators, and child nodes.`
          : "Geographic node directory.",
      },
    ],
  }),
  component: NodePage,
});

function NodePage() {
  const { slug, parentId, runtimeConfig } = Route.useLoaderData();
  const apiClient = useApiClient();
  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";

  const { data: node, isLoading: nodeLoading } = useQuery(
    nodeBySlugQueryOptions(apiClient, slug, parentId),
  );

  const nodeId = node?.id;

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    ...childNodesQueryOptions(apiClient, nodeId ?? ""),
    enabled: !!nodeId,
  });

  const { data: staking } = useQuery({
    ...stakingValidatorsQueryOptions(apiClient, nodeId ?? ""),
    enabled: !!nodeId,
  });

  if (nodeLoading) {
    return (
      <PageContainer variant="default">
        <NodeSkeleton />
      </PageContainer>
    );
  }

  if (!node) {
    return (
      <PageContainer variant="default">
        <p className="py-16 text-sm text-muted-foreground">Node not found.</p>
      </PageContainer>
    );
  }

  const validators = staking?.validators ?? [];
  const validatorNodeIds = new Set(validators.map((v) => v.nodeId));

  return (
    <PageContainer variant="default">
      <div className="space-y-12">
        <header className="space-y-3 pt-4 sm:pt-8">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {gateway}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground capitalize">
              {node.name}
            </h1>
            <Badge variant="secondary" className="capitalize">
              {node.kind}
            </Badge>
          </div>
          <p className="text-sm font-mono text-muted-foreground">
            {node.slug}.{gateway}
          </p>
        </header>

        <section className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-foreground">Child nodes</h2>
              <p className="text-sm text-muted-foreground">
                Navigate to states and cities under {node.name}.
              </p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {children.length} {children.length === 1 ? "node" : "nodes"}
            </span>
          </div>
          <NodeDirectory
            nodes={children}
            gateway={gateway}
            validatorNodeIds={validatorNodeIds}
            isLoading={childrenLoading}
            emptyMessage="No child nodes yet."
            linkTo="/n/$slug"
          />
        </section>

        <NodeStakeSection
          node={node}
          children={children}
          gateway={gateway}
          validators={validators}
          sourceNodeId={staking?.sourceNodeId ?? node.id}
          apiClient={apiClient}
        />
      </div>
    </PageContainer>
  );
}

function NodeSkeleton() {
  return (
    <div className="space-y-12">
      <header className="space-y-3 pt-4 sm:pt-8">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-20 rounded-[6px]" />
        </div>
        <Skeleton className="h-3 w-40" />
      </header>
      <section className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <NodeDirectorySkeleton />
      </section>
    </div>
  );
}
