import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { Button, Field, FieldLabel, Input, Textarea } from "@/components";
import { FieldGroup } from "@/components/ui/field";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { parseNodeMetadata } from "./-node-management";

type Node = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["node"];

export function NodeMetadataForm({ node }: { node: Node }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(node.name);
  const [description, setDescription] = useState(
    typeof node.metadata.description === "string" ? node.metadata.description : "",
  );
  const [metadata, setMetadata] = useState(() => {
    const { description: _, ...additional } = node.metadata;
    return JSON.stringify(additional, null, 2);
  });
  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.updateNode({
        nodeId: node.id,
        name: name.trim(),
        metadata: parseNodeMetadata(metadata, description),
      }),
    onSuccess: async () => {
      await invalidateNodeQueries(queryClient);
      toast.success(translate("admin.community.updated"));
      await navigate({ to: "/admin/nodes/$nodeId", params: { nodeId: node.id }, search: {} });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) saveMutation.mutate();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="node-name">{translate("common.name")}</FieldLabel>
          <Input
            id="node-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="node-description">{translate("common.description")}</FieldLabel>
          <Textarea
            id="node-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="node-metadata">
            {translate("admin.community.extraMetadata")}
          </FieldLabel>
          <Textarea
            id="node-metadata"
            value={metadata}
            onChange={(event) => setMetadata(event.target.value)}
            rows={10}
            spellCheck={false}
            className="font-mono"
          />
        </Field>
      </FieldGroup>
      {saveMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {appErrorMessage(saveMutation.error, translate)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          data-testid="admin-node-edit-save"
          disabled={!name.trim() || saveMutation.isPending}
        >
          {saveMutation.isPending ? translate("common.saving") : translate("common.saveChanges")}
        </Button>
        <Button
          variant="ghost"
          nativeButton={false}
          render={<Link to="/admin/nodes/$nodeId" params={{ nodeId: node.id }} search={{}} />}
        >
          {translate("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
