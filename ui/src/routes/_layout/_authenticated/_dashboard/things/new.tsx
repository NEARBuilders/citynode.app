import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { Button, PageContainer, PageHeader } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/things/new")({
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
    onSuccess: ({ data: proposal }) => {
      toast.success("Proposal submitted", {
        description: "Your thing is pending admin review.",
      });
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
          icon={Sparkles}
          label="Create"
          title="New thing"
          description="Submit a thing proposal for an admin to review before it goes live."
        />

        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="thing-id"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Thing ID
            </label>
            <input
              id="thing-id"
              type="text"
              value={thingId}
              onChange={(e) => setThingId(e.target.value)}
              placeholder="thing-123"
              className="w-full rounded-[8px] border-2 border-border bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Unique identifier for the thing.</p>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="payload-json"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Payload (JSON)
            </label>
            <textarea
              id="payload-json"
              value={payloadRaw}
              onChange={(e) => setPayloadRaw(e.target.value)}
              rows={8}
              className="w-full rounded-[8px] border-2 border-border bg-background px-3 py-2 text-xs font-mono text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !thingId.trim()}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit for review"}
          </Button>

          {submitMutation.isError && (
            <div className="rounded-[8px] border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
              <p>{submitMutation.error.message || "Unable to submit this proposal."}</p>
              <Link
                to="/login"
                search={{ redirect: "/things/new" }}
                className="mt-2 inline-flex text-sm font-semibold text-link underline"
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
