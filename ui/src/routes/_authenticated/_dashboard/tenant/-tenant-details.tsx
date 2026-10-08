import { ArrowRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { Badge, Button, Input, LocalDate, SectionHeader } from "@/components";
import { useAppTranslation } from "@/i18n/runtime";
import { presentationLabel } from "@/lib/presentation-label";
import { SettingsRow } from "./-settings-row";
import type { TenantRecord } from "./-tenant-types";

const STATUS_BADGE = {
  active: "success",
  suspended: "warning",
  pending_deletion: "destructive",
} as const;

export function TenantDetails({
  tenant,
  hostname,
  orgSlug,
  isOwner,
  editor,
}: {
  tenant: TenantRecord;
  hostname: string | null;
  orgSlug: string | null;
  isOwner: boolean;
  editor: {
    editing: boolean;
    name: string;
    isPending: boolean;
    onEdit: () => void;
    onCancel: () => void;
    onSave: () => void;
    onNameChange: (name: string) => void;
  };
}) {
  const translate = useAppTranslation();
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={translate("tenant.general")} sectionTestId="tenant.section.general" />
      <div className="flex flex-col">
        <SettingsRow
          label={translate("common.name")}
          action={
            isOwner && !editor.editing ? (
              <Button variant="ghost" size="sm" onClick={editor.onEdit}>
                {translate("tenant.rename")}
              </Button>
            ) : undefined
          }
        >
          {editor.editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                editor.onSave();
              }}
              className="flex max-w-md flex-wrap gap-2"
            >
              <Input
                id="tenant-edit-name"
                aria-label={translate("tenant.communityName")}
                value={editor.name}
                autoFocus
                onChange={(event) => editor.onNameChange(event.target.value)}
                className="min-w-0 flex-1"
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={editor.isPending || !editor.name.trim()}
              >
                {editor.isPending ? translate("common.saving") : translate("common.save")}
              </Button>
              <Button type="button" variant="ghost" onClick={editor.onCancel}>
                {translate("common.cancel")}
              </Button>
            </form>
          ) : (
            tenant.name
          )}
        </SettingsRow>
        <SettingsRow label={translate("common.status")}>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={STATUS_BADGE[tenant.status as keyof typeof STATUS_BADGE] ?? "secondary"}
              data-testid="tenant.status"
            >
              {presentationLabel(tenant.status, translate)}
            </Badge>
            <Badge variant="outline">
              {tenant.ownerKind === "dao"
                ? translate("tenant.daoOwned")
                : translate("tenant.platform")}
            </Badge>
          </span>
        </SettingsRow>
        <SettingsRow label={translate("common.address")}>
          <span className="font-mono break-all">{hostname ?? translate("tenant.notBound")}</span>
        </SettingsRow>
        <SettingsRow label={translate("common.account")}>
          <span className="font-mono break-all">{tenant.accountId}</span>
        </SettingsRow>
        <SettingsRow
          label={translate("common.organization")}
          description={translate("org.membersDescription")}
          action={
            orgSlug ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link to="/orgs/$slug" params={{ slug: orgSlug }} />}
                data-testid="tenant.open-organization"
              >
                {translate("nav.manage")}
                <ArrowRightIcon />
              </Button>
            ) : undefined
          }
        >
          <span className="font-mono break-all">{orgSlug ? `@${orgSlug}` : tenant.orgId}</span>
        </SettingsRow>
        <SettingsRow label={translate("things.created")}>
          <LocalDate value={tenant.createdAt} fallback="—" />
          {tenant.updatedAt ? (
            <span className="text-muted-foreground">
              {" "}
              ·{" "}
              <Trans
                id="date.updated"
                components={{ date: <LocalDate value={tenant.updatedAt} format="relative" /> }}
              />
            </span>
          ) : null}
        </SettingsRow>
      </div>
    </section>
  );
}
