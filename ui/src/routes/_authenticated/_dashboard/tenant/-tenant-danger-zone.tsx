import { Trash2 } from "lucide-react";
import { Button, Card, ConfirmDialog, SectionHeader } from "@/components";

export function TenantDangerZone({
  isOwner,
  open,
  isPending,
  onOpen,
  onOpenChange,
  onConfirm,
}: {
  isOwner: boolean;
  open: boolean;
  isPending: boolean;
  onOpen: () => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <>
      {isOwner && (
        <section className="space-y-3">
          <SectionHeader title="Danger zone" />
          <Card className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Deleting a tenant suspends it immediately and permanently removes it after a 30-day
              grace period.
            </p>
            <Button variant="destructive" size="sm" onClick={onOpen} disabled={isPending}>
              <Trash2 className="h-3.5 w-3.5" />
              delete tenant
            </Button>
          </Card>
        </section>
      )}

      <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Delete this tenant?"
        description="The tenant will be suspended immediately and permanently deleted after 30 days. This cannot be undone."
        confirmLabel="delete tenant"
        variant="destructive"
        onConfirm={onConfirm}
        isPending={isPending}
      />
    </>
  );
}
