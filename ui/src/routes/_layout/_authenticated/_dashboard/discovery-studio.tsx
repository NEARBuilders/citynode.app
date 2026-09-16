import { createFileRoute } from "@tanstack/react-router";
import { DiscoveryStudio } from "@/components/discovery/discovery-studio";
import { PageContainer } from "@/components/layout/page-container";
export const Route = createFileRoute("/_layout/_authenticated/_dashboard/discovery-studio")({
  component: () => (
    <PageContainer variant="wide">
      <DiscoveryStudio />
    </PageContainer>
  ),
});
