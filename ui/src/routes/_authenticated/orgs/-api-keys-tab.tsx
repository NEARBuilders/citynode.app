import { CopyIcon, KeyIcon, TrashIcon } from "@phosphor-icons/react";
import { Trans } from "everything-dev/ui/i18n";
import { useState } from "react";
import {
  ApiKeyForm,
  type ApiKeyFormValues,
  ApiKeyReveal,
  type ApiKeyRevealProps,
  ConfirmDialog,
  EmptyState,
  LocalDate,
  SectionHeader,
  TabsContent,
} from "@/components";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { RowMenu } from "./-row-menu";

export type OrganizationApiKey = {
  id: string;
  name: string | null;
  prefix: string | null;
  start: string | null;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
  metadata?: Record<string, unknown> | null;
};

export type CreatedOrganizationApiKey = ApiKeyRevealProps["apiKey"];

export function ApiKeysTab({
  apiKeys,
  canManageMembers,
  createdApiKey,
  isCreating,
  isDeleting,
  onCopy,
  onCreate,
  onDelete,
  onDismiss,
}: {
  apiKeys: OrganizationApiKey[];
  canManageMembers: boolean;
  createdApiKey: CreatedOrganizationApiKey | null;
  isCreating: boolean;
  isDeleting: boolean;
  onCopy: (value: string, message: string) => void;
  onCreate: (values: ApiKeyFormValues) => void;
  onDelete: (id: string) => void;
  onDismiss: () => void;
}) {
  const translate = useAppTranslation();
  const [deleting, setDeleting] = useState<OrganizationApiKey | null>(null);

  return (
    <TabsContent value="apikeys" className="flex flex-col gap-6 pt-6">
      <SectionHeader
        title={translate("org.apiKeys")}
        description={translate("org.apiDescription")}
      />
      {canManageMembers && <ApiKeyForm onCreate={onCreate} isPending={isCreating} />}
      {createdApiKey && <ApiKeyReveal apiKey={createdApiKey} onDismiss={onDismiss} />}

      {apiKeys.length > 0 ? (
        <ItemGroup>
          {apiKeys.map((key, index) => (
            <div key={key.id} className="flex flex-col">
              {index > 0 && <ItemSeparator />}
              <Item size="sm" data-testid={`org-api-key-${key.id}`}>
                <ItemMedia variant="icon">
                  <KeyIcon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="break-all">
                    {key.name ?? translate("org.unnamedKey")}
                  </ItemTitle>
                  <ItemDescription>
                    <span className="font-mono break-all">
                      {key.prefix ?? "api_"}…{key.start ?? ""}
                    </span>{" "}
                    ·{" "}
                    <Trans
                      id="date.created"
                      components={{ date: <LocalDate value={key.createdAt} /> }}
                    />
                    {key.expiresAt ? (
                      <>
                        {" "}
                        ·{" "}
                        <Trans
                          id="date.expires"
                          components={{
                            date: <LocalDate value={key.expiresAt} format="relative" />,
                          }}
                        />
                      </>
                    ) : null}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <RowMenu label={translate("common.actionsNamed", { name: key.name ?? "key" })}>
                    <DropdownMenuItem
                      onClick={() => onCopy(key.start || "", translate("keys.prefixCopied"))}
                    >
                      <CopyIcon />
                      {translate("org.copyPrefix")}
                    </DropdownMenuItem>
                    {canManageMembers && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleting(key)}
                          disabled={isDeleting}
                        >
                          <TrashIcon />
                          {translate("org.deleteKey")}
                        </DropdownMenuItem>
                      </>
                    )}
                  </RowMenu>
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      ) : (
        <EmptyState icon={KeyIcon} title={translate("org.noKeys")} className="py-10" />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={translate("common.deleteQuestion", {
          name: deleting?.name ?? translate("org.thisKey"),
        })}
        description={translate("org.keyDeleteDescription")}
        confirmLabel={translate("org.deleteKey")}
        variant="destructive"
        isPending={isDeleting}
        onConfirm={() => {
          if (deleting) onDelete(deleting.id);
          setDeleting(null);
        }}
      />
    </TabsContent>
  );
}
