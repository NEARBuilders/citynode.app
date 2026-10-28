import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuthClient } from "@/app";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";
import { tenantQueryKeys } from "@/lib/queries/tenants";
import {
  createWorkspaceSynchronization,
  reportWorkspaceRefreshError,
} from "@/lib/workspace-synchronization";

export function useOpenSoleCommunity(organizationId: string | null) {
  const translate = useAppTranslation();
  const auth = useAuthClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const synchronization = createWorkspaceSynchronization({ auth, queryClient, router });
  const attempted = useRef<string | null>(null);
  const refresh = () =>
    synchronization.synchronize({ queryKeys: [["organizations"], tenantQueryKeys.all] });
  const reportError = (error: Error, id?: string) => {
    if (reportWorkspaceRefreshError(error, refresh, reportError)) return;
    toast.error(appErrorMessage(error, translate), {
      id: "workspace-open-community",
      action: {
        label: translate("common.retry"),
        onClick: () => {
          if (id) mutate(id);
        },
      },
    });
  };

  const { mutate } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await auth.organization.setActive({ organizationId: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => refresh(),
    onError: (error, id) => reportError(error, id),
  });

  useEffect(() => {
    if (!organizationId) {
      attempted.current = null;
      return;
    }
    if (attempted.current === organizationId) return;
    attempted.current = organizationId;
    mutate(organizationId);
  }, [organizationId, mutate]);
}
