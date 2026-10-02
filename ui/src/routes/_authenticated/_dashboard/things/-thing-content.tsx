import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import type { useApiClient } from "@/app";
import { Button, ConfirmDialog, InfoRow, LocalDate, SectionHeader } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";

type ApiClient = ReturnType<typeof useApiClient>;
type Thing = NonNullable<Awaited<ReturnType<ApiClient["template"]["getThing"]>>>;

export function ThingContent({
  thing,
  isAdmin,
  isDeletePending,
  onDelete,
}: {
  thing: Thing;
  isAdmin: boolean;
  isDeletePending: boolean;
  onDelete: () => void;
}) {
  const translate = useAppTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <section className="flex flex-col gap-6">
        <SectionHeader title={translate("things.payload")} />
        <pre
          className="overflow-x-auto rounded-2xl bg-muted p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-all text-foreground"
          data-testid="thing-payload"
        >
          {JSON.stringify(thing.payload, null, 2)}
        </pre>
      </section>

      <section className="flex flex-col gap-2">
        <SectionHeader title={translate("things.details")} />
        <div>
          <InfoRow
            label={translate("things.created")}
            value={<LocalDate value={thing.createdAt} format="datetime" />}
          />
          <InfoRow
            label={translate("things.updated")}
            value={<LocalDate value={thing.updatedAt} format="datetime" />}
          />
        </div>
      </section>

      {isAdmin && (
        <section className="flex flex-col gap-6" data-testid="thing-danger-zone">
          <SectionHeader title={translate("things.danger")} />
          <div className="flex flex-col gap-4 rounded-2xl border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {translate("things.deleteSection")}
              </span>
              <span className="text-sm text-muted-foreground">
                {translate("things.deleteDescription")}
              </span>
            </div>
            <Button
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={() => setConfirmOpen(true)}
              disabled={isDeletePending}
            >
              <TrashIcon />
              {isDeletePending ? translate("things.deleting") : translate("things.delete")}
            </Button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={translate("things.deleteTitle")}
        description={translate("things.removeNamed", { id: thing.thingId ?? "" })}
        confirmLabel="Delete"
        cancelLabel={translate("common.cancel")}
        variant="destructive"
        isPending={isDeletePending}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </>
  );
}
