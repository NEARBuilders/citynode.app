import { PencilSimpleIcon, SignOutIcon, TrashIcon } from "@phosphor-icons/react";
import { Trans } from "everything-dev/ui/i18n";
import { useState } from "react";
import type { Organization } from "@/app";
import { Badge, Button, ConfirmDialog, LocalDate, PageHeader } from "@/components";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAppTranslation } from "@/i18n/runtime";
import { roleLabel } from "./-org-avatar";
import { RowMenu } from "./-row-menu";

type PendingConfirm = "delete" | "leave" | null;

export function OrganizationOverview({
  canDelete,
  memberCount,
  myRole,
  isActive,
  isDeleting,
  isLeaving,
  isPersonal,
  isSwitching,
  onDelete,
  onEdit,
  onLeave,
  onSwitch,
  org,
}: {
  canDelete: boolean;
  memberCount: number;
  myRole?: string | null;
  isActive: boolean;
  isDeleting: boolean;
  isPersonal: boolean;
  isLeaving: boolean;
  isSwitching: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onLeave: () => void;
  onSwitch: () => void;
  org: Organization;
}) {
  const translate = useAppTranslation();
  const [confirming, setConfirming] = useState<PendingConfirm>(null);
  const canEdit = canDelete && !isPersonal;
  const canLeave = !isPersonal && !canDelete;
  const hasMenu = canEdit || canLeave;

  return (
    <>
      <PageHeader
        label={
          <span className="flex flex-wrap items-center gap-1.5" data-testid="org-badges">
            {myRole && <Badge variant="secondary">{roleLabel(myRole, translate)}</Badge>}
            {isActive && <Badge variant="success">{translate("common.active")}</Badge>}
            {isPersonal && <Badge variant="outline">{translate("org.personal")}</Badge>}
          </span>
        }
        title={org.name}
        description={
          <span className="text-base">
            <span className="font-mono break-all">@{org.slug}</span> ·{" "}
            {translate("org.memberCount", { count: memberCount })}
            {org.createdAt ? (
              <>
                {" "}
                ·{" "}
                <Trans
                  id="date.created"
                  components={{ date: <LocalDate value={org.createdAt} /> }}
                />
              </>
            ) : null}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {!isActive && (
              <Button onClick={onSwitch} disabled={isSwitching} data-testid="org-make-active">
                {translate(isSwitching ? "org.switching" : "org.makeActive")}
              </Button>
            )}
            {hasMenu && (
              <RowMenu label={translate("org.actions")} testId="org-actions-menu">
                {canEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <PencilSimpleIcon />
                    {translate("org.editDetails")}
                  </DropdownMenuItem>
                )}
                {canLeave && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setConfirming("leave")}
                    disabled={isLeaving}
                  >
                    <SignOutIcon />
                    {translate("org.leave")}
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setConfirming("delete")}
                      disabled={isDeleting}
                    >
                      <TrashIcon />
                      {translate("org.delete")}
                    </DropdownMenuItem>
                  </>
                )}
              </RowMenu>
            )}
          </div>
        }
      />
      <ConfirmDialog
        open={confirming === "delete"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={translate("common.deleteQuestion", { name: org.name ?? "" })}
        description={translate("org.deleteDescription")}
        confirmLabel={translate("org.deleteAction")}
        variant="destructive"
        isPending={isDeleting}
        onConfirm={() => {
          onDelete();
          setConfirming(null);
        }}
      />
      <ConfirmDialog
        open={confirming === "leave"}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={translate("org.leaveQuestion", { name: org.name ?? "" })}
        description={translate("org.leaveDescription")}
        confirmLabel="Leave"
        variant="destructive"
        isPending={isLeaving}
        onConfirm={() => {
          onLeave();
          setConfirming(null);
        }}
      />
    </>
  );
}
