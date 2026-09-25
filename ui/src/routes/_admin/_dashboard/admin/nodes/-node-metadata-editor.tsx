import { PencilIcon } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldLabel,
  Input,
  Textarea,
} from "@/components";
import { FieldGroup } from "@/components/ui/field";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { parseNodeMetadata } from "./-node-management";

type Node = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["node"];

export function NodeMetadataEditor({ node }: { node: Node }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)} data-testid="admin-node-edit">
        <PencilIcon /> Edit details
      </Button>
      {open && <MetadataForm node={node} onClose={() => setOpen(false)} />}
    </Dialog>
  );
}

function MetadataForm({ node, onClose }: { node: Node; onClose: () => void }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
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
      toast.success("Node updated");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogContent className="max-h-11/12 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit node</DialogTitle>
        <DialogDescription>Name, description and extra metadata.</DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) saveMutation.mutate();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="node-name">Name</FieldLabel>
            <Input
              id="node-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-description">Description</FieldLabel>
            <Textarea
              id="node-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="node-metadata">Extra metadata (JSON)</FieldLabel>
            <Textarea
              id="node-metadata"
              value={metadata}
              onChange={(event) => setMetadata(event.target.value)}
              rows={7}
              spellCheck={false}
              className="font-mono"
            />
          </Field>
        </FieldGroup>
        {saveMutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {saveMutation.error.message}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
