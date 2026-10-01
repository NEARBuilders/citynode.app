import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import {
  createWorkspaceSynchronization,
  reportWorkspaceRefreshError,
} from "@/lib/workspace-synchronization";

export function useSwitchOrganization() {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const synchronization = createWorkspaceSynchronization({ auth, queryClient, router });
  const refresh = () => synchronization.synchronize({ queryKeys: [["organizations"]] });
  const reportError = (error: Error) => {
    if (reportWorkspaceRefreshError(error, refresh, reportError)) return;
    toast.error(appErrorMessage(error, translate));
  };

  const mutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const { error } = await auth.organization.setActive({ organizationId });
      if (error) throw new Error(error.message);
      const { error: teamError } = await auth.organization.setActiveTeam({ teamId: null });
      if (teamError) throw new Error(teamError.message);
    },
    onSuccess: async () => {
      await refresh();
      toast.success(translate("organization.switched"));
    },
    onError: reportError,
  });

  return {
    ...mutation,
    refreshWorkspace: refresh,
  };
}
