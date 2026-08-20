import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Globe } from "lucide-react";
import { getActiveRuntime, getAppName, useApiClient } from "@/app";
import { Badge, Button, Card } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_layout/_public/")({
  loader: async ({ context }) => ({
    runtimeConfig: context.runtimeConfig,
  }),
  head: () => ({
    meta: [
      { title: "City Nodes | app" },
      {
        name: "description",
        content:
          "What are CityNodes? A decentralized network of NEAR validator nodes organized by geography. Stake NEAR to keep your city's node online.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { runtimeConfig } = Route.useLoaderData();
  const apiClient = useApiClient();
  const appName = getAppName(runtimeConfig);
  const runtime = getActiveRuntime(runtimeConfig);

  const { data: rootNodes = [], isLoading } = useQuery({
    queryKey: ["root-nodes"],
    queryFn: () => apiClient.listRootNodes(),
    staleTime: 30 * 1000,
  });

  const gateway = runtime?.gatewayId ?? "citynode.app";

  return (
    <PageContainer variant="wide">
      <div className="space-y-16">
        <section className="flex flex-col items-center gap-6 pt-12 pb-8 text-center">
          <div className="space-y-3">
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground">
              {appName}
            </h1>
            <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              A City Node is a NEAR Protocol validator tied to a real place — a city, state, or
              country. Stake NEAR to help keep your city's validator online and securing the
              network.
            </p>
          </div>
        </section>

        <section className="space-y-6">
          {isLoading ? (
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
                  <Skeleton className="h-8 w-full" />
                </Card>
              ))}
            </div>
          ) : rootNodes.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm text-muted-foreground">No nodes yet.</p>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {rootNodes.map((node) => (
                <Card key={node.id} className="p-6 space-y-3">
                  <a href={`https://${node.slug}.${gateway}/`} className="block space-y-3 group">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
                        <Globe className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground capitalize truncate group-hover:underline">
                          {node.name}
                        </h3>
                        <p className="text-[11px] font-mono text-muted-foreground truncate">
                          {node.slug}.{gateway}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {node.kind}
                      </Badge>
                    </div>
                  </a>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="flex justify-center pt-4">
          <Button asChild size="lg">
            <Link to="/apply">Apply</Link>
          </Button>
        </section>
      </div>
    </PageContainer>
  );
}
