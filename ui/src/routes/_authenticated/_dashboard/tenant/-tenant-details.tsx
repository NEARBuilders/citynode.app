import { PencilIcon } from "@phosphor-icons/react";
import { buildRegistryConfigUrl } from "everything-dev/fastkv";
import {
  Button,
  Card,
  CardContent,
  Field,
  FieldLabel,
  InfoRow,
  Input,
  SectionHeader,
} from "@/components";
import type { TenantRecord } from "./-tenant-types";

export function TenantDetails({
  tenant,
  hostname,
  gatewayId,
  isOwner,
  editor,
}: {
  tenant: TenantRecord;
  hostname: string | null;
  gatewayId: string;
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
  const isDaoOwned = tenant.ownerKind === "dao";
  const bosUrl = `bos://${tenant.accountId}/${gatewayId}`;
  const fastKvUrl = buildRegistryConfigUrl(tenant.accountId, gatewayId);
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Details"
        action={
          isOwner && !editor.editing ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                editor.onEdit();
              }}
            >
              <PencilIcon className="h-3.5 w-3.5" />
              edit
            </Button>
          ) : undefined
        }
      />
      <Card>
        <CardContent className="p-6 space-y-4">
          {editor.editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                editor.onSave();
              }}
              className="space-y-4"
            >
              <Field className="max-w-xs">
                <FieldLabel htmlFor="tenant-edit-name">name</FieldLabel>
                <Input
                  id="tenant-edit-name"
                  value={editor.name}
                  onChange={(e) => editor.onNameChange(e.target.value)}
                />
              </Field>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={editor.isPending}>
                  save
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={editor.onCancel}>
                  cancel
                </Button>
              </div>
            </form>
          ) : (
            <>
              <InfoRow label="name" value={tenant.name} />
              <InfoRow label="hostname" value={hostname ?? "—"} mono />
              <InfoRow label="account" value={tenant.accountId} mono />
              <InfoRow label="owner kind" value={isDaoOwned ? "dao" : "platform"} />
              <InfoRow
                label="registry"
                value={
                  bosUrl && fastKvUrl ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-xs">{bosUrl}</code>
                      <a
                        href={fastKvUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                      >
                        view published config on FastKV
                      </a>
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoRow label="org id" value={tenant.orgId} mono />
              <InfoRow label="status" value={tenant.status} />
              <InfoRow
                label="created"
                value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
              />
              <InfoRow
                label="updated"
                value={tenant.updatedAt ? new Date(tenant.updatedAt).toLocaleString() : "—"}
              />
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
