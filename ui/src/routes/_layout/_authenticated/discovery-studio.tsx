import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryStudio } from "@/components/discovery/discovery-studio";
import { PageContainer } from "@/components/layout/page-container";
export const Route = createFileRoute("/_layout/_authenticated/discovery-studio")({
  component: () => (
    <PageContainer>
      <DiscoveryStudio />
    </PageContainer>
  ),
});
