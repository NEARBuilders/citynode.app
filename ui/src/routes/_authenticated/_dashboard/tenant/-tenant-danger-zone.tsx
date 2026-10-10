import { useState } from "react";
import { Button, ConfirmDialog, SectionHeader } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { SettingsRow } from "./-settings-row";
import type { TenantAction, TenantRecord } from "./-tenant-types";

export function TenantDangerZone({
  tenant,
  isOwner,
  isAdmin,
  suspend,
  reactivate,
  open,
  isPending,
  onOpen,
  onOpenChange,
  onConfirm,
}: {
  tenant: TenantRecord;
  isOwner: boolean;
  isAdmin: boolean;
  suspend: TenantAction;
  reactivate: TenantAction;
  open: boolean;
  isPending: boolean;
  onOpen: () => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const translate = useAppTranslation();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const canSuspend = isAdmin && tenant.status === "active";
  const canReactivate = isAdmin && tenant.status === "suspended";
  const canDelete = isOwner && tenant.status === "active";

  return (
    <>
      {(canSuspend || canReactivate || canDelete) && (
        <section className="flex flex-col gap-2" data-testid="tenant.danger-zone">
          <SectionHeader title={translate("common.danger")} />
          <div className="flex flex-col rounded-2xl border border-destructive/30 px-4">
            {canSuspend && (
              <SettingsRow
                label={translate("tenant.suspendCommunity")}
                description={translate("tenant.suspendHint")}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSuspendOpen(true)}
                    disabled={suspend.isPending}
                  >
                    {translate("tenant.suspend")}
                  </Button>
                }
              />
            )}
            {canReactivate && (
              <SettingsRow
                label={translate("tenant.reactivateCommunity")}
                description={translate("tenant.reactivateHint")}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reactivate.mutate()}
                    disabled={reactivate.isPending}
                  >
                    {translate("tenant.reactivate")}
                  </Button>
                }
              />
            )}
            {canDelete && (
              <SettingsRow
                label={translate("tenant.deleteCommunity")}
                description={translate("tenant.deleteHint")}
                action={
                  <Button variant="destructive" size="sm" onClick={onOpen} disabled={isPending}>
                    {translate("tenant.deleteCommunity")}
                  </Button>
                }
              />
            )}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={translate("tenant.suspendQuestion", { name: tenant.name ?? "" })}
        description={translate("tenant.suspendDescription")}
        confirmLabel={translate("tenant.suspend")}
        variant="destructive"
        isPending={suspend.isPending}
        onConfirm={() => {
          suspend.mutate();
          setSuspendOpen(false);
        }}
      />
      <ConfirmDialog
        open={open}
        onOpenChange={onOpenChange}
        title={translate("common.deleteQuestion", { name: tenant.name ?? "" })}
        description={translate("tenant.deleteDescription")}
        confirmLabel={translate("tenant.deleteAction")}
        variant="destructive"
        onConfirm={onConfirm}
        isPending={isPending}
      />
    </>
  );
}
