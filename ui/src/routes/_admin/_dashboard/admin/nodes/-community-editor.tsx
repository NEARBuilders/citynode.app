import { IdentificationCardIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { Button, Field, FieldLabel, Input, Skeleton, Textarea } from "@/components";
import { DiscoveryLoadError } from "@/components/discovery/discovery-load-error";
import { discoveryProfileQueryOptions } from "@/components/discovery/profile-editor";
import {
  type DiscoveryProfile,
  emptyDiscoveryProfile,
  geocodeHintMessage,
  ProfileFields,
} from "@/components/discovery/profile-fields";
import {
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppMessageId } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { invalidateNodeQueries } from "@/lib/queries/nodes";
import {
  type CommunityDraft,
  type CommunityDraftField,
  type CommunitySaveReady,
  communityDraftFrom,
  planCommunitySave,
  saveCommunityEdits,
} from "./-community-edit";

type Node = Awaited<ReturnType<ApiClient["getNodeSummary"]>>["node"];

export function CommunityEditorSheet({
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
        side="right"
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
        data-testid="admin-node-editor"
      >
        <SheetHeader className="px-6 pt-8 pr-16">
          <SheetTitle>{translate("admin.community.edit")}</SheetTitle>
          <SheetDescription>{translate("admin.community.editHint")}</SheetDescription>
        </SheetHeader>
        {open && <CommunityEditorBody node={node} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function CommunityEditorBody({ node, onDone }: { node: Node; onDone: () => void }) {
  const api = useApiClient();
  const hasSite = !!node.tenantId;
  const profileQuery = useQuery({
    ...discoveryProfileQueryOptions(api, node.id),
    enabled: hasSite,
  });
  if (!hasSite)
    return (
      <CommunityEditorForm
        node={node}
        profile={null}
        profileError={null}
        onRetryProfile={() => undefined}
        onDone={onDone}
      />
    );
  if (profileQuery.isPending)
    return (
      <div className="flex flex-col gap-6 px-6 pb-8" aria-busy="true">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  const profileFailed = profileQuery.isError && profileQuery.data === undefined;
  return (
    <CommunityEditorForm
      key={`${node.id}:${profileFailed ? "error" : "ready"}`}
      node={node}
      profile={profileFailed ? null : (profileQuery.data ?? emptyDiscoveryProfile(node.id))}
      profileError={profileFailed ? profileQuery.error : null}
      onRetryProfile={() => profileQuery.refetch()}
      onDone={onDone}
    />
  );
}

function CommunityEditorForm({
  node,
  profile,
  profileError,
  onRetryProfile,
  onDone,
}: {
  node: Node;
  profile: DiscoveryProfile | null;
  profileError: unknown;
  onRetryProfile: () => void;
  onDone: () => void;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [initial, setInitial] = useState(() => communityDraftFrom(node, profile));
  const [draft, setDraft] = useState<CommunityDraft>(initial);
  const [invalid, setInvalid] = useState<{
    field: CommunityDraftField;
    issue: AppMessageId;
  } | null>(null);
  const update = (patch: Partial<CommunityDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const save = useMutation({
    mutationFn: (plan: CommunitySaveReady) => saveCommunityEdits(api, plan),
    onSuccess: async (result, plan) => {
      const savedProfile = result.savedProfile;
      setInitial({
        ...(result.nodeError
          ? initial
          : { ...draft, name: draft.name.trim(), description: draft.description.trim() }),
        profile: result.profileError ? initial.profile : (savedProfile ?? draft.profile),
      });
      if (savedProfile) update({ profile: savedProfile });
      await Promise.all([
        plan.node && !result.nodeError ? invalidateNodeQueries(queryClient) : null,
        plan.profile && !result.profileError
          ? queryClient.invalidateQueries({
              predicate: (q) => String(q.queryKey[0]).startsWith("discovery"),
            })
          : null,
      ]);
      if (result.nodeError || result.profileError) {
        toast.error(translate("admin.community.saveFailed"));
        return;
      }
      if (savedProfile?.geocodeHint)
        toast.warning(translate(geocodeHintMessage(savedProfile.geocodeHint)));
      else toast.success(translate("admin.community.updated"));
      onDone();
    },
  });

  const result = save.data;
  const submit = () => {
    const plan = planCommunitySave(node.id, initial, draft);
    if (!plan.ok) {
      setInvalid({ field: plan.field, issue: plan.issue });
      return;
    }
    setInvalid(null);
    if (!plan.node && !plan.profile) {
      onDone();
      return;
    }
    save.mutate(plan);
  };

  return (
    <form
      className="flex flex-col gap-10 px-6 pb-8"
      noValidate
      data-testid="admin-node-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <FieldSet>
        <FieldLegend>{translate("common.details")}</FieldLegend>
        <FieldGroup>
          <Field data-invalid={invalid?.field === "name" || undefined}>
            <FieldLabel htmlFor="node-name">{translate("common.name")}</FieldLabel>
            <Input
              id="node-name"
              data-testid="admin-node-editor-name"
              value={draft.name}
              aria-invalid={invalid?.field === "name" || undefined}
              onChange={(event) => update({ name: event.target.value })}
              required
            />
            {invalid?.field === "name" && <FieldError>{translate(invalid.issue)}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="node-description">
              {translate("admin.community.adminNote")}
            </FieldLabel>
            <Textarea
              id="node-description"
              data-testid="admin-node-editor-note"
              value={draft.description}
              onChange={(event) => update({ description: event.target.value })}
              rows={3}
            />
            <FieldDescription>{translate("admin.community.adminNoteHint")}</FieldDescription>
          </Field>
          <Field data-invalid={invalid?.field === "metadata" || undefined}>
            <FieldLabel htmlFor="node-metadata">
              {translate("admin.community.extraMetadata")}
            </FieldLabel>
            <Textarea
              id="node-metadata"
              data-testid="admin-node-editor-metadata"
              value={draft.metadata}
              aria-invalid={invalid?.field === "metadata" || undefined}
              onChange={(event) => update({ metadata: event.target.value })}
              rows={8}
              spellCheck={false}
              className="font-mono"
            />
            {invalid?.field === "metadata" && <FieldError>{translate(invalid.issue)}</FieldError>}
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>{translate("admin.community.publicProfile")}</FieldLegend>
        <FieldDescription>{translate("admin.community.publicProfileHint")}</FieldDescription>
        {draft.profile ? (
          <FieldGroup>
            <ProfileFields profile={draft.profile} onChange={(next) => update({ profile: next })} />
            {invalid?.field === "profile" && <FieldError>{translate(invalid.issue)}</FieldError>}
          </FieldGroup>
        ) : !node.tenantId ? (
          <p className="text-sm text-muted-foreground" data-testid="admin-node-editor-no-site">
            {translate("admin.community.noSiteProfile")}
          </p>
        ) : (
          <DiscoveryLoadError
            error={profileError}
            nodeId={node.id}
            icon={IdentificationCardIcon}
            title={translate("community.loadProfileError")}
            onRetry={onRetryProfile}
          />
        )}
      </FieldSet>

      <div className="flex flex-col gap-3">
        {(result?.nodeError || result?.profileError || save.isError) && (
          <div
            role="alert"
            data-testid="admin-node-editor-error"
            className="flex flex-col gap-1 text-sm text-destructive"
          >
            {result?.nodeError ? (
              <p>
                {translate("admin.community.detailsNotSaved", {
                  reason: appErrorMessage(result.nodeError, translate),
                })}
              </p>
            ) : null}
            {result?.profileError ? (
              <p>
                {translate("admin.community.profileNotSaved", {
                  reason: appErrorMessage(result.profileError, translate, "community.saveError"),
                })}
              </p>
            ) : null}
            {save.isError ? <p>{appErrorMessage(save.error, translate)}</p> : null}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" data-testid="admin-node-editor-save" disabled={save.isPending}>
            {save.isPending ? translate("common.saving") : translate("common.saveChanges")}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            {translate("common.cancel")}
          </Button>
        </div>
      </div>
    </form>
  );
}
