import { createFileRoute } from "@tanstack/react-router";
import { Discover } from "@/components/discovery/discover";
import { PageContainer } from "@/components/layout/page-container";

export const Route = createFileRoute("/_authenticated/_dashboard/discover")({
  head: () => ({ meta: [{ title: "Curate | app" }] }),
  component: CuratePage,
});

function CuratePage() {
  return (
    <PageContainer variant="wide">
      <Discover />
    </PageContainer>
  );
}
