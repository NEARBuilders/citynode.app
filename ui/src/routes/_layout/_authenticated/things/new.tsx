import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { Button } from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/things/new")({
  head: () => ({
    meta: [
      { title: "New Thing | everything.dev" },
      { name: "description", content: "Create a new thing in the registry." },
    ],
  }),
  component: NewThingPage,
});

function NewThingPage() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const [pluginId, setPluginId] = useState("template");
  const [payloadRaw, setPayloadRaw] = useState('{\n  "kind": "demo",\n  "value": "hello"\n}');

  const createMutation = useMutation({
    mutationFn: async () => {
      let payload: unknown;
      try {
        payload = JSON.parse(payloadRaw);
      } catch {
        throw new Error("Invalid JSON payload");
      }
      return apiClient.createThing({ pluginId, payload });
    },
    onSuccess: (thing) => {
      toast.success("Thing created");
      void navigate({ to: "/things/$thingId", params: { thingId: thing.thingId } });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5 sm:px-6 sm:py-3">
        <h1 className="text-xl font-semibold text-foreground">New thing</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="plugin-id"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Plugin ID
            </label>
            <input
              id="plugin-id"
              type="text"
              value={pluginId}
              onChange={(e) => setPluginId(e.target.value)}
              className="w-full rounded-[8px] border-2 border-border bg-background px-3 py-2 text-sm font-mono text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Must match a registered plugin provider on the API.
            </p>
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

          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create thing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
