import { IdentificationCardIcon } from "@phosphor-icons/react";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppMessageId, AppTranslator } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { DiscoveryLoadError } from "./discovery-load-error";
import {
  emptyDiscoveryProfile,
  geocodeHintMessage,
  type DiscoveryProfile as Profile,
  ProfileFields,
  validateProfile,
} from "./profile-fields";

function profileSaveErrorMessage(error: unknown, t: AppTranslator) {
  return appErrorMessage(error, t, "community.saveError");
}

export function discoveryProfileQueryOptions(api: ApiClient, nodeId: string) {
  return queryOptions({
    queryKey: ["discovery-profile", nodeId],
    queryFn: () => api.getDiscoveryProfile({ nodeId }),
    retry: false,
  });
}

export function ProfileEditor({ nodeId }: { nodeId: string }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const query = useQuery(discoveryProfileQueryOptions(api, nodeId));
  if (query.isPending)
    return (
      <div className="flex flex-col gap-8">
        <Skeleton className="h-11 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (query.isError && query.data === undefined)
    return (
      <DiscoveryLoadError
        error={query.error}
        nodeId={nodeId}
        icon={IdentificationCardIcon}
        title={translate("community.loadProfileError")}
        onRetry={() => query.refetch()}
      />
    );
  return <ProfileForm key={nodeId} initial={query.data ?? emptyDiscoveryProfile(nodeId)} />;
}

function ProfileForm({ initial }: { initial: Profile }) {
  const translate = useAppTranslation();
  const [profile, setProfile] = useState(initial);
  const [validationError, setValidationError] = useState<AppMessageId | null>(null);
  const api = useApiClient();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.saveDiscoveryProfile(profile),
    onSuccess: (saved) => {
      setValidationError(null);
      setProfile(saved);
      if (saved.geocodeHint) {
        toast.warning(translate(geocodeHintMessage(saved.geocodeHint)));
      } else {
        toast.success(
          saved.published
            ? translate("community.profileSavedPublished")
            : translate("community.profileSaved"),
        );
      }
      return client.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).startsWith("discovery"),
      });
    },
    onError: (error: unknown) => toast.error(profileSaveErrorMessage(error, translate)),
  });
  return (
    <form
      className="flex max-w-2xl flex-col gap-10"
      noValidate
      data-testid="discovery-profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        const issue = validateProfile(profile);
        if (issue) {
          setValidationError(issue);
          toast.error(translate(issue));
          return;
        }
        setValidationError(null);
        save.mutate();
      }}
    >
      <ProfileFields profile={profile} onChange={setProfile} />

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          data-testid="discovery-profile-save"
          className="self-start"
          disabled={save.isPending}
        >
          {save.isPending ? translate("common.saving") : translate("community.saveProfile")}
        </Button>
        {(validationError || save.isError) && (
          <p
            role="alert"
            data-testid="discovery-profile-save-error"
            className="text-sm text-destructive"
          >
            {validationError
              ? translate(validationError)
              : profileSaveErrorMessage(save.error, translate)}
          </p>
        )}
      </div>
    </form>
  );
}
