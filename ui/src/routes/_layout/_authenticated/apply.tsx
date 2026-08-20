import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Button, PageContainer, PageHeader } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/apply")({
  head: () => ({
    meta: [{ title: "Apply | app" }, { name: "description", content: "Apply to run a City Node." }],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        <PageHeader
          title="Apply to run a City Node"
          description="City Nodes are NEAR Protocol validators tied to a real place. Apply to bring a node to your city, state, or country."
        />
        <Button asChild>
          <a href="https://citynode.app/apply" target="_blank" rel="noopener noreferrer">
            Open application
            <ExternalLink />
          </a>
        </Button>
      </div>
    </PageContainer>
  );
}
