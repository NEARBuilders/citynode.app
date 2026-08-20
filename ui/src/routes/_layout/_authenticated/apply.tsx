import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { PageContainer, PageHeader } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/apply")({
  head: () => ({
    meta: [{ title: "Apply | app" }, { name: "description", content: "Apply to run a City Node." }],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  return (
    <PageContainer variant="narrow">
      <div className="space-y-8">
        <PageHeader
          title="Apply to run a City Node"
          description="City Nodes are NEAR Protocol validators tied to a real place. Apply to bring a node to your city, state, or country."
        />
        <a
          href="https://citynode.app/apply"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-foreground px-5 text-sm font-bold text-background transition-opacity hover:opacity-90"
        >
          Open application
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </PageContainer>
  );
}
