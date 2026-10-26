import { IdentificationCardIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { Button, Field, FieldLabel, Input, Skeleton, Textarea } from "@/components";
import { DiscoveryLoadError } from "@/components/discovery/discovery-load-error";
import {
  type DiscoveryProfile,
  discoveryProfileQueryOptions,
  emptyProfile,
  geocodeHintMessage,
  ProfileFields,
  validateProfile,
} from "@/components/discovery/profile-editor";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppMessageId } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import { Disclosure } from "../-admin-ui";
import { CommunitySaveError, parseNodeMetadata, saveCommunity } from "./-node-management";

type Node = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["node"];

export function CommunityEditor({
  node,
  open,
  onOpenChange,
}: {
  node: Node;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const translate = useAppTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full gap-0 data-[side=right]:sm:max-w-2xl"
        data-testid="admin-community-editor"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle>{translate("admin.community.edit")}</SheetTitle>
          <SheetDescription>{translate("admin.community.editHint")}</SheetDescription>
        </SheetHeader>
        {open && <EditorBody node={node} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function EditorBody({ node, onDone }: { node: Node; onDone: () => void }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const hasProfile = !!node.tenantId;
  const profileQuery = useQuery({
    ...discoveryProfileQueryOptions(apiClient, node.id),
    enabled: hasProfile,
  });
  if (hasProfile && profileQuery.isPending) {
    return (
      <div className="flex flex-col gap-6 p-6" aria-busy="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (hasProfile && profileQuery.isError) {
    return (
      <div className="p-6">
        <DiscoveryLoadError
          error={profileQuery.error}
          nodeId={node.id}
          icon={IdentificationCardIcon}
          title={translate("community.loadProfileError")}
          onRetry={() => profileQuery.refetch()}
        />
      </div>
    );
  }
  return (
    <EditorForm
      node={node}
      initialProfile={hasProfile ? (profileQuery.data ?? emptyProfile(node.id)) : null}
      onDone={onDone}
    />
  );
}

function EditorForm({
  node,
  initialProfile,
  onDone,
}: {
  node: Node;
  initialProfile: DiscoveryProfile | null;
  onDone: () => void;
}) {
  const translate = useAppTranslation();
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
  const [profile, setProfile] = useState(initialProfile);
  const [validationError, setValidationError] = useState<AppMessageId | null>(null);

  const save = useMutation({
    mutationFn: () => saveCommunity(apiClient, node.id, { name, description, metadata, profile }),
    onSuccess: async ({ profile: saved }) => {
      if (saved?.geocodeHint) toast.warning(translate(geocodeHintMessage(saved.geocodeHint)));
      else toast.success(translate("admin.community.updated"));
      await Promise.all([
        invalidateNodeQueries(queryClient),
        queryClient.invalidateQueries({
          predicate: (query) => String(query.queryKey[0]).startsWith("discovery"),
        }),
      ]);
      onDone();
    },
    onError: async (error) => {
      if (error instanceof CommunitySaveError && error.stage === "profile") {
        await invalidateNodeQueries(queryClient);
      }
    },
  });

  const saveError = save.error
    ? save.error instanceof CommunitySaveError
      ? translate(
          save.error.stage === "profile"
            ? "admin.community.profileNotSaved"
            : "admin.community.detailsNotSaved",
          { reason: appErrorMessage(save.error.reason, translate) },
        )
      : appErrorMessage(save.error, translate)
    : null;

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      data-testid="admin-community-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        const issue: AppMessageId | null = !name.trim()
          ? "admin.community.nameRequired"
          : !isValidMetadata(metadata)
            ? "admin.community.metadataInvalid"
            : profile
              ? validateProfile(profile)
              : null;
        setValidationError(issue);
        if (!issue) save.mutate();
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto p-6">
        <Field>
          <FieldLabel htmlFor="node-name">{translate("common.name")}</FieldLabel>
          <Input
            id="node-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={validationError === "admin.community.nameRequired"}
            data-testid="admin-community-editor-name"
            required
          />
        </Field>

        {profile ? (
          <ProfileFields profile={profile} onChange={setProfile} />
        ) : (
          <p className="text-sm text-muted-foreground">{translate("admin.community.noProfile")}</p>
        )}

        <Disclosure
          label={translate("admin.community.showAdvanced")}
          openLabel={translate("admin.community.hideAdvanced")}
          testId="admin-community-editor-advanced"
        >
          <FieldSet>
            <FieldLegend className="sr-only">{translate("admin.community.advanced")}</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="node-description">
                  {translate("admin.community.adminNote")}
                </FieldLabel>
                <Textarea
                  id="node-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                />
                <FieldDescription>{translate("admin.community.adminNoteHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="node-metadata">
                  {translate("admin.community.extraMetadata")}
                </FieldLabel>
                <Textarea
                  id="node-metadata"
                  value={metadata}
                  onChange={(event) => setMetadata(event.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="font-mono"
                  aria-invalid={validationError === "admin.community.metadataInvalid"}
                />
              </Field>
            </FieldGroup>
          </FieldSet>
        </Disclosure>
      </div>

      <SheetFooter className="border-t border-border">
        {(validationError || saveError) && (
          <p
            role="alert"
            className="text-sm text-destructive"
            data-testid="admin-community-editor-error"
          >
            {validationError ? translate(validationError) : saveError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={save.isPending} data-testid="admin-node-edit-save">
            {save.isPending ? translate("common.saving") : translate("common.saveChanges")}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            {translate("common.cancel")}
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}

function isValidMetadata(raw: string) {
  try {
    parseNodeMetadata(raw, "");
    return true;
  } catch {
    return false;
  }
}
