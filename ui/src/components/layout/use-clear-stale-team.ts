import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { useAppTranslation } from "@/i18n/runtime";
import {
  createWorkspaceSynchronization,
  reportWorkspaceRefreshError,
} from "@/lib/workspace-synchronization";

export function useClearStaleTeam(staleTeamId: string | null) {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const synchronization = createWorkspaceSynchronization({ auth, queryClient, router });
  const attempted = useRef<string | null>(null);
  const reportError = (error: Error) => {
    if (reportWorkspaceRefreshError(error, () => synchronization.synchronize(), reportError))
      return;
    toast.error(translate("workspace.staleTeamError"), {
      id: "workspace-stale-team",
      action: { label: translate("common.retry"), onClick: () => mutate() },
    });
  };

  const { mutate } = useMutation({
    mutationFn: async () => {
      const { error } = await auth.organization.setActiveTeam({ teamId: null });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => synchronization.synchronize(),
    onError: reportError,
  });

  useEffect(() => {
    if (!staleTeamId) {
      attempted.current = null;
      return;
    }
    if (attempted.current === staleTeamId) return;
    attempted.current = staleTeamId;
    mutate();
  }, [staleTeamId, mutate]);
}
