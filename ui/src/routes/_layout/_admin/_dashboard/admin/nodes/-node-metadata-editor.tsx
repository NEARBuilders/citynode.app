import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
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
  Input,
  Label,
  Textarea,
} from "@/components";
import { parseNodeMetadata, refreshNodeQueries } from "./-node-management";

type Node = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["node"];

export function NodeMetadataEditor({ node }: { node: Node }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> edit metadata
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
      await refreshNodeQueries(queryClient);
      toast.success("Node metadata updated");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Edit node metadata</DialogTitle>
        <DialogDescription>
          Update the node name, description, and additional JSON fields.
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) saveMutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="node-name">Name</Label>
          <Input
            id="node-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="node-description">Description</Label>
          <Textarea
            id="node-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Stored in metadata.description.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="node-metadata">Additional metadata (JSON)</Label>
          <Textarea
            id="node-metadata"
            className="font-mono text-sm"
            value={metadata}
            onChange={(event) => setMetadata(event.target.value)}
            rows={7}
            spellCheck={false}
          />
        </div>
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
            cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || saveMutation.isPending}>
            {saveMutation.isPending ? "saving..." : "save changes"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
