import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getActiveRuntime, useApiClient } from "@/app";
import { Button, NodeDirectory } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { tenantAppsQueryOptions } from "@/lib/queries/tenants";

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
  const runtime = getActiveRuntime(runtimeConfig);

  const { data: tenantApps = [], isLoading } = useQuery(tenantAppsQueryOptions(apiClient));

  const directoryNodes = tenantApps.map((app) => ({
    id: app.accountId,
    name: app.name,
    slug: app.node?.slug ?? app.accountId,
    kind: app.node?.kind ?? app.ownerKind,
    hostname: app.hostname,
  }));

  const gateway = runtime?.gatewayId ?? "citynode.app";

  return (
    <PageContainer variant="default" className="pt-12 pb-16 sm:pt-20 sm:pb-24">
      <div className="space-y-16 sm:space-y-20">
        <section className="space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            What are City Nodes?
          </h1>
          <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            A City Node is a NEAR Protocol validator tied to a real place — a city, state, or
            country.{" "}
            <Button asChild variant="link" className="px-0">
              <a
                href="https://www.near.org/blog/legion-city-nodes"
                target="_blank"
                rel="noopener noreferrer"
              >
                Learn More
              </a>
            </Button>
          </p>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
            How staking works
          </h2>
          <ol className="max-w-2xl space-y-4 text-base text-muted-foreground">
            <li className="flex gap-3">
              <span className="font-semibold text-foreground">1.</span>
              <span>
                Pick a place — start at the directory below and drill into a country, state, or
                city.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-foreground">2.</span>
              <span>Open the node's stake page.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-foreground">3.</span>
              <span>Sign in with your NEAR wallet.</span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-foreground">4.</span>
              <span>Choose a validator (official or community) and stake NEAR.</span>
            </li>
          </ol>
          <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
            Staking helps keep that place's validator online and securing the NEAR network.
          </p>
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Directory
            </h2>
            <Button asChild size="lg">
              <Link to="/apply">Apply</Link>
            </Button>
          </div>
          <NodeDirectory
            nodes={directoryNodes}
            gateway={gateway}
            isLoading={isLoading}
            linkTo="/stake"
            linkSearch={(node) => ({ node: node.slug })}
          />
        </section>
      </div>
    </PageContainer>
  );
}
