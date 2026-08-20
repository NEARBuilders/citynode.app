import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { getActiveRuntime, useApiClient } from "@/app";
import { Badge, Button } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { NodeDirectory } from "./-node-directory";

export const Route = createFileRoute("/_layout/_public/n/$slug")({
  loader: async ({ params, context }) => {
    const { queryClient, apiClient, runtimeConfig } = context;
    const slug = params.slug;

    const node = await queryClient.fetchQuery({
      queryKey: ["node", "slug", slug],
      queryFn: () => apiClient.resolveNodeBySlug({ slug, parentId: null }),
      staleTime: 30 * 1000,
    });

    if (node) {
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: ["node", "children", node.id],
          queryFn: () => apiClient.listChildren({ nodeId: node.id }),
          staleTime: 30 * 1000,
        }),
        queryClient.prefetchQuery({
          queryKey: ["staking-validators", node.id],
          queryFn: () => apiClient.resolveStakingValidators({ nodeId: node.id }),
          staleTime: 30 * 1000,
        }),
      ]);
    }

    return { slug, runtimeConfig, nodeName: node?.name ?? null };
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
  const { slug, runtimeConfig } = Route.useLoaderData();
  const apiClient = useApiClient();
  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId ?? "citynode.app";

  const { data: node, isLoading: nodeLoading } = useQuery({
    queryKey: ["node", "slug", slug],
    queryFn: () => apiClient.resolveNodeBySlug({ slug, parentId: null }),
    staleTime: 30 * 1000,
  });

  const nodeId = node?.id;

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["node", "children", nodeId],
    queryFn: () => apiClient.listChildren({ nodeId: nodeId as string }),
    enabled: !!nodeId,
    staleTime: 30 * 1000,
  });

  const { data: staking } = useQuery({
    queryKey: ["staking-validators", nodeId],
    queryFn: () => apiClient.resolveStakingValidators({ nodeId: nodeId as string }),
    enabled: !!nodeId,
    staleTime: 30 * 1000,
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
  const hasOwnValidator = staking?.sourceNodeId === node.id;
  const validatorNodeIds = new Set(validators.map((v) => v.nodeId));
  const childrenWithValidators = children.filter((c) => validatorNodeIds.has(c.id));

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
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Stake</h2>
          {hasOwnValidator ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {node.name} runs its own validator pool.
              </p>
              <Button asChild>
                <a href={`https://${node.slug}.${gateway}/stake`}>
                  Stake to {node.name}
                  <ArrowRight />
                </a>
              </Button>
            </div>
          ) : childrenWithValidators.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {node.name} doesn&apos;t run its own validator — stake to a city that does.
              </p>
              <div>
                {childrenWithValidators.map((child) => (
                  <a
                    key={child.id}
                    href={`https://${child.slug}.${gateway}/stake`}
                    className="group flex items-center gap-4 border-b border-border px-2 py-4 last:border-0 transition-colors hover:bg-muted/50"
                  >
                    <span className="capitalize text-base font-semibold text-foreground group-hover:underline">
                      {child.name}
                    </span>
                    <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </a>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This node doesn&apos;t run a validator yet.
            </p>
          )}
        </section>
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
        <div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b border-border py-4 last:border-0"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="ml-auto h-5 w-16" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
