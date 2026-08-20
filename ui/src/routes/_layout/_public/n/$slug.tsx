import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Globe, Sparkles } from "lucide-react";
import { getActiveRuntime, useApiClient } from "@/app";
import { Badge, Card } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

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
      <PageContainer variant="wide">
        <NodeSkeleton />
      </PageContainer>
    );
  }

  if (!node) {
    return (
      <PageContainer variant="narrow">
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">Node not found.</p>
        </Card>
      </PageContainer>
    );
  }

  const validators = staking?.validators ?? [];
  const hasOwnValidator = staking?.sourceNodeId === node.id;
  const validatorNodeIds = new Set(validators.map((v) => v.nodeId));
  const ownValidator = validators.find((v) => v.nodeId === node.id);
  const childrenWithValidators = children.filter((c) => validatorNodeIds.has(c.id));

  return (
    <PageContainer variant="wide">
      <div className="space-y-12">
        <header className="space-y-3 pt-8">
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

          {childrenLoading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-[10px]" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : children.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm text-muted-foreground">No child nodes yet.</p>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {children.map((child) => {
                const hasValidator = validatorNodeIds.has(child.id);
                return (
                  <Card key={child.id} className="p-6 space-y-3">
                    <a href={`https://${child.slug}.${gateway}/`} className="block space-y-3 group">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
                          <Globe className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold text-foreground capitalize truncate group-hover:underline">
                            {child.name}
                          </h3>
                          <p className="text-[11px] font-mono text-muted-foreground truncate">
                            {child.slug}.{gateway}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="capitalize">
                          {child.kind}
                        </Badge>
                        {hasValidator && (
                          <Badge variant="outline" className="text-[10px]">
                            validator
                          </Badge>
                        )}
                      </div>
                    </a>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">Stake</h2>
          {hasOwnValidator && ownValidator ? (
            <Card className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                {node.name} runs its own validator pool.
              </p>
              <a
                href={`https://${node.slug}.${gateway}/stake`}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-foreground px-5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
              >
                Stake to {node.name}
                <ArrowRight className="h-4 w-4" />
              </a>
            </Card>
          ) : childrenWithValidators.length > 0 ? (
            <Card className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {node.name} doesn&apos;t run its own validator — stake to a city that does.
              </p>
              <div className="flex flex-col gap-2">
                {childrenWithValidators.map((child) => (
                  <a
                    key={child.id}
                    href={`https://${child.slug}.${gateway}/stake`}
                    className="inline-flex h-10 items-center justify-between gap-2 rounded-[8px] border-2 border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <span className="capitalize">{child.name}</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">
                This node doesn&apos;t run a validator yet.
              </p>
            </Card>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function NodeSkeleton() {
  return (
    <div className="space-y-12">
      <header className="space-y-3 pt-8">
        <Skeleton className="h-3 w-24" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-20 rounded-[6px]" />
        </div>
        <Skeleton className="h-3 w-40" />
      </header>
      <section className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-[10px]" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
