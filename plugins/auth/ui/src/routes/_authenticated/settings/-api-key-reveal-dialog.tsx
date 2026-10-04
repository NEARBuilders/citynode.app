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
import { useLoginTranslation } from "@/i18n/runtime";

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
  const translate = useLoginTranslation();
  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey.key);
      toast.success(translate("auth.keys.copied"));
    } catch {
      toast.error(translate("auth.keys.copyFailed"));
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
          <DialogTitle>{translate("auth.keys.revealTitle")}</DialogTitle>
          <DialogDescription>{translate("auth.keys.revealDescription")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <code
            className="block rounded-2xl bg-muted p-4 font-mono text-sm break-all text-foreground select-all"
            data-testid="api-keys.secret"
          >
            {apiKey?.key ?? ""}
          </code>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void handleCopy()}
            data-testid="api-keys.copy-button"
          >
            <CopyIcon data-icon="inline-start" />
            {translate("auth.keys.copy")}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onDismiss} data-testid="api-keys.reveal-done">
            {translate("auth.common.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
