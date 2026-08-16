import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Landmark, Server, Sparkles } from "lucide-react";
import { getAccount, getActiveRuntime, getAppName, useApiClient } from "@/app";
import { Button, Card } from "@/components";
import { PageContainer } from "@/components/layout/page-container";

export const Route = createFileRoute("/_layout/_public/")({
  loader: async ({ context }) => ({
    runtimeConfig: context.runtimeConfig,
  }),
  head: () => ({
    meta: [
      { title: "City Nodes | app" },
      {
        name: "description",
        content: "Stake NEAR to city validator pools and help run decentralized city nodes.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { runtimeConfig } = Route.useLoaderData();
  const apiClient = useApiClient();
  const appName = getAppName(runtimeConfig);
  const account = getAccount(runtimeConfig);
  const runtime = getActiveRuntime(runtimeConfig);

  const accountId = runtime?.accountId ?? account;

  const { data: cityNodes = [] } = useQuery({
    queryKey: ["citynodes"],
    queryFn: () => apiClient.listCityNodes(),
    staleTime: 30 * 1000,
  });

  return (
    <PageContainer variant="wide">
      <div className="space-y-16">
        <section className="flex flex-col items-center gap-6 pt-12 pb-8 text-center">
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            {accountId}
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-foreground">
              {appName}
            </h1>
            <p className="mx-auto max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
              Every city runs its own validator pool on NEAR. Pick a city, sign in with your wallet,
              and stake NEAR to help keep it online.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/login">
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-foreground">Live cities</h2>
              <p className="text-sm text-muted-foreground">
                Stake to a city&apos;s validator pool from its subdomain.
              </p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {cityNodes.length} {cityNodes.length === 1 ? "city" : "cities"}
            </span>
          </div>

          {cityNodes.length === 0 ? (
            <Card className="p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No city nodes yet. Create a tenant and publish the first one.
              </p>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {cityNodes.map((cityNode) => (
                <Card key={cityNode.id} className="p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
                      <Landmark className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-foreground capitalize truncate">
                        {cityNode.name}
                      </h3>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">
                        {cityNode.hostname}.{runtime?.gatewayId ?? "citynode.app"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Server className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-mono text-xs truncate">{cityNode.validatorPool}</span>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link to="/stake" search={{ city: cityNode.hostname }}>
                      stake to {cityNode.hostname}
                    </Link>
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
