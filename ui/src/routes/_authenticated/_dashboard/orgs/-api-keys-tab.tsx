import { TrashIcon } from "@phosphor-icons/react";
import {
  ApiKeyForm,
  type ApiKeyFormValues,
  ApiKeyReveal,
  type ApiKeyRevealProps,
  Button,
  Card,
  TabsContent,
} from "@/components";
import { OrganizationEmptyState } from "./-empty-state";

export type OrganizationApiKey = {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
};

export type CreatedOrganizationApiKey = ApiKeyRevealProps["apiKey"];

export function ApiKeysTab({
  apiKeys,
  canManageMembers,
  createdApiKey,
  isCreating,
  isDeleting,
  onCopy,
  onCreate,
  onDelete,
  onDismiss,
}: {
  apiKeys: OrganizationApiKey[];
  canManageMembers: boolean;
  createdApiKey: CreatedOrganizationApiKey | null;
  isCreating: boolean;
  isDeleting: boolean;
  onCopy: (value: string, message: string) => void;
  onCreate: (values: ApiKeyFormValues) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
}) {
  return (
    <TabsContent value="apikeys" className="space-y-6 pt-4">
      {canManageMembers && (
        <Card className="p-6">
          <ApiKeyForm onCreate={onCreate} isPending={isCreating} />
        </Card>
      )}

      {createdApiKey && <ApiKeyReveal apiKey={createdApiKey} onDismiss={onDismiss} />}

      {apiKeys.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {apiKeys.map((key) => (
            <Card key={key.id} className="flex flex-col gap-3 p-5">
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
                  onClick={() => onCopy(key.start || "", "Key prefix copied")}
                  variant="outline"
                >
                  copy id
                </Button>
                {canManageMembers && (
                  <Button onClick={() => onDelete(key.id)} disabled={isDeleting} variant="outline">
                    <TrashIcon className="h-3.5 w-3.5" />
                    delete
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <OrganizationEmptyState label="No API keys" />
      )}
    </TabsContent>
  );
}
