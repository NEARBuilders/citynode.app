import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import type { AuthClient } from "@/app";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { orgMembersQueryKey } from "./-organization-query-keys";

type Router = ReturnType<typeof useRouter>;

export function useOrganizationSettings(
  auth: AuthClient,
  orgId: string,
  router: Router,
  onUpdated: () => void,
) {
  const translate = useAppTranslation();
  const queryClient = useQueryClient();
  const updateOrgMutation = useMutation({
    mutationFn: async ({ name, slug }: { name: string; slug: string }) => {
      const { error } = await auth.organization.update({
        organizationId: orgId,
        data: { name, slug },
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(translate("org.updated"));
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await queryClient.invalidateQueries({ queryKey: orgMembersQueryKey(orgId) });
      onUpdated();
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  const leaveOrgMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.organization.leave({ organizationId: orgId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(translate("org.left"));
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await router.navigate({ to: "/orgs" });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  const deleteOrgMutation = useMutation({
    mutationFn: async () => {
      const { error } = await auth.organization.delete({ organizationId: orgId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(translate("org.deleted"));
      await queryClient.invalidateQueries({ queryKey: ["organizations"] });
      await router.navigate({ to: "/orgs" });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });

  return { deleteOrgMutation, leaveOrgMutation, updateOrgMutation };
}
