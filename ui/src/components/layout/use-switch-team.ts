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

export function useSwitchTeam() {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const synchronization = createWorkspaceSynchronization({ auth, queryClient, router });
  const reportError = (error: Error) => {
    if (reportWorkspaceRefreshError(error, synchronization.synchronize, reportError)) return;
    toast.error(appErrorMessage(error, translate));
  };

  const mutation = useMutation({
    mutationFn: async (teamId: string | null) => {
      const { error } = await auth.organization.setActiveTeam({ teamId });
      if (error) throw new Error(error.message);
    },
    onSuccess: async (_, teamId) => {
      await synchronization.synchronize();
      toast.success(teamId ? translate("workspace.switched") : translate("workspace.allAreas"));
    },
    onError: reportError,
  });

  return {
    ...mutation,
    refreshWorkspace: synchronization.synchronize,
  };
}
