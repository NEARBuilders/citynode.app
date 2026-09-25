import { CopyIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface CreatedApiKey {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  key: string;
  createdAt: string | Date;
}

export function ApiKeyRevealDialog({
  apiKey,
  onDismiss,
}: {
  apiKey: CreatedApiKey | null;
  onDismiss: () => void;
}) {
  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey.key);
      toast.success("API key copied");
    } catch {
      toast.error("Failed to copy API key");
    }
  };

  return (
    <Dialog
      open={!!apiKey}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent data-testid="api-keys.reveal">
        <DialogHeader>
          <DialogTitle>Copy your new key</DialogTitle>
          <DialogDescription>
            This is the only time you'll see {apiKey?.name ? `"${apiKey.name}"` : "this key"} in
            full. Store it somewhere safe.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="api-key-secret" className="sr-only">
            API key
          </FieldLabel>
          <div className="flex gap-2">
            <Input
              id="api-key-secret"
              readOnly
              value={apiKey?.key ?? ""}
              className="flex-1 font-mono"
              onFocus={(e) => e.target.select()}
              data-testid="api-keys.secret"
            />
            <Button variant="outline" onClick={() => void handleCopy()}>
              <CopyIcon data-icon="inline-start" />
              Copy
            </Button>
          </div>
        </Field>
        <DialogFooter>
          <Button onClick={onDismiss} data-testid="api-keys.reveal-done">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
