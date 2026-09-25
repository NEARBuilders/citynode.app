import { SparkleIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { pluginPath, pluginSearch, useApiClient } from "@/app";
import { Button, Input, PageContainer, PageHeader, Textarea } from "@/components";
import { invalidateThingAfterProposal } from "./-thing-cache";

export const Route = createFileRoute("/_authenticated/_dashboard/things/new")({
  head: () => ({
    meta: [
      { title: "New Thing | app" },
      { name: "description", content: "Submit a new thing for community review." },
    ],
  }),
  component: CreateThingPage,
});

function CreateThingPage() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [thingId, setThingId] = useState("");
  const [payloadRaw, setPayloadRaw] = useState('{\n  "kind": "demo",\n  "value": "hello"\n}');

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!thingId.trim()) throw new Error("thingId is required");
      let payload: unknown;
      try {
        payload = JSON.parse(payloadRaw);
      } catch {
        throw new Error("Invalid JSON payload");
      }
      return apiClient.proposals.propose({
        pluginId: "template",
        entityId: thingId.trim(),
        payload,
        source: "things/new",
      });
    },
    onSuccess: async ({ data: proposal }) => {
      toast.success("Proposal submitted", {
        description: "Your thing is pending admin review.",
      });
      try {
        await invalidateThingAfterProposal(queryClient, proposal.entityId);
      } catch {
        toast.warning("Proposal submitted, but its review status could not refresh.");
      }
      void navigate({
        to: "/things/$thingId",
        params: { thingId: proposal.entityId },
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <PageContainer variant="wide">
      <div className="space-y-6">
        <PageHeader
          icon={SparkleIcon}
          label="Create"
          title="New thing"
          description="Submit a thing proposal for an admin to review before it goes live."
        />

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="thing-id" className="text-sm font-medium text-muted-foreground">
              Thing ID
            </label>
            <Input
              id="thing-id"
              type="text"
              value={thingId}
              onChange={(e) => setThingId(e.target.value)}
              placeholder="thing-123"
            />
            <p className="text-xs text-muted-foreground">Unique identifier for the thing.</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="payload-json" className="text-sm font-medium text-muted-foreground">
              Payload (JSON)
            </label>
            <Textarea
              id="payload-json"
              value={payloadRaw}
              onChange={(e) => setPayloadRaw(e.target.value)}
              rows={8}
            />
          </div>

          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !thingId.trim()}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit for review"}
          </Button>

          {submitMutation.isError && (
            <div className="rounded-lg bg-destructive-muted p-4 text-sm text-destructive-muted-foreground">
              <p>{submitMutation.error.message || "Unable to submit this proposal."}</p>
              <Link
                to={pluginPath("/login")}
                search={pluginSearch({ redirect: "/things/new" })}
                className="mt-2 inline-flex text-sm font-semibold text-primary underline"
              >
                Sign in and try again
              </Link>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
