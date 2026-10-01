import { SparkleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer, PageHeader } from "@/components";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAgentsClient } from "./-agent-queries";
import { CreateAgentDialog } from "./-create-agent-dialog";
import "../../../styles.css";

export const Route = createFileRoute("/_authenticated/agents/")({
  head: () => ({
    meta: [
      { title: "Agents" },
      {
        name: "description",
        content: "Intents wallets operated for you — balances, policies and delegated access.",
      },
    ],
  }),
  staticData: {
    nav: { label: "Agents", icon: "sparkles", order: 45 },
  },
  component: AgentsPage,
});

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
  DELETED: "Deleted",
  ABANDONED: "Abandoned",
};

function AgentsPage() {
  const apiClient = useAgentsClient();
  const { data, isPending, error } = useQuery({
    queryKey: ["agents", "list"],
    queryFn: async () => {
      const { data } = await apiClient.listAgents({});
      return data ?? null;
    },
  });
  const [creating, setCreating] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        title="Agents"
        description="Intents wallets operated for you — balances, policies and delegated access."
        headerTestId="agents.heading"
      />
      {error ? (
        <EmptyState
          icon={SparkleIcon}
          title="Agents unavailable"
          description={error.message || "The agents service could not be reached."}
        />
      ) : isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={SparkleIcon}
          title="No agents yet"
          description="Create your first agent — an intents wallet operated under your policy."
          action={
            <Button onClick={() => setCreating(true)} data-testid="agents-create-open">
              Create agent
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3" data-testid="agents-list">
          {data.map((agent) => (
            <Link key={agent.id} to="/agents/$agentId" params={{ agentId: agent.id }}>
              <Card
                data-testid={`agents-item-${agent.id}`}
                className="transition-colors hover:bg-accent/50"
              >
                <CardContent className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{agent.name}</span>
                    <Badge variant={agent.status === "ACTIVE" ? "default" : "secondary"}>
                      {STATUS_LABELS[agent.status] ?? agent.status}
                    </Badge>
                  </div>
                  {agent.wallet ? (
                    <span className="font-mono text-sm text-muted-foreground">
                      {agent.wallet.nearAccountId}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Wallet provisioning…</span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent data-testid="agents-create-dialog">
          <DialogHeader>
            <DialogTitle>Create agent</DialogTitle>
            <DialogDescription>
              Your wallet signs the policy delegate; the server relays it.
            </DialogDescription>
          </DialogHeader>
          <CreateAgentDialog onCreated={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
