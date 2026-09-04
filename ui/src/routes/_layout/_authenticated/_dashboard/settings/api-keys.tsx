import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Key, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { sessionQueryOptions, useAuthClient } from "@/app";
import {
  ApiKeyForm,
  type ApiKeyFormValues,
  ApiKeyReveal,
  type ApiKeyRevealProps,
  Button,
  Card,
  EmptyState,
  PageHeader,
} from "@/components";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard/settings/api-keys")({
  head: () => ({
    meta: [
      { title: "API Keys | settings" },
      {
        name: "description",
        content: "Create and manage API keys for programmatic access.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      sessionQueryOptions(context.authClient, context.session),
    );
  },
  component: ApiKeysSettings,
});

type ApiKeyItem = {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
};

type CreatedApiKey = ApiKeyRevealProps["apiKey"];

const userApiKeysQueryKey = ["user-api-keys"] as const;

function ApiKeysSettings() {
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const { data: session } = useQuery(sessionQueryOptions(auth));
  const user = session?.user;
  const [createdApiKey, setCreatedApiKey] = useState<CreatedApiKey | null>(null);

  const apiKeys =
    useQuery({
      queryKey: userApiKeysQueryKey,
      queryFn: async (): Promise<ApiKeyItem[]> => {
        const { data, error } = await auth.apiKey.list({});
        if (error) throw new Error(error.message);
        return (data?.apiKeys ?? []) as ApiKeyItem[];
      },
      enabled: !!user,
    }).data ?? [];

  const createApiKeyMutation = useMutation({
    mutationFn: async (values: ApiKeyFormValues) => {
      const { data, error } = await auth.apiKey.create({
        name: values.name,
        ...(values.expiresIn !== undefined ? { expiresIn: values.expiresIn } : {}),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (data) => {
      if (data) setCreatedApiKey(data as CreatedApiKey);
      toast.success("API key created");
      await queryClient.invalidateQueries({ queryKey: userApiKeysQueryKey });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create API key");
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await auth.apiKey.delete({ keyId });
      if (error) throw new Error(error.message);
    },
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey: userApiKeysQueryKey });
      const previousKeys = queryClient.getQueryData<ApiKeyItem[]>(userApiKeysQueryKey);
      queryClient.setQueryData<ApiKeyItem[]>(userApiKeysQueryKey, (current) => {
        if (!current) return current;
        return current.filter((key) => key.id !== keyId);
      });
      return { previousKeys };
    },
    onSuccess: async () => {
      toast.success("API key deleted");
      await queryClient.invalidateQueries({ queryKey: userApiKeysQueryKey });
    },
    onError: (error: Error, _keyId, context) => {
      if (context?.previousKeys) {
        queryClient.setQueryData(userApiKeysQueryKey, context.previousKeys);
      }
      toast.error(error.message || "Failed to delete API key");
    },
  });

  const handleCopy = async (value: string, message = "API key copied") => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader icon={Key} label="Account" title="API Keys" headerTestId="api-keys.heading" />

      <Card className="p-6 space-y-3">
        <div className="text-sm text-muted-foreground leading-relaxed">
          API keys allow programmatic access to the API via the{" "}
          <code className="font-mono">x-api-key</code> header. Use them for MCP clients, scripts,
          and integrations. The full key is shown only once at creation — store it securely.
        </div>
      </Card>

      <Card className="p-6 hover:shadow-md">
        <ApiKeyForm
          onCreate={(values: ApiKeyFormValues) => createApiKeyMutation.mutate(values)}
          isPending={createApiKeyMutation.isPending}
        />
      </Card>

      {createdApiKey && (
        <ApiKeyReveal apiKey={createdApiKey} onDismiss={() => setCreatedApiKey(null)} />
      )}

      {apiKeys.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {apiKeys.map((key) => (
            <Card key={key.id} className="p-5 space-y-3 hover:shadow-md">
              <div className="space-y-1 min-w-0">
                <div className="font-medium text-foreground break-all">{key.name ?? "unnamed"}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {key.prefix ?? "api_"}...{key.start ?? ""}
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <div>created {new Date(key.createdAt).toLocaleString()}</div>
                {key.expiresAt && <div>expires {new Date(key.expiresAt).toLocaleString()}</div>}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => handleCopy(key.start || "", "Key prefix copied")}
                  variant="outline"
                  size="sm"
                >
                  copy id
                </Button>
                <Button
                  onClick={() => deleteApiKeyMutation.mutate(key.id)}
                  disabled={deleteApiKeyMutation.isPending}
                  variant="outline"
                  size="sm"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No API keys yet" />
      )}
    </div>
  );
}
