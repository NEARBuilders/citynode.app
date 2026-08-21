import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getActiveRuntime, useApiClient } from "@/app";
import { Button } from "@/components";
import { PageContainer } from "@/components/layout/page-container";
import { NodeDirectory } from "./n/-node-directory";

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

  const { data: rootNodes = [], isLoading } = useQuery({
    queryKey: ["root-nodes"],
    queryFn: () => apiClient.listRootNodes(),
    staleTime: 30 * 1000,
  });

  const gateway = runtime?.gatewayId ?? "citynode.app";

  return (
    <PageContainer variant="default" className="pt-12 pb-16 sm:pt-20 sm:pb-24">
      <div className="space-y-16 sm:space-y-20">
        <section className="space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            What are City Nodes
          </h1>
          <p className="max-w-2xl text-base sm:text-lg text-muted-foreground leading-relaxed">
            A City Node is a NEAR Protocol validator tied to a real place — a city, state, or
            country. Stake NEAR to help keep your city's validator online and securing the network.{" "}
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Directory
            </h2>
            <Button asChild size="lg">
              <Link to="/apply">Apply</Link>
            </Button>
          </div>
          <NodeDirectory nodes={rootNodes} gateway={gateway} isLoading={isLoading} />
        </section>
      </div>
    </PageContainer>
  );
}
