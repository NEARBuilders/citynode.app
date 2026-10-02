import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AuthClient } from "@/app";
import type { ApiKeyFormValues } from "@/components";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import type { CreatedOrganizationApiKey, OrganizationApiKey } from "./-api-keys-tab";
import { orgApiKeysQueryKey } from "./-organization-query-keys";

export function useOrganizationApiKeyActions(
  auth: AuthClient,
  orgId: string,
  onCreated: (apiKey: CreatedOrganizationApiKey) => void,
) {
  const translate = useAppTranslation();
  const queryClient = useQueryClient();
  const queryKey = orgApiKeysQueryKey(orgId);
  const createApiKeyMutation = useMutation({
    mutationFn: async (values: ApiKeyFormValues) => {
      const { data, error } = await auth.apiKey.create({
        configId: "org-keys",
        organizationId: orgId,
        name: values.name,
        ...(values.expiresIn !== undefined ? { expiresIn: values.expiresIn } : {}),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (data) => {
      if (data) onCreated(data as CreatedOrganizationApiKey);
      toast.success(translate("org.keyCreated"));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await auth.apiKey.delete({ keyId, configId: "org-keys" });
      if (error) throw new Error(error.message);
    },
    onMutate: async (keyId) => {
      await queryClient.cancelQueries({ queryKey });
      const previousKeys = queryClient.getQueryData<OrganizationApiKey[]>(queryKey);
      queryClient.setQueryData<OrganizationApiKey[]>(queryKey, (current) =>
        current?.filter((key) => key.id !== keyId),
      );
      return { previousKeys };
    },
    onSuccess: async () => {
      toast.success(translate("org.keyDeleted"));
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: Error, _keyId, context) => {
      if (context?.previousKeys) queryClient.setQueryData(queryKey, context.previousKeys);
      toast.error(appErrorMessage(error, translate));
    },
  });

  return { createApiKeyMutation, deleteApiKeyMutation };
}
