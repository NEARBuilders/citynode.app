import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { useApiClient } from "@/app";
import { ConnectDao } from "@/components/connect-dao";
import { appErrorMessage } from "@/i18n/error-message";
import { useAppTranslation } from "@/i18n/runtime";

export function LinkTreasury({ organizationId }: { organizationId: string }) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const linked = useRef<string | null>(null);
  const link = useMutation({
    mutationFn: (daoAccountId: string) =>
      api.auth.linkDao({ organizationId, daoAccountId, daoNetwork: "mainnet" }),
    onSuccess: (_, daoAccountId) => {
      toast.success(translate("treasury.linked", { dao: daoAccountId }));
      return queryClient.invalidateQueries({ queryKey: ["org-dao", organizationId] });
    },
    onError: (error: Error) => {
      linked.current = null;
      toast.error(appErrorMessage(error, translate));
    },
  });

  return (
    <div className="flex flex-col gap-3" data-testid="dashboard-node.link-treasury">
      <p className="text-sm text-muted-foreground">{translate("treasury.linkHint")}</p>
      <ConnectDao
        purpose="community-settings"
        onVerified={({ daoAccountId }) => {
          if (linked.current === daoAccountId) return;
          linked.current = daoAccountId;
          link.mutate(daoAccountId);
        }}
      />
    </div>
  );
}
